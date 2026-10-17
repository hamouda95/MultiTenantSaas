import { Controller, Post, Get, Body, Param, UseGuards, UsePipes } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { AuthenticatedUserContext, TenantContext } from '@saas/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateTenantDto,
  CreateTenantDtoSchema,
  AddMemberDto,
  AddMemberDtoSchema,
} from '../../common/dto/tenant.dto';

@Controller('api/v1/tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(CreateTenantDtoSchema))
  async createTenant(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() body: CreateTenantDto,
  ) {
    return this.tenantsService.createTenant({
      name: body.name,
      slug: body.slug,
      creatorUserId: user.userId,
      placementMode: body.placementMode,
      primaryColor: body.primaryColor,
    });
  }

  @Get(':tenantId')
  @UseGuards(TenantMembershipGuard)
  async getTenant(@CurrentTenant() tenant: TenantContext) {
    return this.tenantsService.getTenantById(tenant.tenantId);
  }

  @Get(':tenantId/members')
  @UseGuards(TenantMembershipGuard, RbacGuard)
  @RequirePermissions('members:read')
  async listMembers(@CurrentTenant() tenant: TenantContext) {
    return this.tenantsService.listMembers(tenant.tenantId);
  }

  @Post(':tenantId/members')
  @UseGuards(TenantMembershipGuard, RbacGuard)
  @RequirePermissions('members:manage')
  async addMember(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(AddMemberDtoSchema)) body: AddMemberDto,
  ) {
    return this.tenantsService.addMember(tenant.tenantId, body.email, body.role);
  }
}
