import {
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { RlsPostgresService } from "../../database/rls-postgres.service";
import { TenantContextService } from "../../common/tenant-context";
import type { TenantContext } from "@saas/types";
import {
  validatePeriod,
  validateContract,
  requestLeave,
  decideLeave,
  type Employee,
  type HrScope,
  type LeaveRequest,
} from "./hr.domain";

@Injectable()
export class HrService {
  constructor(
    @Inject(RlsPostgresService) private readonly db: RlsPostgresService,
  ) {}

  async companies(tenant: TenantContext) {
    const user = TenantContextService.get()?.user;
    if (!user?.userId) throw new ForbiddenException();
    const row = await this.db.queryInTenantContext(
      tenant.tenantId,
      "SELECT jsonb_build_object('companies',state->'companies','access',state->'access') AS state FROM business_ledgers WHERE tenant_id=$1",
      [tenant.tenantId],
    );
    const state = row.rows[0]?.state;
    const linked = await this.db.queryInTenantContext(
      tenant.tenantId,
      "SELECT DISTINCT company_id FROM hr_employees WHERE tenant_id=$1 AND user_id=$2",
      [tenant.tenantId, user.userId],
    );
    const ids = new Set(
      linked.rows.map((r: { company_id: string }) => r.company_id),
    );
    for (const g of state?.access || [])
      if (
        g.userId === user.userId &&
        g.membershipId === tenant.membershipId &&
        ["MANAGER", "OPERATIONS", "FINANCE", "HR"].includes(g.role)
      )
        ids.add(g.companyId);
    return (state?.companies || [])
      .filter(
        (c: { id: string; status?: string; modules: string[] }) =>
          (!c.status || c.status === "ACTIVE") &&
          c.modules.includes("hr") &&
          (user.isPlatformAdmin ||
            tenant.roles.includes("Owner") ||
            ids.has(c.id)),
      )
      .map((c: { id: string; name: string; currency: string }) => ({
        id: c.id,
        name: c.name,
        currency: c.currency,
      }));
  }
  private async scope(
    tenant: TenantContext,
    companyId: string,
  ): Promise<HrScope> {
    const user = TenantContextService.get()?.user;
    if (!user?.userId) throw new ForbiddenException();
    const ledger = await this.db.queryInTenantContext(
      tenant.tenantId,
      "SELECT jsonb_build_object('companies',state->'companies','access',state->'access') AS state FROM business_ledgers WHERE tenant_id=$1",
      [tenant.tenantId],
    );
    const state = ledger.rows[0]?.state;
    if (
      !state?.companies?.some(
        (company: { id: string }) => company.id === companyId,
      )
    )
      throw new NotFoundException("Company not found");
    const company = state.companies.find(
      (c: { id: string }) => c.id === companyId,
    );
    if (company.status && company.status !== "ACTIVE")
      throw new ForbiddenException("Société inactive");
    if (company.modules && !company.modules.includes("hr"))
      throw new ForbiddenException("Module RH désactivé");
    const owner = user.isPlatformAdmin || tenant.roles.includes("Owner");
    const grant = state.access?.find(
      (item: {
        companyId: string;
        userId: string;
        membershipId?: string;
        role: string;
      }) =>
        item.companyId === companyId &&
        item.userId === user.userId &&
        item.membershipId === tenant.membershipId,
    );
    const role =
      owner ||
      grant?.role === "HR" ||
      (["MANAGER", "FINANCE"].includes(grant?.role || "") &&
        tenant.permissions.includes("hr:manage"))
        ? "HR_MANAGER"
        : grant?.role === "OPERATIONS" || grant?.role === "MANAGER"
          ? "COMPANY_MANAGER"
          : "EMPLOYEE";
    if (!owner && !grant) {
      // Employees without a company grant can only use self-service via their linked user_id.
      const linked = await this.db.queryInTenantContext(
        tenant.tenantId,
        "SELECT 1 FROM hr_employees WHERE tenant_id=$1 AND company_id=$2 AND user_id=$3 LIMIT 1",
        [tenant.tenantId, companyId, user.userId],
      );
      if (!linked.rows.length) throw new ForbiddenException();
    }
    return {
      tenantId: tenant.tenantId,
      companyIds: [companyId],
      actorUserId: user.userId,
      role,
    };
  }

  async employees(tenant: TenantContext, companyId: string) {
    const scope = await this.scope(tenant, companyId);
    const sql =
      scope.role === "HR_MANAGER" || scope.role === "COMPANY_MANAGER"
        ? 'SELECT id,tenant_id AS "tenantId",company_id AS "companyId",user_id AS "userId",display_name AS "displayName",start_date::text AS "startDate",end_date::text AS "endDate" FROM hr_employees WHERE tenant_id=$1 AND company_id=$2'
        : 'SELECT id,tenant_id AS "tenantId",company_id AS "companyId",user_id AS "userId",display_name AS "displayName",start_date::text AS "startDate",end_date::text AS "endDate" FROM hr_employees WHERE tenant_id=$1 AND company_id=$2 AND user_id=$3';
    const result = await this.db.queryInTenantContext(
      tenant.tenantId,
      sql,
      scope.role === "EMPLOYEE"
        ? [tenant.tenantId, companyId, scope.actorUserId]
        : [tenant.tenantId, companyId],
    );
    return result.rows;
  }

  async contracts(tenant: TenantContext, companyId: string) {
    const scope = await this.scope(tenant, companyId);
    const filter = scope.role !== "HR_MANAGER" ? " AND e.user_id=$3" : "";
    const result = await this.db.queryInTenantContext(
      tenant.tenantId,
      'SELECT c.id,c.employee_id AS "employeeId",c.start_date::text AS "startDate",c.end_date::text AS "endDate",c.monthly_gross_minor::text AS "monthlyGrossMinor",c.currency FROM hr_contracts c JOIN hr_employees e ON e.tenant_id=c.tenant_id AND e.company_id=c.company_id AND e.id=c.employee_id WHERE c.tenant_id=$1 AND c.company_id=$2' +
        filter,
      scope.role !== "HR_MANAGER"
        ? [tenant.tenantId, companyId, scope.actorUserId]
        : [tenant.tenantId, companyId],
    );
    return result.rows;
  }

  async leaves(tenant: TenantContext, companyId: string) {
    const scope = await this.scope(tenant, companyId);
    const filter = scope.role === "EMPLOYEE" ? " AND e.user_id=$3" : "";
    const result = await this.db.queryInTenantContext(
      tenant.tenantId,
      'SELECT l.id,l.employee_id AS "employeeId",l.starts_on::text AS "startsOn",l.ends_on::text AS "endsOn",l.status,l.decided_by AS "decidedBy" FROM hr_leave_requests l JOIN hr_employees e ON e.tenant_id=l.tenant_id AND e.company_id=l.company_id AND e.id=l.employee_id WHERE l.tenant_id=$1 AND l.company_id=$2' +
        filter +
        " ORDER BY l.starts_on DESC",
      scope.role === "EMPLOYEE"
        ? [tenant.tenantId, companyId, scope.actorUserId]
        : [tenant.tenantId, companyId],
    );
    return result.rows;
  }

  async createEmployee(
    tenant: TenantContext,
    companyId: string,
    data: {
      displayName: string;
      userId?: string | null;
      startDate: string;
      endDate?: string | null;
    },
  ) {
    const scope = await this.scope(tenant, companyId);
    if (scope.role !== "HR_MANAGER") throw new ForbiddenException();
    validatePeriod(data.startDate, data.endDate ?? null);
    if (!data.displayName.trim() || data.displayName.length > 255)
      throw new BadRequestException("Invalid name");
    if (data.userId) {
      const member = await this.db.queryInTenantContext(
        tenant.tenantId,
        "SELECT 1 FROM memberships WHERE tenant_id=$1 AND user_id=$2 AND status='ACTIVE'",
        [tenant.tenantId, data.userId],
      );
      if (!member.rows.length)
        throw new BadRequestException(
          "Employee account must be an active holding member",
        );
    }
    return this.db.runInTenantContext(tenant.tenantId, async (client) => {
      const row = await client.query(
        "SELECT state FROM business_ledgers WHERE tenant_id=$1 FOR UPDATE",
        [tenant.tenantId],
      );
      const state = row.rows[0]?.state;
      if (
        !state?.companies?.some(
          (c: { id: string; status?: string }) =>
            c.id === companyId && (!c.status || c.status === "ACTIVE"),
        )
      )
        throw new BadRequestException("Société inactive");
      const id = randomUUID();
      await client.query(
        "INSERT INTO hr_employees(id,tenant_id,company_id,user_id,display_name,start_date,end_date) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          tenant.tenantId,
          companyId,
          data.userId ?? null,
          data.displayName.trim(),
          data.startDate,
          data.endDate ?? null,
        ],
      );
      state.employees ??= [];
      state.employees.push({
        id,
        companyId,
        fullName: data.displayName.trim(),
        jobTitle: "À renseigner",
        department: "À renseigner",
        grossSalary: 0,
        employerChargesBps: 1800,
        hiredAt: data.startDate,
        status:
          data.endDate && data.endDate < new Date().toISOString().slice(0, 10)
            ? "INACTIVE"
            : "ACTIVE",
      });
      if (Buffer.byteLength(JSON.stringify(state)) > 8 * 1024 * 1024)
        throw new BadRequestException("Limite du registre atteinte");
      await client.query(
        "UPDATE business_ledgers SET state=$2::jsonb,version=version+1,updated_at=NOW() WHERE tenant_id=$1",
        [tenant.tenantId, JSON.stringify(state)],
      );
      await client.query(
        "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_type,resource_id) VALUES($1,$2,$3,'hr.employee.created','employee',$4)",
        [randomUUID(), tenant.tenantId, scope.actorUserId, id],
      );
      return { id };
    });
  }

  async createContract(
    tenant: TenantContext,
    companyId: string,
    data: {
      employeeId: string;
      startDate: string;
      endDate?: string | null;
      monthlyGrossMinor: number;
      currency: string;
    },
  ) {
    const scope = await this.scope(tenant, companyId);
    if (scope.role !== "HR_MANAGER") throw new ForbiddenException();
    const employee = await this.employee(
      tenant.tenantId,
      companyId,
      data.employeeId,
    );
    validateContract(
      {
        id: randomUUID(),
        tenantId: tenant.tenantId,
        companyId,
        employeeId: data.employeeId,
        startDate: data.startDate,
        endDate: data.endDate ?? null,
        monthlyGrossMinor: data.monthlyGrossMinor,
        currency: data.currency,
      },
      employee,
    );
    return this.db.runInTenantContext(tenant.tenantId, async (client) => {
      const row = await client.query(
        "SELECT state FROM business_ledgers WHERE tenant_id=$1 FOR UPDATE",
        [tenant.tenantId],
      );
      const state = row.rows[0]?.state;
      const company = state?.companies?.find(
        (c: { id: string; status?: string; currency: string }) =>
          c.id === companyId,
      );
      if (!company || (company.status && company.status !== "ACTIVE"))
        throw new BadRequestException("Société inactive");
      if (company.currency !== data.currency)
        throw new BadRequestException(
          "La devise du contrat doit correspondre à la société",
        );
      const id = randomUUID();
      await client.query(
        "INSERT INTO hr_contracts(id,tenant_id,company_id,employee_id,start_date,end_date,monthly_gross_minor,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          tenant.tenantId,
          companyId,
          data.employeeId,
          data.startDate,
          data.endDate ?? null,
          data.monthlyGrossMinor,
          data.currency,
        ],
      );
      const tracked = state.employees?.find(
        (e: { id: string; companyId: string }) =>
          e.id === data.employeeId && e.companyId === companyId,
      );
      const today = new Date().toISOString().slice(0, 10);
      if (
        tracked &&
        data.startDate <= today &&
        (!data.endDate || data.endDate >= today)
      )
        tracked.grossSalary = data.monthlyGrossMinor;
      await client.query(
        "UPDATE business_ledgers SET state=$2::jsonb,version=version+1,updated_at=NOW() WHERE tenant_id=$1",
        [tenant.tenantId, JSON.stringify(state)],
      );
      await client.query(
        "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_type,resource_id) VALUES($1,$2,$3,'hr.contract.created','contract',$4)",
        [randomUUID(), tenant.tenantId, scope.actorUserId, id],
      );
      return { id };
    });
  }

  private async employee(
    tenantId: string,
    companyId: string,
    employeeId: string,
  ): Promise<Employee> {
    const result = await this.db.queryInTenantContext(
      tenantId,
      'SELECT id,tenant_id AS "tenantId",company_id AS "companyId",user_id AS "userId",display_name AS "displayName",start_date::text AS "startDate",end_date::text AS "endDate" FROM hr_employees WHERE tenant_id=$1 AND company_id=$2 AND id=$3',
      [tenantId, companyId, employeeId],
    );
    if (!result.rows.length) throw new NotFoundException("Employee not found");
    return result.rows[0] as Employee;
  }

  async createLeave(
    tenant: TenantContext,
    companyId: string,
    data: {
      employeeId: string;
      startsOn: string;
      endsOn: string;
    },
  ) {
    const scope = await this.scope(tenant, companyId);
    const employee = await this.employee(
      tenant.tenantId,
      companyId,
      data.employeeId,
    );
    const leave = requestLeave(
      scope,
      employee,
      randomUUID(),
      data.startsOn,
      data.endsOn,
    );
    await this.db.queryInTenantContext(
      tenant.tenantId,
      "INSERT INTO hr_leave_requests(id,tenant_id,company_id,employee_id,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6)",
      [
        leave.id,
        tenant.tenantId,
        companyId,
        employee.id,
        leave.startsOn,
        leave.endsOn,
      ],
    );
    return { id: leave.id, status: leave.status };
  }

  async decide(
    tenant: TenantContext,
    companyId: string,
    leaveId: string,
    status: "APPROVED" | "REJECTED",
  ) {
    const scope = await this.scope(tenant, companyId);
    if (scope.role !== "HR_MANAGER") throw new ForbiddenException();
    return this.db.runInTenantContext(tenant.tenantId, async (client) => {
      const row = await client.query(
        "SELECT id,tenant_id,company_id,employee_id,starts_on::text,ends_on::text,status,decided_by FROM hr_leave_requests WHERE tenant_id=$1 AND company_id=$2 AND id=$3 FOR UPDATE",
        [tenant.tenantId, companyId, leaveId],
      );
      if (!row.rows.length) throw new NotFoundException("Leave not found");
      const x = row.rows[0];
      const employee = await client.query(
        'SELECT id,tenant_id AS "tenantId",company_id AS "companyId",user_id AS "userId",display_name AS "displayName",start_date::text AS "startDate",end_date::text AS "endDate" FROM hr_employees WHERE tenant_id=$1 AND company_id=$2 AND id=$3',
        [tenant.tenantId, companyId, x.employee_id],
      );
      if (!employee.rows.length)
        throw new NotFoundException("Employee not found");
      const leave: LeaveRequest = {
        id: x.id,
        tenantId: x.tenant_id,
        companyId: x.company_id,
        employeeId: x.employee_id,
        startsOn: x.starts_on,
        endsOn: x.ends_on,
        status: x.status,
        decidedBy: x.decided_by,
      };
      const result = decideLeave(
        scope,
        employee.rows[0] as Employee,
        leave,
        status,
      );
      await client.query(
        "UPDATE hr_leave_requests SET status=$1,decided_by=$2 WHERE id=$3 AND tenant_id=$4",
        [result.status, result.decidedBy, leaveId, tenant.tenantId],
      );
      return { id: result.id, status: result.status };
    });
  }
}
