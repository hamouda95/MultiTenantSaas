import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { NestFactory } from "@nestjs/core";

// This suite is intentionally separate from the legacy SQL emulator tests.
const live = process.env.LIVE_DATABASE_TESTS === "1";
describe.skipIf(!live)("Real PostgreSQL API and RLS integration", () => {
  let app: any;
  let base: string;
  let ownerCookie: string;
  let ownerId: string;
  let viewerCookie: string;
  let otherCookie: string;
  let tenantId: string;
  let otherTenantId: string;
  let inviteToken: string;
  let memberId: string;
  const suffix = randomUUID();
  const ownerEmail = `owner-${suffix}@example.test`;
  const viewerEmail = `viewer-${suffix}@example.test`;
  const password = "test-password-very-long";
  const admin = new Pool({
    connectionString: process.env.DATABASE_MIGRATION_URL,
  });
  const restricted = new Pool({ connectionString: process.env.DATABASE_URL });

  async function request(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      cookie?: string;
      tenant?: string;
      origin?: string;
    } = {},
  ) {
    const response = await fetch(`${base}/api/v1${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Origin: options.origin || "http://localhost:3000",
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.tenant ? { "x-tenant-id": options.tenant } : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
      setCookie: response.headers.get("set-cookie") || "",
    };
  }
  beforeAll(async () => {
    // Use emitted decorator metadata from the real production build.
    const { AppModule } = await import("../dist/app.module.js" as string);
    app = await NestFactory.create(AppModule, { logger: ["error"] });
    await app.listen(0, "127.0.0.1");
    base = await app.getUrl();
  });
  afterAll(async () => {
    if (otherTenantId)
      await admin.query("DELETE FROM tenants WHERE id=$1", [otherTenantId]);
    if (tenantId)
      await admin.query("DELETE FROM tenants WHERE id=$1", [tenantId]);
    await admin.query("DELETE FROM users WHERE email LIKE $1", [`%${suffix}%`]);
    await Promise.all([admin.end(), restricted.end(), app?.close()]);
  });
  it("registers and authenticates; refuses missing and incorrect passwords", async () => {
    const account = await request("/auth/register", {
      method: "POST",
      body: { email: ownerEmail, password, fullName: "Owner" },
    });
    expect(account.status).toBe(201);
    expect(account.cookie).toContain("saas_session=");
    expect(account.setCookie).toMatch(/HttpOnly/i);
    expect(account.setCookie).toMatch(/SameSite=Lax/i);
    expect(account.body.token).toBeUndefined();
    expect(account.body.user.password_hash).toBeUndefined();
    ownerCookie = account.cookie;
    ownerId = account.body.user.id;
    expect(
      (
        await request("/auth/login", {
          method: "POST",
          body: { email: ownerEmail },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/auth/login", {
          method: "POST",
          body: { email: ownerEmail, password: "incorrect-password" },
        })
      ).status,
    ).toBe(401);
    const login = await request("/auth/login", {
      method: "POST",
      body: { email: ownerEmail, password },
    });
    expect(login.status).toBe(201);
    const other = await request("/auth/register", {
      method: "POST",
      body: {
        email: `other-${suffix}@example.test`,
        password,
        fullName: "Other",
      },
    });
    otherCookie = other.cookie;
  });
  it("atomically provisions a workspace using UUIDs and seeds meaningful roles", async () => {
    const created = await request("/tenants", {
      method: "POST",
      cookie: ownerCookie,
      body: { name: "Integration workspace", slug: `test-${suffix}` },
    });
    expect(created.status).toBe(201);
    tenantId = created.body.tenant.id;
    expect(tenantId).toMatch(/^[a-f0-9-]{36}$/);
    const other = await request("/tenants", {
      method: "POST",
      cookie: otherCookie,
      body: { name: "Other workspace", slug: `other-${suffix}` },
    });
    expect(other.status).toBe(201);
    otherTenantId = other.body.tenant.id;
    const workspaces = await request("/auth/workspaces", {
      cookie: ownerCookie,
    });
    expect(
      workspaces.body.workspaces.some(
        (w: any) => w.tenantId === tenantId && w.roles.includes("Owner"),
      ),
    ).toBe(true);
    expect(
      (await request(`/tenants/${tenantId}`, { cookie: otherCookie })).status,
    ).toBe(403);
    expect(
      (
        await request(`/tenants/${tenantId}`, {
          cookie: ownerCookie,
          tenant: randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`/tenants/${tenantId}/settings`, {
          method: "PATCH",
          cookie: ownerCookie,
          body: { primaryColor: "#123456" },
          origin: "https://attacker.test",
        })
      ).status,
    ).toBe(403);
  });
  it("persists branding and module changes with audit records", async () => {
    expect(
      (
        await request(`/tenants/${tenantId}/settings`, {
          method: "PATCH",
          cookie: ownerCookie,
          body: { primaryColor: "#123456" },
        })
      ).status,
    ).toBe(200);
    const settings = await request(`/tenants/${tenantId}/settings`, {
      cookie: ownerCookie,
    });
    expect(settings.body.settings.primaryColor).toBe("#123456");
    expect(
      (
        await request(`/tenants/${tenantId}/modules/ai_chat`, {
          method: "PATCH",
          cookie: ownerCookie,
          body: { isEnabled: false },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`/tenants/${tenantId}/modules/unknown`, {
          method: "PATCH",
          cookie: ownerCookie,
          body: { isEnabled: true },
        })
      ).status,
    ).toBe(400);
    const logs = await request(`/tenants/${tenantId}/audit-logs`, {
      cookie: ownerCookie,
    });
    expect(logs.body.some((x: any) => x.action === "settings.updated")).toBe(
      true,
    );
    expect(logs.body.some((x: any) => x.action === "module.updated")).toBe(
      true,
    );
  });
  it("requires invitation possession and matching identity, then consumes it once", async () => {
    const invitation = await request(`/tenants/${tenantId}/members`, {
      method: "POST",
      cookie: ownerCookie,
      body: { email: viewerEmail, role: "Viewer" },
    });
    expect(invitation.status).toBe(201);
    inviteToken = invitation.body.invitationToken;
    memberId = invitation.body.membershipId;
    const signup = await request("/auth/register", {
      method: "POST",
      body: {
        email: viewerEmail,
        password,
        fullName: "Viewer",
        invitationToken: inviteToken,
      },
    });
    expect(signup.status).toBe(201);
    viewerCookie = signup.cookie;
    expect(
      (await request(`/tenants/${tenantId}`, { cookie: viewerCookie })).status,
    ).toBe(403);
    expect(
      (
        await request("/tenants/invitations/accept", {
          method: "POST",
          cookie: otherCookie,
          body: { token: inviteToken },
        })
      ).status,
    ).toBe(400);
    await admin.query(
      "UPDATE invitations SET expires_at=NOW() - INTERVAL '1 second' WHERE membership_id=$1",
      [memberId],
    );
    expect(
      (
        await request("/tenants/invitations/accept", {
          method: "POST",
          cookie: viewerCookie,
          body: { token: inviteToken },
        })
      ).status,
    ).toBe(400);
    await admin.query(
      "UPDATE invitations SET expires_at=NOW() + INTERVAL '1 day' WHERE membership_id=$1",
      [memberId],
    );
    expect(
      (
        await request("/tenants/invitations/accept", {
          method: "POST",
          cookie: viewerCookie,
          body: { token: inviteToken },
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request("/tenants/invitations/accept", {
          method: "POST",
          cookie: viewerCookie,
          body: { token: inviteToken },
        })
      ).status,
    ).toBe(400);
    expect(
      (await request(`/tenants/${tenantId}/members`, { cookie: viewerCookie }))
        .status,
    ).toBe(200);
    expect(
      (
        await request(`/tenants/${tenantId}/settings`, {
          method: "PATCH",
          cookie: viewerCookie,
          body: { primaryColor: "#abcdef" },
        })
      ).status,
    ).toBe(403);
  });
  it("enforces roles, last-owner protection, quota seats and removal", async () => {
    expect(
      (
        await request(`/tenants/${tenantId}/members/${memberId}`, {
          method: "PATCH",
          cookie: ownerCookie,
          body: { role: "Member" },
        })
      ).status,
    ).toBe(200);
    const owner = await admin.query(
      "SELECT id FROM memberships WHERE tenant_id=$1 AND user_id=$2",
      [tenantId, ownerId],
    );
    expect(
      (
        await request(`/tenants/${tenantId}/members/${owner.rows[0].id}`, {
          method: "DELETE",
          cookie: ownerCookie,
        })
      ).status,
    ).toBe(409);
    await admin.query(
      "UPDATE tenant_quotas SET max_members=2 WHERE tenant_id=$1",
      [tenantId],
    );
    expect(
      (
        await request(`/tenants/${tenantId}/members`, {
          method: "POST",
          cookie: ownerCookie,
          body: { email: `full-${suffix}@example.test`, role: "Member" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`/tenants/${tenantId}/members/${memberId}`, {
          method: "DELETE",
          cookie: ownerCookie,
        })
      ).status,
    ).toBe(200);
    expect(
      (await request(`/tenants/${tenantId}`, { cookie: viewerCookie })).status,
    ).toBe(403);
  });
  it("uses actual PostgreSQL RLS, resets pooled context and prevents audit mutation", async () => {
    const client = await restricted.connect();
    try {
      expect(
        (await client.query("SELECT * FROM tenant_settings")).rows,
      ).toHaveLength(0);
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_tenant_id',$1,true)", [
        tenantId,
      ]);
      expect(
        (await client.query("SELECT * FROM tenant_settings")).rows,
      ).toHaveLength(1);
      expect(
        (
          await client.query(
            "SELECT * FROM tenant_settings WHERE tenant_id=$1",
            [otherTenantId],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await client.query(
            "UPDATE tenant_settings SET primary_color='#ffffff' WHERE tenant_id=$1 RETURNING id",
            [otherTenantId],
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        client.query(
          `INSERT INTO tenant_modules (tenant_id,module_key) VALUES ($1,'ai_chat')`,
          [otherTenantId],
        ),
      ).rejects.toThrow(/row-level security/i);
      await client.query("ROLLBACK");
      expect(
        (await client.query("SELECT * FROM tenant_settings")).rows,
      ).toHaveLength(0);
      await expect(
        client.query("UPDATE audit_logs SET action=$1", ["tampered"]),
      ).rejects.toThrow();
      await expect(
        client.query("SELECT password_hash FROM users"),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });
  it("persists holding business commands, rejects stale writes and scopes company data", async () => {
    const path = `/tenants/${tenantId}/business`;
    const snapshot = await request(path, { cookie: ownerCookie });
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.version).toBe(0);
    let version = 0;
    async function command(
      action: unknown,
      options: { cookie?: string; commandId?: string; version?: number } = {},
    ) {
      return request(`${path}/commands`, {
        method: "POST",
        cookie: options.cookie || ownerCookie,
        body: {
          commandId: options.commandId || randomUUID(),
          version: options.version ?? version,
          action,
        },
      });
    }
    const action = {
      type: "company.create",
      data: {
        name: "Polaris",
        country: "Tunisie",
        currency: "TND",
        brands: ["Polaris"],
        leadDays: 7,
        coverDays: 21,
        minimumStock: 2,
        modules: [
          "purchasing",
          "inventory",
          "sales",
          "finance",
          "intelligence",
        ],
      },
    };
    const commandId = randomUUID();
    const created = await command(action, { commandId });
    expect(created.status).toBe(201);
    version = created.body.version;
    const companyId = created.body.state.companies[0].id;
    const replay = await command(action, { commandId, version: 0 });
    expect(replay.status).toBe(201);
    expect(replay.body.version).toBe(1);
    expect(replay.body.state.companies).toHaveLength(1);
    expect(
      (
        await command(
          { ...action, data: { ...action.data, name: "Tampered" } },
          { commandId },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await command(
          { ...action, data: { ...action.data, name: "Stale" } },
          { version: 0 },
        )
      ).status,
    ).toBe(409);
    const second = await command({
      ...action,
      data: { ...action.data, name: "Other company" },
    });
    expect(second.status).toBe(201);
    version = second.body.version;
    const company2 = second.body.state.companies[1].id;
    const [a, b] = await Promise.all([
      command({
        type: "location.create",
        companyId,
        name: "Central",
        kind: "WAREHOUSE",
      }),
      command({
        type: "location.create",
        companyId,
        name: "Competing write",
        kind: "STORE",
      }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const current = await request(path, { cookie: ownerCookie });
    version = current.body.version;
    expect(current.body.state.locations).toHaveLength(1);
    expect(
      (
        await request(`/tenants/${otherTenantId}/business`, {
          cookie: otherCookie,
        })
      ).body.state.companies,
    ).toHaveLength(0);
    // Re-invite the previously removed viewer; active tenant membership alone gives no company access.
    await admin.query(
      "UPDATE tenant_quotas SET max_members=10 WHERE tenant_id=$1",
      [tenantId],
    );
    const invitation = await request(`/tenants/${tenantId}/members`, {
      method: "POST",
      cookie: ownerCookie,
      body: { email: viewerEmail, role: "Viewer" },
    });
    expect(invitation.status).toBe(201);
    expect(
      (
        await request("/tenants/invitations/accept", {
          method: "POST",
          cookie: viewerCookie,
          body: { token: invitation.body.invitationToken },
        })
      ).status,
    ).toBe(201);
    const viewerId = (await request("/auth/me", { cookie: viewerCookie })).body
      .profile.id;
    expect(
      (await request(path, { cookie: viewerCookie })).body.state.companies,
    ).toHaveLength(0);
    const grant = await command({
      type: "access.grant",
      companyId,
      userId: viewerId,
      role: "OPERATIONS",
    });
    expect(grant.status).toBe(201);
    version = grant.body.version;
    const view = await request(path, { cookie: viewerCookie });
    expect(view.body.state.companies.map((c: any) => c.id)).toEqual([
      companyId,
    ]);
    expect(
      (
        await command(
          {
            type: "location.create",
            companyId: company2,
            name: "Forbidden",
            kind: "STORE",
          },
          { cookie: viewerCookie },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await command(
          {
            type: "account.create",
            companyId,
            name: "Forbidden bank",
            kind: "BANK",
            opening: 1000,
            asOf: "2026-01-01",
          },
          { cookie: viewerCookie },
        )
      ).status,
    ).toBe(403);
    const product = await command({
      type: "product.create",
      companyId,
      sku: "SHOE-42",
      name: "Shoe",
      brand: "Polaris",
      size: "42",
      color: "Black",
    });
    expect(product.status).toBe(201);
    version = product.body.version;
    const before = product.body.state;
    const rejected = await command({
      type: "stock.transfer",
      companyId,
      productId: product.body.state.products[0].id,
      fromId: current.body.state.locations[0].id,
      toId: randomUUID(),
      quantity: 1,
    });
    expect(rejected.status).toBe(400); // insufficient source stock, no partial movement committed
    const after = await request(path, { cookie: ownerCookie });
    expect(after.body.state).toEqual(before);
    expect(after.body.version).toBe(version);
    // PostgreSQL independently protects the complete ledger, including on direct app-role access.
    expect(
      (await restricted.query("SELECT * FROM business_ledgers")).rows,
    ).toHaveLength(0);
    const connection = await restricted.connect();
    try {
      await connection.query("BEGIN");
      await connection.query(
        "SELECT set_config('app.current_tenant_id',$1,true)",
        [otherTenantId],
      );
      expect(
        (
          await connection.query(
            "SELECT * FROM business_ledgers WHERE tenant_id=$1",
            [tenantId],
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        connection.query(
          "INSERT INTO business_ledgers (tenant_id) VALUES ($1)",
          [tenantId],
        ),
      ).rejects.toThrow(/row-level security/);
      await connection.query("ROLLBACK");
    } finally {
      connection.release();
    }
    const removal = await request(
      `/tenants/${tenantId}/members/${invitation.body.membershipId}`,
      { method: "DELETE", cookie: ownerCookie },
    );
    expect(removal.status).toBe(200);
    const rejoin = await request(`/tenants/${tenantId}/members`, {
      method: "POST",
      cookie: ownerCookie,
      body: { email: viewerEmail, role: "Viewer" },
    });
    expect(rejoin.status).toBe(201);
    expect(
      (
        await request("/tenants/invitations/accept", {
          method: "POST",
          cookie: viewerCookie,
          body: { token: rejoin.body.invitationToken },
        })
      ).status,
    ).toBe(201);
    expect(
      (await request(path, { cookie: viewerCookie })).body.state.companies,
    ).toHaveLength(0);
    expect(
      (
        await command(
          {
            type: "location.create",
            companyId,
            name: "Old grant denied",
            kind: "STORE",
          },
          { cookie: viewerCookie },
        )
      ).status,
    ).toBe(403);
  });
  it("revokes logged-out sessions server-side", async () => {
    expect(
      (
        await request("/auth/logout", {
          method: "POST",
          cookie: ownerCookie,
          body: {},
        })
      ).status,
    ).toBe(201);
    expect((await request("/auth/me", { cookie: ownerCookie })).status).toBe(
      401,
    );
  });
});
