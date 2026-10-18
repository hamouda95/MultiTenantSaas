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
    };
  }
  async snapshot(tenant: TenantContext) {
    const { userId, owner } = this.identity(tenant);
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
      ),
      holdingOwner: owner,
      userId,
    };
  }
  async execute(tenant: TenantContext, command: BusinessCommand) {
    const { userId, owner } = this.identity(tenant);
    return this.db.runInTenantContext(tenant.tenantId, async (client) => {
      await client.query(
        "INSERT INTO business_ledgers (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING",
        [tenant.tenantId],
      );
      const { rows } = await client.query(
        "SELECT version,state FROM business_ledgers WHERE tenant_id=$1 FOR UPDATE",
        [tenant.tenantId],
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
        return {
          version: Number(rows[0].version),
          state: visibleBusiness(rows[0].state, userId, owner),
          holdingOwner: owner,
          userId,
        };
      }
      if (Number(rows[0].version) !== command.version)
        throw new ConflictException(
          "Les données ont changé. Actualisez avant de recommencer.",
        );
      if (command.action.type === "access.grant") {
        const member = await client.query(
          "SELECT id FROM memberships WHERE tenant_id=$1 AND user_id=$2 AND status='ACTIVE'",
          [tenant.tenantId, command.action.userId],
        );
        if (!member.rows.length)
          throw new BadRequestException(
            "Invitez et activez ce membre avant de lui attribuer une société",
          );
      }
      const state = applyBusiness(
        rows[0].state as BusinessState,
        command.action,
        userId,
        owner,
      );
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
      return {
        version: Number(rows[0].version) + 1,
        state: visibleBusiness(state, userId, owner),
        holdingOwner: owner,
        userId,
      };
    });
  }
}
