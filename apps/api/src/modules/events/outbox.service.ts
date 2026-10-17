import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { RlsPostgresService } from '../../database/rls-postgres.service';
import { BusinessEvent } from '@saas/types';
import { PoolClient } from 'pg';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(@Inject(RlsPostgresService) private readonly rlsDb: RlsPostgresService) {}

  /**
   * Writes a business event into the transactional outbox table within the active transaction.
   * If a transaction client is passed, it uses the existing client; otherwise it executes within the tenant context.
   */
  async emitTransactionalEvent<T = Record<string, unknown>>(
    tenantId: string,
    eventType: string,
    payload: T,
    client?: PoolClient,
  ): Promise<BusinessEvent<T>> {
    const id = randomUUID();
    const eventVersion = '1.0';

    const sql = `INSERT INTO business_events (id, tenant_id, event_type, event_version, payload)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, tenant_id as "tenantId", event_type as "eventType",
                           event_version as "eventVersion", payload,
                           occurred_at as "occurredAt", published_at as "publishedAt",
                           retry_count as "retryCount", error_message as "errorMessage"`;
    const params = [id, tenantId, eventType, eventVersion, JSON.stringify(payload)];

    if (client) {
      const res = await client.query(sql, params);
      return res.rows[0];
    } else {
      const res = await this.rlsDb.queryInTenantContext(tenantId, sql, params);
      return res.rows[0];
    }
  }

  /**
   * Worker interface: fetches unpublished events with SKIP LOCKED for safe concurrent worker processing.
   */
  async fetchUnpublishedEvents(batchSize = 100): Promise<BusinessEvent[]> {
    const sql = `SELECT id, tenant_id as "tenantId", event_type as "eventType",
                        event_version as "eventVersion", payload,
                        occurred_at as "occurredAt", retry_count as "retryCount"
                 FROM business_events
                 WHERE published_at IS NULL
                 ORDER BY occurred_at ASC
                 LIMIT $1
                 FOR UPDATE SKIP LOCKED`;
    const res = await this.rlsDb.queryAdmin<BusinessEvent>(sql, [batchSize]);
    return res.rows;
  }

  /**
   * Worker interface: marks an outbox event as published.
   */
  async markEventPublished(eventId: string): Promise<void> {
    await this.rlsDb.queryAdmin(
      `UPDATE business_events
       SET published_at = NOW(), retry_count = retry_count + 1
       WHERE id = $1`,
      [eventId],
    );
  }
}
