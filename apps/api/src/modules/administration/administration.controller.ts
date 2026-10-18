import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Inject,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { RlsPostgresService } from "../../database/rls-postgres.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUserContext } from "@saas/types";
import type { PoolClient } from "pg";
const uuid = z.string().uuid();
const schema = z
  .object({
    mode: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED", "DELETED"]),
    version: z.number().int().min(0),
    confirmation: z.string().min(1).max(255),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
@Controller("api/v1/administration/holdings")
@UseGuards(JwtAuthGuard)
export class AdministrationController {
  constructor(
    @Inject(RlsPostgresService) private readonly db: RlsPostgresService,
  ) {}
  private async authorize(
    client: PoolClient,
    id: string,
    user: AuthenticatedUserContext,
  ) {
    if (user.isPlatformAdmin) return;
    const r = await client.query(
      "SELECT m.id FROM memberships m JOIN membership_roles mr ON mr.membership_id=m.id AND mr.tenant_id=m.tenant_id JOIN roles r ON r.id=mr.role_id AND r.tenant_id=m.tenant_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.status='ACTIVE' AND r.name='Owner'",
      [id, user.userId],
    );
    if (!r.rows.length)
      throw new ForbiddenException(
        "Propriétaire du holding ou administrateur plateforme requis",
      );
  }
  @Get() list(@CurrentUser() user: AuthenticatedUserContext) {
    return this.db.runAdminTransaction(async (client) => ({
      platformAdmin: user.isPlatformAdmin,
      holdings: (
        await client.query(
          `SELECT t.id,t.name,t.slug,t.status,t.lifecycle_mode AS mode,t.lifecycle_version AS version,t.lifecycle_reason AS reason FROM tenants t WHERE $2::boolean OR EXISTS(SELECT 1 FROM memberships m JOIN membership_roles mr ON mr.membership_id=m.id AND mr.tenant_id=m.tenant_id JOIN roles r ON r.id=mr.role_id AND r.tenant_id=m.tenant_id WHERE m.tenant_id=t.id AND m.user_id=$1 AND m.status='ACTIVE' AND r.name='Owner') ORDER BY t.name`,
          [user.userId, user.isPlatformAdmin],
        )
      ).rows,
    }));
  }
  @Post(":id/lifecycle") change(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param("id", new ZodValidationPipe(uuid)) id: string,
    @Body(new ZodValidationPipe(schema)) body: z.infer<typeof schema>,
  ) {
    return this.db.runAdminTransaction(async (client) => {
      await this.authorize(client, id, user);
      const r = await client.query(
        "SELECT * FROM tenants WHERE id=$1 FOR UPDATE",
        [id],
      );
      const t = r.rows[0];
      if (!t) throw new NotFoundException();
      if (t.lifecycle_version !== body.version)
        throw new ConflictException("État modifié : actualisez");
      if (body.confirmation !== t.name)
        throw new BadRequestException("Saisissez exactement le nom du holding");
      const ledger = await client.query(
        "SELECT state FROM business_ledgers WHERE tenant_id=$1 FOR UPDATE",
        [id],
      );
      if (
        body.mode !== "ACTIVE" &&
        ledger.rows[0]?.state.posSessions?.some((x: any) => !x.closedAt)
      )
        throw new ConflictException(
          "Fermez toutes les caisses avant cette action",
        );
      await client.query(
        "UPDATE tenants SET lifecycle_mode=$2,lifecycle_version=lifecycle_version+1,lifecycle_reason=$3,status=$4,updated_at=NOW() WHERE id=$1",
        [
          id,
          body.mode,
          body.reason,
          body.mode === "ACTIVE"
            ? "ACTIVE"
            : body.mode === "DELETED"
              ? "DECOMMISSIONED"
              : "SUSPENDED",
        ],
      );
      await client.query(
        "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_type,resource_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          randomUUID(),
          id,
          user.userId,
          "holding." + body.mode.toLowerCase(),
          "holding",
          id,
          JSON.stringify({
            reason: body.reason,
            previousMode: t.lifecycle_mode,
          }),
        ],
      );
      return { success: true };
    });
  }
  @Post(":id/export") export(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param("id", new ZodValidationPipe(uuid)) id: string,
  ) {
    return this.db.runAdminTransaction(async (client) => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await this.authorize(client, id, user);
      const holding = await client.query(
        "SELECT id,name,slug,status,lifecycle_mode,created_at,updated_at FROM tenants WHERE id=$1",
        [id],
      );
      if (!holding.rows.length) throw new NotFoundException();
      await client.query(
        "INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_type,resource_id) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), id, user.userId, "holding.exported", "holding", id],
      );
      const data: Record<string, unknown> = { holding: holding.rows[0] };
      for (const table of [
        "tenant_settings",
        "tenant_modules",
        "tenant_quotas",
        "roles",
      ])
        data[table] = (
          await client.query(`SELECT * FROM ${table} WHERE tenant_id=$1`, [id])
        ).rows;
      data.members = (
        await client.query(
          "SELECT m.id,m.user_id,m.status,u.email,u.full_name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1",
          [id],
        )
      ).rows;
      data.roleAssignments = (
        await client.query(
          "SELECT membership_id,role_id FROM membership_roles WHERE tenant_id=$1",
          [id],
        )
      ).rows;
      data.rolePermissions = (
        await client.query(
          "SELECT rp.role_id,p.key FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.tenant_id=$1",
          [id],
        )
      ).rows;
      data.business =
        (
          await client.query(
            "SELECT version,state,updated_at FROM business_ledgers WHERE tenant_id=$1",
            [id],
          )
        ).rows[0] || null;
      data.audit = (
        await client.query(
          "SELECT id,actor_id,action,resource_type,resource_id,created_at FROM audit_logs WHERE tenant_id=$1 ORDER BY created_at,id",
          [id],
        )
      ).rows;
      return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        includesArchivedAndDeleted: true,
        ...data,
      };
    });
  }
}
