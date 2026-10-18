import { describe, expect, it, vi, beforeEach } from "vitest";
import { ForbiddenException, NotFoundException, BadRequestException } from "@nestjs/common";
import { TenantContextService } from "../../common/tenant-context";
import { HrService } from "./hr.service";

const tenant = { tenantId:"11111111-1111-4111-8111-111111111111",
  membershipId:"22222222-2222-4222-8222-222222222222",roles:["Member"],permissions:[] };
const companyId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const employeeId = "55555555-5555-4555-8555-555555555555";
const employee = {id:employeeId,tenantId:tenant.tenantId,companyId,userId,displayName:"Example",startDate:"2025-01-01",endDate:null};
const state = {companies:[{id:companyId}],access:[] as Array<{companyId:string;userId:string;membershipId:string;role:string}>};
const db = { queryInTenantContext:vi.fn(),runInTenantContext:vi.fn() };
const service = new HrService(db as any);
describe("HR tenant/company authorization",()=>{
  beforeEach(()=>{
    vi.restoreAllMocks();db.queryInTenantContext.mockReset();db.runInTenantContext.mockReset();
    vi.spyOn(TenantContextService,"get").mockReturnValue({user:{userId,email:"example@test.invalid",isPlatformAdmin:false}} as any);
    state.access=[];
    db.queryInTenantContext.mockImplementation(async (_tenant:string,sql:string)=>{
      if(sql.includes("SELECT state FROM business_ledgers")) return {rows:[{state}]};
      if(sql.includes("SELECT 1 FROM hr_employees")) return {rows:[{exists:1}]};
      if(sql.includes("FROM hr_employees WHERE tenant_id") && sql.includes("AND id=$3")) return {rows:[employee]};
      return {rows:[]};
    });
  });
  it("rejects access to a company outside the holding",async()=>{
    await expect(service.employees(tenant,"66666666-6666-4666-8666-666666666666")).rejects.toBeInstanceOf(NotFoundException);
  });
  it("restricts unprivileged members to their own employee record",async()=>{
    await service.employees(tenant,companyId);
    const call = db.queryInTenantContext.mock.calls.at(-1)!;
    expect(call[1]).toContain("AND user_id=$3");
    expect(call[2][2]).toBe(userId);
  });
  it("prevents unprivileged members from creating employees",async()=>{
    await expect(service.createEmployee(tenant,companyId,{displayName:"Another",startDate:"2025-01-01"}))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
  it("does not equate company MANAGER with HR manager without HR permission",async()=>{
    state.access=[{companyId,userId,membershipId:tenant.membershipId,role:"MANAGER"}];
    await expect(service.createEmployee(tenant,companyId,{displayName:"Another",startDate:"2025-01-01"}))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
  it("rejects leave creation for a different employee",async()=>{
    db.queryInTenantContext.mockImplementation(async (_tenant:string,sql:string)=>{
      if(sql.includes("SELECT state FROM business_ledgers")) return {rows:[{state}]};
      if(sql.includes("SELECT 1 FROM hr_employees")) return {rows:[{exists:1}]};
      if(sql.includes("FROM hr_employees WHERE tenant_id")) return {rows:[{...employee,userId:"77777777-7777-4777-8777-777777777777"}]};
      return {rows:[]};
    });
    await expect(service.createLeave(tenant,companyId,{employeeId,startsOn:"2025-06-01",endsOn:"2025-06-02"}))
      .rejects.toThrow("HR access denied");
  });
  it("requires an active tenant membership when linking a user",async()=>{
    const privileged = {...tenant,roles:["Owner"]};
    await expect(service.createEmployee(privileged,companyId,{displayName:"New",startDate:"2025-01-01",userId}))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
