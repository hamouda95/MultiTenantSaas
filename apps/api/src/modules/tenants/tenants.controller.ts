import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { z } from "zod";
import { TenantsService } from "./tenants.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantMembershipGuard } from "../../common/guards/tenant-membership.guard";
import { RbacGuard } from "../../common/guards/rbac.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { AuthenticatedUserContext, TenantContext } from "@saas/types";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  CreateTenantDto,
  CreateTenantDtoSchema,
  AddMemberDto,
  AddMemberDtoSchema,
} from "../../common/dto/tenant.dto";

@Controller("api/v1/tenants")
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  async createTenant(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body(new ZodValidationPipe(CreateTenantDtoSchema)) body: CreateTenantDto,
  ) {
    return this.tenantsService.createTenant({
      name: body.name,
      slug: body.slug,
      creatorUserId: user.userId,
      placementMode: body.placementMode,
      primaryColor: body.primaryColor,
    });
  }

  @Post("invitations/accept")
  async acceptInvitation(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body(
      new ZodValidationPipe(
        z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }),
      ),
    )
    body: { token: string },
  ) {
    return this.tenantsService.acceptInvitation(body.token, user.userId);
  }

  @Patch(":tenantId/members/:membershipId")
  @UseGuards(TenantMembershipGuard, RbacGuard)
  @RequirePermissions("members:manage")
  async updateMember(
    @CurrentTenant() tenant: TenantContext,
    @Param("membershipId", new ZodValidationPipe(z.string().uuid())) id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ role: z.enum(["Owner", "Member", "Viewer"]) }),
      ),
    )
    body: { role: string },
  ) {
    return this.tenantsService.updateMember(tenant.tenantId, id, body.role);
  }

  @Delete(":tenantId/members/:membershipId")
  @UseGuards(TenantMembershipGuard, RbacGuard)
  @RequirePermissions("members:manage")
  async removeMember(
    @CurrentTenant() tenant: TenantContext,
    @Param("membershipId", new ZodValidationPipe(z.string().uuid())) id: string,
  ) {
    return this.tenantsService.updateMember(
      tenant.tenantId,
      id,
      undefined,
      true,
    );
  }

  @Get(":tenantId")
  @UseGuards(TenantMembershipGuard)
  async getTenant(@CurrentTenant() tenant: TenantContext) {
    return this.tenantsService.getTenantById(tenant.tenantId);
  }

  @Get(":tenantId/members")
  @UseGuards(TenantMembershipGuard, RbacGuard)
  @RequirePermissions("members:read")
  async listMembers(@CurrentTenant() tenant: TenantContext) {
    return this.tenantsService.listMembers(tenant.tenantId);
  }

  @Post(":tenantId/members")
  @UseGuards(TenantMembershipGuard, RbacGuard)
  @RequirePermissions("members:manage")
  async addMember(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(AddMemberDtoSchema)) body: AddMemberDto,
  ) {
    return this.tenantsService.addMember(
      tenant.tenantId,
      body.email,
      body.role,
    );
  }
}
