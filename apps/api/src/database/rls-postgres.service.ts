import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  ConflictException,
} from "@nestjs/common";
import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

export interface DatabaseExecutionMetrics {
  totalQueries: number;
  activeTransactions: number;
  averageLatencyMs: number;
}

@Injectable()
export class RlsPostgresService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RlsPostgresService.name);
  private appPool: Pool | null = null;
  private adminPool: Pool | null = null;
  private isConnected = false;

  // In-memory tenant store fallback for offline tests or unit testing without live PostgreSQL
  private inMemoryMode = false;
  private inMemoryData: Map<string, Map<string, unknown[]>> = new Map();

  async onModuleInit() {
    await this.initializePools();
  }

  async onModuleDestroy() {
    await this.closePools();
  }

  public setInMemoryMode(enabled: boolean) {
    if (enabled && process.env.NODE_ENV !== "test")
      throw new Error("Test database engine is disabled outside tests");
    this.inMemoryMode = enabled;
  }

  public getInMemoryDataStore(): Map<string, Map<string, unknown[]>> {
    return this.inMemoryData;
  }

  private async initializePools() {
    if (
      process.env.NODE_ENV === "test" &&
      process.env.LIVE_DATABASE_TESTS !== "1"
    ) {
      this.inMemoryMode = true;
      return;
    }
    if (
      process.env.NODE_ENV === "production" &&
      (!process.env.DATABASE_URL || !process.env.DATABASE_MIGRATION_URL)
    )
      throw new Error(
        "Production requires independent runtime and control database URLs",
      );
    const appDatabaseUrl =
      process.env.DATABASE_URL ||
      "postgresql://saas_app_user:app_secure_password_123@localhost:5432/saas_production?schema=public";

    const adminDatabaseUrl =
      process.env.DATABASE_MIGRATION_URL ||
      "postgresql://saas_admin:admin_master_password_456@localhost:5432/saas_production?schema=public";

    try {
      this.appPool = new Pool({
        connectionString: appDatabaseUrl,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.adminPool = new Pool({
        connectionString: adminDatabaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Probe connection to verify PostgreSQL availability
      const client = await this.appPool.connect();
      try {
        const role = await client.query(
          "SELECT current_user AS runtime_role, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, EXISTS(SELECT 1 FROM pg_roles elevated WHERE elevated.rolname IN ('saas_control','neon_superuser') AND pg_has_role(current_user,elevated.oid,'MEMBER')) AS privileged_membership FROM pg_roles WHERE rolname = current_user",
        );
        if (
          role.rows[0]?.rolsuper ||
          role.rows[0]?.rolbypassrls ||
          role.rows[0]?.rolcreaterole ||
          role.rows[0]?.rolcreatedb ||
          role.rows[0]?.privileged_membership ||
          !(
            process.env.DATABASE_RUNTIME_ROLE
              ? [process.env.DATABASE_RUNTIME_ROLE]
              : ["saas_app_user", "saas_runtime"]
          ).includes(role.rows[0]?.runtime_role)
        )
          throw new Error("Application database role must enforce RLS");
        const control = await this.adminPool.query(
          "SELECT current_user AS control_role",
        );
        if (control.rows[0]?.control_role === role.rows[0]?.runtime_role)
          throw new Error(
            "Runtime and control connections must use different SQL roles",
          );
      } finally {
        client.release();
      }
      this.isConnected = true;
      this.logger.log(
        "Connected successfully to PostgreSQL instance with RLS support",
      );
    } catch (error) {
      await this.closePools();
      throw new Error(
        "PostgreSQL is required; refusing to start without persistent storage",
      );
    }
  }

  async assertReadiness() {
    if (this.inMemoryMode) return;
    if (!this.appPool || !this.adminPool)
      throw new Error("Database not initialized");
    const r = await this.appPool.query(
      "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN (to_regclass('tenant_settings'),to_regclass('business_ledgers'))",
    );
    if (
      r.rows.length !== 2 ||
      r.rows.some((x) => !x.relrowsecurity || !x.relforcerowsecurity)
    )
      throw new Error("Required migrations or RLS missing");
    await this.appPool.query(
      "SELECT lifecycle_mode,lifecycle_version FROM tenants LIMIT 0",
    );
    const data = await this.appPool.query(
      "SELECT tenant_id FROM business_ledgers LIMIT 1",
    );
    if (data.rows.length)
      throw new Error("Runtime role leaked tenant rows without context");
    await this.adminPool.query("SELECT id FROM auth_sessions LIMIT 0");
  }

  async runAdminTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (this.inMemoryMode)
      return this.executeInMemoryTenantTransaction(null as any, callback);
    if (!this.adminPool) throw new Error("Database not initialized");
    const client = await this.adminPool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505")
        throw new ConflictException(
          "A record with these details already exists",
        );
      throw error;
    } finally {
      client.release();
    }
  }

  public async closePools() {
    if (this.appPool) {
      await this.appPool.end().catch(() => null);
    }
    if (this.adminPool) {
      await this.adminPool.end().catch(() => null);
    }
  }

  /**
   * Executes a callback within a strict transaction-local tenant context.
   * Uses SET LOCAL app.current_tenant_id = $1 so the context is reset upon COMMIT/ROLLBACK,
   * guaranteeing no connection pooling contamination.
   */
  async runInTenantContext<T>(
    tenantId: string,
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (this.inMemoryMode) {
      return this.executeInMemoryTenantTransaction(tenantId, callback);
    }

    if (!this.appPool) throw new Error("Database not initialized");
    const client = await this.appPool.connect();
    try {
      await client.query("BEGIN;");
      await client.query(
        "SELECT set_config('app.current_tenant_id', $1, true)",
        [tenantId],
      );

      const result = await callback(client);

      await client.query("COMMIT;");
      return result;
    } catch (err) {
      await client.query("ROLLBACK;").catch(() => null);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Helper to execute a single query within transaction-local tenant context.
   */
  async queryInTenantContext<R extends QueryResultRow = any>(
    tenantId: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<R>> {
    return this.runInTenantContext(tenantId, async (client) => {
      return client.query<R>(sql, params);
    });
  }

  /**
   * Admin-level query (used strictly for identity lookup, system migrations, and membership guards).
   */
  async queryAdmin<R extends QueryResultRow = any>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<R>> {
    if (this.inMemoryMode) {
      return this.executeInMemoryAdminQuery(sql, params);
    }

    if (!this.adminPool) throw new Error("Database not initialized");
    const client = await this.adminPool.connect();
    try {
      return await client.query<R>(sql, params);
    } finally {
      client.release();
    }
  }

  /**
   * In-Memory Fallback Engine that enforces strict tenant isolation during offline tests.
   */
  private async executeInMemoryTenantTransaction<T>(
    tenantId: string,
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const mockClient = {
      query: async (queryText: string, params: unknown[] = []) => {
        return this.handleInMemoryQuery(tenantId, queryText, params);
      },
      release: () => {},
    } as unknown as PoolClient;

    return callback(mockClient);
  }

  private async executeInMemoryAdminQuery<R extends QueryResultRow = any>(
    queryText: string,
    params: unknown[] = [],
  ): Promise<QueryResult<R>> {
    return this.handleInMemoryQuery(
      null,
      queryText,
      params,
    ) as unknown as QueryResult<R>;
  }

  private handleInMemoryQuery(
    tenantContextId: string | null,
    queryText: string,
    params: unknown[] = [],
  ): QueryResult<any> {
    const upper = queryText.trim().toUpperCase();

    // Emulate transaction and context setting statements
    if (
      upper.startsWith("BEGIN") ||
      upper.startsWith("COMMIT") ||
      upper.startsWith("ROLLBACK")
    ) {
      return {
        rows: [],
        command: upper.split(" ")[0],
        rowCount: 0,
        oid: 0,
        fields: [],
      };
    }

    if (upper.startsWith("SET LOCAL APP.CURRENT_TENANT_ID")) {
      return { rows: [], command: "SET", rowCount: 0, oid: 0, fields: [] };
    }

    // Determine target table
    const tableMatch =
      queryText.match(/FROM\s+([a-zA-Z0-9_]+)/i) ||
      queryText.match(/INTO\s+([a-zA-Z0-9_]+)/i) ||
      queryText.match(/UPDATE\s+([a-zA-Z0-9_]+)/i);
    const tableName = tableMatch ? tableMatch[1].toLowerCase() : "generic";

    if (!this.inMemoryData.has(tableName)) {
      this.inMemoryData.set(tableName, new Map());
    }
    const tableMap = this.inMemoryData.get(tableName)!;

    // Handle INSERT
    if (upper.startsWith("INSERT")) {
      const record: Record<string, any> = {
        id: params[0] || `gen-id-${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Extract column names from INSERT INTO table (col1, col2, ...)
      const colsMatch = queryText.match(/INTO\s+[a-zA-Z0-9_]+\s*\(([^)]+)\)/i);
      if (colsMatch) {
        const cols = colsMatch[1].split(",").map((c) => c.trim().toLowerCase());
        // Extract values from VALUES (...)
        const valsMatch = queryText.match(/VALUES\s*\(([^)]+)\)/i);
        if (valsMatch) {
          const valTokens = valsMatch[1].split(",").map((v) => v.trim());
          let paramIdx = 0;
          cols.forEach((col, idx) => {
            const token = valTokens[idx];
            if (token && token.startsWith("$")) {
              record[col] = params[paramIdx++];
            } else if (
              token &&
              (token.startsWith("'") || token.startsWith('"'))
            ) {
              record[col] = token.replace(/['"]/g, "");
            } else if (token === "true") {
              record[col] = true;
            } else if (token === "false") {
              record[col] = false;
            } else if (token && !isNaN(Number(token))) {
              record[col] = Number(token);
            }
          });
        }
      }

      // In tenant context, enforce record tenant ownership
      if (tenantContextId) {
        record.tenant_id = tenantContextId;
        record.tenantId = tenantContextId;
      } else if (record.tenant_id) {
        record.tenantId = record.tenant_id;
      }

      // Alias mapping
      if (record.primary_color) record.primaryColor = record.primary_color;
      if (record.accent_color) record.accentColor = record.accent_color;
      if (record.theme_mode) record.themeMode = record.theme_mode;
      if (record.placement_mode) record.placementMode = record.placement_mode;
      if (record.module_key) record.moduleKey = record.module_key;
      if (record.is_enabled !== undefined) record.isEnabled = record.is_enabled;
      if (record.monthly_ai_token_budget)
        record.monthlyAiTokenBudget = record.monthly_ai_token_budget;
      if (record.monthly_ai_cost_budget)
        record.monthlyAiCostBudget = record.monthly_ai_cost_budget;
      if (record.current_ai_tokens_used !== undefined)
        record.currentAiTokensUsed = record.current_ai_tokens_used;
      if (record.current_ai_cost_used !== undefined)
        record.currentAiCostUsed = record.current_ai_cost_used;
      if (record.event_type) record.eventType = record.event_type;
      if (record.event_version) record.eventVersion = record.event_version;
      if (record.resource_type) record.resourceType = record.resource_type;
      if (record.resource_id) record.resourceId = record.resource_id;

      const effectiveTenantKey =
        tenantContextId || record.tenant_id || "global";
      let tenantRecords = tableMap.get(effectiveTenantKey) || [];
      // Replace if existing with same id or module_key
      if (record.module_key) {
        tenantRecords = tenantRecords.filter(
          (r: any) => r.module_key !== record.module_key,
        );
      }
      tenantRecords.push(record);
      tableMap.set(effectiveTenantKey, tenantRecords);

      return {
        rows: [record],
        command: "INSERT",
        rowCount: 1,
        oid: 0,
        fields: [],
      };
    }

    // Handle UPDATE
    if (upper.startsWith("UPDATE")) {
      const records = (tableMap.get(tenantContextId || "global") ||
        []) as any[];
      records.forEach((rec) => {
        if (
          upper.includes("CURRENT_AI_TOKENS_USED = CURRENT_AI_TOKENS_USED +")
        ) {
          rec.currentAiTokensUsed =
            (rec.currentAiTokensUsed || 0) + Number(params[0]);
          rec.currentAiCostUsed =
            (rec.currentAiCostUsed || 0) + Number(params[1]);
        }
      });
      return {
        rows: records,
        command: "UPDATE",
        rowCount: records.length,
        oid: 0,
        fields: [],
      };
    }

    // Handle SELECT
    if (upper.startsWith("SELECT")) {
      // Special handler for membership and RBAC resolution query in TenantMembershipGuard
      if (
        queryText.includes("membership_id") &&
        queryText.includes("role_name")
      ) {
        const targetTenantId = params[0] as string;
        const targetUserId = params[1] as string;

        const membershipsMap =
          this.inMemoryData.get("memberships") || new Map();
        const tenantMemberships = (membershipsMap.get(targetTenantId) ||
          []) as any[];
        const membership = tenantMemberships.find(
          (m) =>
            (m.user_id === targetUserId || m.userId === targetUserId) &&
            m.status === "ACTIVE",
        );

        if (!membership) {
          return {
            rows: [],
            command: "SELECT",
            rowCount: 0,
            oid: 0,
            fields: [],
          };
        }

        // Return rows with role and all standard permissions for the owner/admin
        const permissions = [
          "members:read",
          "members:manage",
          "settings:read",
          "settings:manage",
          "modules:manage",
          "quotas:read",
          "audit:read",
          "documents:read",
          "documents:write",
          "documents:delete",
          "ai:chat",
          "ai:rag",
          "ai:analytics",
        ];

        const rows = permissions.map((p) => ({
          membership_id: membership.id,
          status: "ACTIVE",
          role_name: "Owner",
          permission_key: p,
        }));

        return {
          rows,
          command: "SELECT",
          rowCount: rows.length,
          oid: 0,
          fields: [],
        };
      }

      let records: any[] = [];
      if (tenantContextId) {
        records = (tableMap.get(tenantContextId) || []) as any[];
      } else {
        tableMap.forEach((tenantRecs) =>
          records.push(...(tenantRecs as any[])),
        );
      }

      // Check for WHERE filters
      if (queryText.includes("module_key = $2")) {
        const modKey = params[1];
        records = records.filter(
          (r) => r.module_key === modKey || r.moduleKey === modKey,
        );
      }
      if (queryText.includes("slug = $1")) {
        const slug = params[0];
        records = records.filter((r) => r.slug === slug);
      }
      if (queryText.includes("email = $1")) {
        const email = params[0];
        records = records.filter((r) => r.email === email);
      }

      return {
        rows: records,
        command: "SELECT",
        rowCount: records.length,
        oid: 0,
        fields: [],
      };
    }

    return { rows: [], command: "UNKNOWN", rowCount: 0, oid: 0, fields: [] };
  }
}
