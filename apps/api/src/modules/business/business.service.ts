import { posSnapshot } from "./pos.engine";
import {
  Injectable,
  Inject,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { RlsPostgresService } from "../../database/rls-postgres.service";
import { TenantContextService } from "../../common/tenant-context";
import {
  emptyBusiness,
  applyBusiness,
  visibleBusiness,
} from "./business.engine";
import { BusinessCommand } from "./business.schema";
import type { BusinessState, TenantContext } from "@saas/types";

@Injectable()
export class BusinessService {
  constructor(
    @Inject(RlsPostgresService) private readonly db: RlsPostgresService,
  ) {}
  private identity(tenant: TenantContext) {
    const user = TenantContextService.get()?.user;
    if (!user?.userId) throw new ForbiddenException();
    return {
      userId: user.userId,
      owner: user.isPlatformAdmin || tenant.roles.includes("Owner"),
      hrAccess:
        user.isPlatformAdmin ||
        tenant.roles.includes("Owner") ||
        tenant.permissions.includes("hr:manage"),
    };
  }
  private hrCompanies(tenant: TenantContext, state: BusinessState) {
    const { userId, hrAccess } = this.identity(tenant);
    return state.companies
      .filter(
        (c) =>
          hrAccess ||
          state.access.some(
            (g) =>
              g.companyId === c.id &&
              g.userId === userId &&
              g.membershipId === tenant.membershipId &&
              g.role === "HR",
          ),
      )
      .map((c) => c.id);
  }
  async version(tenant: TenantContext) {
    const { userId, owner } = this.identity(tenant);
    const r = await this.db.queryInTenantContext(
      tenant.tenantId,
      "SELECT version FROM business_ledgers WHERE tenant_id=$1",
      [tenant.tenantId],
    );
    const scopeTag = createHash("sha256")
      .update(
        JSON.stringify([
          userId,
          owner,
          tenant.membershipId,
          [...tenant.roles].sort(),
          [...tenant.permissions].sort(),
        ]),
      )
      .digest("hex");
    return { version: Number(r.rows[0]?.version || 0), scopeTag };
  }
  async snapshot(tenant: TenantContext) {
    const { userId, owner, hrAccess } = this.identity(tenant);
    const result = await this.db.queryInTenantContext(
      tenant.tenantId,
      "SELECT version, state FROM business_ledgers WHERE tenant_id=$1",
      [tenant.tenantId],
    );
    return {
      version: Number(result.rows[0]?.version || 0),
      state: visibleBusiness(
        result.rows[0]?.state || emptyBusiness(),
        userId,
        owner,
        tenant.membershipId,
        hrAccess,
      ),
      holdingOwner: owner,
      hrAccess:
        this.hrCompanies(tenant, result.rows[0]?.state || emptyBusiness())
          .length > 0,
      hrCompanyIds: this.hrCompanies(
        tenant,
        result.rows[0]?.state || emptyBusiness(),
      ),
      userId,
    };
  }
  async pos(tenant: TenantContext) {
    const { userId, owner, hrAccess } = this.identity(tenant);
    const r = await this.db.queryInTenantContext(
      tenant.tenantId,
      "SELECT version,state FROM business_ledgers WHERE tenant_id=$1",
      [tenant.tenantId],
    );
    return posSnapshot(
      r.rows[0]?.state || emptyBusiness(),
      Number(r.rows[0]?.version || 0),
      userId,
      owner,
      tenant.membershipId,
    );
  }
  async execute(
    tenant: TenantContext,
    command: BusinessCommand,
    forPos = false,
  ) {
    const { userId, owner, hrAccess } = this.identity(tenant);
    return this.db.runInTenantContext(tenant.tenantId, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
        [tenant.tenantId],
      );
      const holding = await client.query(
        "SELECT status FROM tenants WHERE id=$1",
        [tenant.tenantId],
      );
      if (holding.rows[0]?.status !== "ACTIVE")
        throw new ForbiddenException(
          "Holding suspendue, archivée ou supprimée",
        );
      await client.query(
        "INSERT INTO business_ledgers (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING",
        [tenant.tenantId],
      );
      const { rows } = await client.query(
        "SELECT version,state FROM business_ledgers WHERE tenant_id=$1 FOR UPDATE",
        [tenant.tenantId],
      );
      if (
        command.action.type.startsWith("hr.") &&
        (!("companyId" in command.action) ||
          !this.hrCompanies(tenant, rows[0].state).includes(
            command.action.companyId,
          ))
      )
        throw new ForbiddenException(
          "Permission RH requise dans cette société",
        );
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(command.action))
        .digest("hex");
      const previous = await client.query(
        "SELECT actor_id,payload_hash FROM business_commands WHERE tenant_id=$1 AND id=$2",
        [tenant.tenantId, command.commandId],
      );
      if (previous.rows.length) {
        if (
          previous.rows[0].actor_id !== userId ||
          previous.rows[0].payload_hash !== fingerprint
        )
          throw new ConflictException("Identifiant de commande déjà utilisé");
        if (forPos)
          return posSnapshot(
            rows[0].state,
            Number(rows[0].version),
            userId,
            owner,
            tenant.membershipId,
          );
        return {
          version: Number(rows[0].version),
          state: visibleBusiness(
            rows[0].state,
            userId,
            owner,
            tenant.membershipId,
            hrAccess,
          ),
          holdingOwner: owner,
          hrAccess: this.hrCompanies(tenant, rows[0].state).length > 0,
          hrCompanyIds: this.hrCompanies(tenant, rows[0].state),
          userId,
        };
      }
      if (Number(rows[0].version) !== command.version)
        throw new ConflictException(
          "Les données ont changé. Actualisez avant de recommencer.",
        );
      let targetMembershipId: string | undefined;
      if (command.action.type === "access.grant") {
        const member = await client.query(
          "SELECT id FROM memberships WHERE tenant_id=$1 AND user_id=$2 AND status='ACTIVE'",
          [tenant.tenantId, command.action.userId],
        );
        if (!member.rows.length)
          throw new BadRequestException(
            "Invitez et activez ce membre avant de lui attribuer une société",
          );
        targetMembershipId = member.rows[0].id;
      }
      // A contract effective on the first day of the payroll month supplies the salary.
      // No automatic prorating or statutory payroll is claimed by this cost tracker.
      if (command.action.type === "hr.payroll.record") {
        const a = command.action;
        const contracts = await client.query(
          "SELECT monthly_gross_minor,currency FROM hr_contracts WHERE tenant_id=$1 AND company_id=$2 AND employee_id=$3 AND start_date<=$4::date AND (end_date IS NULL OR end_date>=$4::date) ORDER BY start_date DESC,created_at DESC LIMIT 1",
          [tenant.tenantId, a.companyId, a.employeeId, a.period + "-01"],
        );
        const employee = (rows[0].state as BusinessState).employees?.find(
          (e) => e.id === a.employeeId && e.companyId === a.companyId,
        );
        const company = (rows[0].state as BusinessState).companies.find(
          (c) => c.id === a.companyId,
        );
        if (employee && contracts.rows.length) {
          if (contracts.rows[0].currency !== company?.currency)
            throw new BadRequestException(
              "Devise du contrat différente de celle de la société",
            );
          employee.grossSalary = Number(contracts.rows[0].monthly_gross_minor);
        }
      }
      const state = applyBusiness(
        rows[0].state as BusinessState,
        command.action,
        userId,
        owner,
        new Date().toISOString(),
        tenant.membershipId,
      );
      if (command.action.type === "access.grant") {
        const action = command.action;
        const grant = state.access.find(
          (g) => g.companyId === action.companyId && g.userId === action.userId,
        );
        if (grant) grant.membershipId = targetMembershipId;
      }
      if (command.action.type === "hr.employee.create") {
        const e = state.employees![state.employees!.length - 1];
        await client.query(
          "INSERT INTO hr_employees(id,tenant_id,company_id,display_name,start_date) VALUES($1,$2,$3,$4,$5)",
          [e.id, tenant.tenantId, e.companyId, e.fullName, e.hiredAt],
        );
        await client.query(
          "INSERT INTO hr_contracts(id,tenant_id,company_id,employee_id,start_date,monthly_gross_minor,currency) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            randomUUID(),
            tenant.tenantId,
            e.companyId,
            e.id,
            e.hiredAt,
            e.grossSalary,
            state.companies.find((c) => c.id === e.companyId)!.currency,
          ],
        );
      }
      if (
        command.action.type === "hr.employee.status" ||
        command.action.type === "hr.employee.update"
      ) {
        const a = command.action,
          e = state.employees!.find(
            (e) => e.id === a.employeeId && e.companyId === a.companyId,
          )!;
        await client.query(
          "UPDATE hr_employees SET display_name=$4,end_date=$5 WHERE tenant_id=$1 AND company_id=$2 AND id=$3",
          [
            tenant.tenantId,
            e.companyId,
            e.id,
            e.fullName,
            e.status === "INACTIVE"
              ? new Date().toISOString().slice(0, 10)
              : null,
          ],
        );
      }
      const encoded = JSON.stringify(state);
      if (Buffer.byteLength(encoded) > 8 * 1024 * 1024)
        throw new BadRequestException(
          "Limite de ce pilote atteinte (8 Mo par holding). Archivage nécessaire.",
        );
      await client.query(
        "UPDATE business_ledgers SET state=$2::jsonb,version=version+1,updated_at=NOW() WHERE tenant_id=$1",
        [tenant.tenantId, encoded],
      );
      await client.query(
        "INSERT INTO business_commands (tenant_id,id,actor_id,payload_hash) VALUES ($1,$2,$3,$4)",
        [tenant.tenantId, command.commandId, userId, fingerprint],
      );
      await client.query(
        "INSERT INTO audit_logs (id,tenant_id,actor_id,action,resource_type,resource_id,payload) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [
          randomUUID(),
          tenant.tenantId,
          userId,
          command.action.type,
          "business",
          "companyId" in command.action
            ? command.action.companyId
            : state.companies[state.companies.length - 1].id,
          JSON.stringify({
            commandId: command.commandId,
            version: Number(rows[0].version) + 1,
          }),
        ],
      );
      if (forPos)
        return posSnapshot(
          state,
          Number(rows[0].version) + 1,
          userId,
          owner,
          tenant.membershipId,
        );
      return {
        version: Number(rows[0].version) + 1,
        state: visibleBusiness(
          state,
          userId,
          owner,
          tenant.membershipId,
          hrAccess,
        ),
        holdingOwner: owner,
        hrAccess: this.hrCompanies(tenant, state).length > 0,
        hrCompanyIds: this.hrCompanies(tenant, state),
        userId,
      };
    });
  }
}
