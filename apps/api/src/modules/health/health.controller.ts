import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { RlsPostgresService } from '../../database/rls-postgres.service';

@Controller('health')
export class HealthController {
  constructor(private readonly rlsDb: RlsPostgresService) {}

  @Get('live')
  getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  @Get('ready')
  async getReadiness() {
    try {
      // Execute ping to verify DB readiness
      await this.rlsDb.queryAdmin('SELECT 1');
      return {
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      };
    } catch {
      throw new ServiceUnavailableException('Database connectivity probe failed');
    }
  }
}
