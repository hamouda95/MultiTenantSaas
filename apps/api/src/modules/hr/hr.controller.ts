import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseFilters,
  Inject,
} from "@nestjs/common";
import { z } from "zod";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantMembershipGuard } from "../../common/guards/tenant-membership.guard";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { TenantContext } from "@saas/types";
import { HrErrorFilter } from "./hr-error.filter";
import { HrService } from "./hr.service";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const employee = z
  .object({
    displayName: z.string().trim().min(1).max(255),
    userId: z.string().uuid().nullable().optional(),
    startDate: date,
    endDate: date.nullable().optional(),
  })
  .strict();
const contract = z
  .object({
    employeeId: z.string().uuid(),
    startDate: date,
    endDate: date.nullable().optional(),
    monthlyGrossMinor: z.number().int().nonnegative().safe(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
const leave = z
  .object({
    employeeId: z.string().uuid(),
    startsOn: date,
    endsOn: date,
  })
  .strict();
const decision = z
  .object({ status: z.enum(["APPROVED", "REJECTED"]) })
  .strict();
@Controller("api/v1/tenants/:tenantId/hr")
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
@UseFilters(HrErrorFilter)
export class HrController {
  constructor(@Inject(HrService) private readonly hr: HrService) {}
  @Get("companies")
  companies(@CurrentTenant() tenant: TenantContext) {
    return this.hr.companies(tenant);
  }
  @Get("companies/:companyId/employees")
  employees(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
  ) {
    return this.hr.employees(tenant, companyId);
  }
  @Get("companies/:companyId/contracts")
  contracts(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
  ) {
    return this.hr.contracts(tenant, companyId);
  }
  @Get("companies/:companyId/leave")
  leaves(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
  ) {
    return this.hr.leaves(tenant, companyId);
  }
  @Post("companies/:companyId/employees")
  createEmployee(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
    @Body(new ZodValidationPipe(employee)) body: z.infer<typeof employee>,
  ) {
    return this.hr.createEmployee(tenant, companyId, body);
  }
  @Post("companies/:companyId/contracts")
  createContract(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
    @Body(new ZodValidationPipe(contract)) body: z.infer<typeof contract>,
  ) {
    return this.hr.createContract(tenant, companyId, body);
  }
  @Post("companies/:companyId/leave")
  createLeave(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
    @Body(new ZodValidationPipe(leave)) body: z.infer<typeof leave>,
  ) {
    return this.hr.createLeave(tenant, companyId, body);
  }
  @Patch("companies/:companyId/leave/:leaveId")
  decide(
    @CurrentTenant() tenant: TenantContext,
    @Param("companyId") companyId: string,
    @Param("leaveId") leaveId: string,
    @Body(new ZodValidationPipe(decision)) body: z.infer<typeof decision>,
  ) {
    return this.hr.decide(tenant, companyId, leaveId, body.status);
  }
}
