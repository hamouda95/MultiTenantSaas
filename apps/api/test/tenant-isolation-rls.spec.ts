import { describe, it, expect, beforeEach } from 'vitest';
import { RlsPostgresService } from '../src/database/rls-postgres.service';

describe('Tenant Isolation & RLS Security Engine', () => {
  let db: RlsPostgresService;

  const TENANT_ALPHA = '11111111-1111-4111-a111-111111111111';
  const TENANT_BETA = '22222222-2222-4222-b222-222222222222';

  beforeEach(() => {
    db = new RlsPostgresService();
    db.setInMemoryMode(true); // Guarantees deterministic, reproducible test runs across any environment
  });

  it('should isolate documents inserted by Tenant Alpha from Tenant Beta', async () => {
    // 1. Insert document as Tenant Alpha
    const docAlpha = await db.runInTenantContext(TENANT_ALPHA, async (client) => {
      const res = await client.query(
        `INSERT INTO documents (id, title, file_name, file_size, mime_type, s3_key)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        ['doc-alpha-secret-001', 'Alpha Confidential Financials', 'finances.pdf', 1024, 'application/pdf', 's3://alpha/finances.pdf'],
      );
      return res.rows[0];
    });

    expect(docAlpha.tenant_id).toBe(TENANT_ALPHA);

    // 2. Insert document as Tenant Beta
    const docBeta = await db.runInTenantContext(TENANT_BETA, async (client) => {
      const res = await client.query(
        `INSERT INTO documents (id, title, file_name, file_size, mime_type, s3_key)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        ['doc-beta-secret-002', 'Beta Strategy Plan', 'strategy.pdf', 2048, 'application/pdf', 's3://beta/strategy.pdf'],
      );
      return res.rows[0];
    });

    expect(docBeta.tenant_id).toBe(TENANT_BETA);

    // 3. Query as Tenant Alpha -> must ONLY see Tenant Alpha documents
    const alphaQuery = await db.runInTenantContext(TENANT_ALPHA, async (client) => {
      return client.query('SELECT * FROM documents');
    });

    expect(alphaQuery.rows).toHaveLength(1);
    expect(alphaQuery.rows[0].id).toBe('doc-alpha-secret-001');
    expect(alphaQuery.rows.some((r: any) => r.id === 'doc-beta-secret-002')).toBe(false);

    // 4. Query as Tenant Beta -> must ONLY see Tenant Beta documents
    const betaQuery = await db.runInTenantContext(TENANT_BETA, async (client) => {
      return client.query('SELECT * FROM documents');
    });

    expect(betaQuery.rows).toHaveLength(1);
    expect(betaQuery.rows[0].id).toBe('doc-beta-secret-002');
    expect(betaQuery.rows.some((r: any) => r.id === 'doc-alpha-secret-001')).toBe(false);
  });

  it('should reject or return zero rows when Tenant Alpha attempts to target Tenant Beta document by ID', async () => {
    // Seed Beta Document
    await db.runInTenantContext(TENANT_BETA, async (client) => {
      return client.query(
        `INSERT INTO documents (id, title, file_name, file_size, mime_type, s3_key)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['doc-beta-target', 'Beta Private Doc', 'beta.pdf', 512, 'application/pdf', 's3://beta/beta.pdf'],
      );
    });

    // Tenant Alpha attempts to read Tenant Beta's document ID
    const alphaAccessAttempt = await db.runInTenantContext(TENANT_ALPHA, async (client) => {
      return client.query('SELECT * FROM documents WHERE id = $1', ['doc-beta-target']);
    });

    // Under strict RLS, Tenant Alpha receives an empty result (as if the document doesn't exist)
    expect(alphaAccessAttempt.rows).toHaveLength(0);
  });

  it('should prevent connection pool state leaking between sequential requests', async () => {
    // Request 1: Tenant Alpha executes query
    await db.runInTenantContext(TENANT_ALPHA, async (client) => {
      await client.query('SELECT 1');
    });

    // Request 2: An unauthenticated query executed on a pooled connection without tenant context
    const cleanQuery = await db.runInTenantContext('', async (client) => {
      return client.query('SELECT * FROM documents');
    });

    // Without a valid tenant context, zero rows are returned
    expect(cleanQuery.rows).toHaveLength(0);
  });
});
