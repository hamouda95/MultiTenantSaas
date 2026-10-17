import { Controller, Get, Patch, Body, UseGuards, UsePipes } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { TenantContext } from '@saas/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UpdateSettingsDto, UpdateSettingsDtoSchema } from '../../common/dto/settings.dto';

@Controller('api/v1/tenants/:tenantId/settings')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RbacGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions('settings:read')
  async getSettings(@CurrentTenant() tenant: TenantContext) {
    return this.settingsService.getSettings(tenant.tenantId);
  }

  @Patch()
  @RequirePermissions('settings:manage')
  @UsePipes(new ZodValidationPipe(UpdateSettingsDtoSchema))
  async updateSettings(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UpdateSettingsDto,
  ) {
    return this.settingsService.updateSettings(tenant.tenantId, {
      logoUrl: body.logoUrl,
      primaryColor: body.primaryColor,
      accentColor: body.accentColor,
      themeMode: body.themeMode,
      customDomain: body.customDomain,
    });
  }
}
