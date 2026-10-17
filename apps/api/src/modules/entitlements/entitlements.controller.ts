import { Controller, Get, Patch, Body, Param, UseGuards, UsePipes } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { TenantContext } from '@saas/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ToggleModuleDto, ToggleModuleDtoSchema } from '../../common/dto/module.dto';

@Controller('api/v1/tenants/:tenantId')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RbacGuard)
export class EntitlementsController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Get('modules')
  async getModules(@CurrentTenant() tenant: TenantContext) {
    return this.entitlementsService.getTenantModules(tenant.tenantId);
  }

  @Patch('modules/:moduleKey')
  @RequirePermissions('modules:manage')
  @UsePipes(new ZodValidationPipe(ToggleModuleDtoSchema))
  async toggleModule(
    @CurrentTenant() tenant: TenantContext,
    @Param('moduleKey') moduleKey: string,
    @Body() body: ToggleModuleDto,
  ) {
    return this.entitlementsService.toggleModule(
      tenant.tenantId,
      moduleKey,
      body.isEnabled,
      body.configuration,
    );
  }

  @Get('quotas')
  @RequirePermissions('quotas:read')
  async getQuotas(@CurrentTenant() tenant: TenantContext) {
    return this.entitlementsService.getQuota(tenant.tenantId);
  }
}
