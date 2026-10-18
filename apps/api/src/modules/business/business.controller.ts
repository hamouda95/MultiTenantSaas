import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantMembershipGuard } from "../../common/guards/tenant-membership.guard";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { TenantContext } from "@saas/types";
import { BusinessService } from "./business.service";
import { BusinessCommand, BusinessCommandSchema } from "./business.schema";
@Controller("api/v1/tenants/:tenantId/business")
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
export class BusinessController {
  constructor(private readonly business: BusinessService) {}
  @Get() snapshot(@CurrentTenant() tenant: TenantContext) {
    return this.business.snapshot(tenant);
  }
  @Post("commands") execute(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(BusinessCommandSchema)) body: BusinessCommand,
  ) {
    return this.business.execute(tenant, body);
  }
}
