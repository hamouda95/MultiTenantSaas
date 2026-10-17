import { Module, Global } from '@nestjs/common';
import { RlsPostgresService } from './rls-postgres.service';
import { TenantDataPlacementRegistry } from './tenant-data-placement.registry';

@Global()
@Module({
  providers: [RlsPostgresService, TenantDataPlacementRegistry],
  exports: [RlsPostgresService, TenantDataPlacementRegistry],
})
export class DatabaseModule {}
