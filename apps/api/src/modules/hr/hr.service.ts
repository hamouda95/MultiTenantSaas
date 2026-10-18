import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { RlsPostgresService } from "../../database/rls-postgres.service";
import { TenantContextService } from "../../common/tenant-context";
import type { TenantContext } from "@saas/types";
import { validatePeriod, validateContract, requestLeave, decideLeave, type Employee, type HrScope, type LeaveRequest } from "./hr.domain";

@Injectable()
export class HrService {
  constructor(private readonly db: RlsPostgresService) {}

  private async scope(tenant: TenantContext, companyId: string): Promise<HrScope> {
    const user = TenantContextService.get()?.user;
    if (!user?.userId) throw new ForbiddenException();
    const ledger = await this.db.queryInTenantContext(
      tenant.tenantId, "SELECT state FROM business_ledgers WHERE tenant_id=$1", [tenant.tenantId],
    );
    const state = ledger.rows[0]?.state;
    if (!state?.companies?.some((company: {id:string}) => company.id === companyId))
      throw new NotFoundException("Company not found");
    const owner = user.isPlatformAdmin || tenant.roles.includes("Owner");
    const grant = state.access?.find((item: {companyId:string;userId:string;membershipId?:string;role:string}) =>
      item.companyId === companyId && item.userId === user.userId &&
      item.membershipId === tenant.membershipId);
    const role = owner || grant?.role === "MANAGER" ? "HR_MANAGER" :
      grant?.role === "OPERATIONS" ? "COMPANY_MANAGER" : "EMPLOYEE";
    if (!owner && !grant) {
      // Employees without a company grant can only use self-service via their linked user_id.
      const linked = await this.db.queryInTenantContext(tenant.tenantId,
        "SELECT 1 FROM hr_employees WHERE tenant_id=$1 AND company_id=$2 AND user_id=$3 LIMIT 1",
        [tenant.tenantId, companyId, user.userId]);
      if (!linked.rows.length) throw new ForbiddenException();
    }
    return { tenantId: tenant.tenantId, companyIds: [companyId], actorUserId: user.userId, role };
  }

  async employees(tenant: TenantContext, companyId: string) {
    const scope = await this.scope(tenant, companyId);
    const sql = scope.role === "HR_MANAGER" || scope.role === "COMPANY_MANAGER"
      ? "SELECT id,tenant_id AS \"tenantId\",company_id AS \"companyId\",user_id AS \"userId\",display_name AS \"displayName\",start_date::text AS \"startDate\",end_date::text AS \"endDate\" FROM hr_employees WHERE tenant_id=$1 AND company_id=$2"
      : "SELECT id,tenant_id AS \"tenantId\",company_id AS \"companyId\",user_id AS \"userId\",display_name AS \"displayName\",start_date::text AS \"startDate\",end_date::text AS \"endDate\" FROM hr_employees WHERE tenant_id=$1 AND company_id=$2 AND user_id=$3";
    const result = await this.db.queryInTenantContext(tenant.tenantId, sql,
      scope.role === "EMPLOYEE" ? [tenant.tenantId, companyId, scope.actorUserId] : [tenant.tenantId, companyId]);
    return result.rows;
  }

  async createEmployee(tenant: TenantContext, companyId: string, data: {
    displayName: string; userId?: string | null; startDate: string; endDate?: string | null;
  }) {
    const scope = await this.scope(tenant, companyId);
    if (scope.role !== "HR_MANAGER") throw new ForbiddenException();
    validatePeriod(data.startDate, data.endDate ?? null);
    if (!data.displayName.trim() || data.displayName.length > 255) throw new BadRequestException("Invalid name");
    const result = await this.db.queryInTenantContext(tenant.tenantId,
      "INSERT INTO hr_employees(id,tenant_id,company_id,user_id,display_name,start_date,end_date) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [randomUUID(),tenant.tenantId,companyId,data.userId ?? null,data.displayName.trim(),data.startDate,data.endDate ?? null]);
    return { id: result.rows[0].id };
  }

  async createContract(tenant: TenantContext, companyId: string, data: {
    employeeId: string; startDate: string; endDate?: string | null;
    monthlyGrossMinor: number; currency: string;
  }) {
    const scope = await this.scope(tenant, companyId);
    if (scope.role !== "HR_MANAGER") throw new ForbiddenException();
    const employee = await this.employee(tenant.tenantId, companyId, data.employeeId);
    validateContract({ id: randomUUID(), tenantId: tenant.tenantId, companyId,
      employeeId: data.employeeId, startDate: data.startDate, endDate: data.endDate ?? null,
      monthlyGrossMinor: data.monthlyGrossMinor, currency: data.currency }, employee);
    const result = await this.db.queryInTenantContext(tenant.tenantId,
      "INSERT INTO hr_contracts(id,tenant_id,company_id,employee_id,start_date,end_date,monthly_gross_minor,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
      [randomUUID(),tenant.tenantId,companyId,data.employeeId,data.startDate,data.endDate ?? null,data.monthlyGrossMinor,data.currency]);
    return { id: result.rows[0].id };
  }

  private async employee(tenantId: string, companyId: string, employeeId: string): Promise<Employee> {
    const result = await this.db.queryInTenantContext(tenantId,
      'SELECT id,tenant_id AS "tenantId",company_id AS "companyId",user_id AS "userId",display_name AS "displayName",start_date::text AS "startDate",end_date::text AS "endDate" FROM hr_employees WHERE tenant_id=$1 AND company_id=$2 AND id=$3',
      [tenantId,companyId,employeeId]);
    if (!result.rows.length) throw new NotFoundException("Employee not found");
    return result.rows[0] as Employee;
  }

  async createLeave(tenant: TenantContext, companyId: string, data: {
    employeeId: string; startsOn: string; endsOn: string;
  }) {
    const scope = await this.scope(tenant, companyId);
    const employee = await this.employee(tenant.tenantId,companyId,data.employeeId);
    const leave = requestLeave(scope,employee,randomUUID(),data.startsOn,data.endsOn);
    await this.db.queryInTenantContext(tenant.tenantId,
      "INSERT INTO hr_leave_requests(id,tenant_id,company_id,employee_id,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6)",
      [leave.id,tenant.tenantId,companyId,employee.id,leave.startsOn,leave.endsOn]);
    return { id: leave.id, status: leave.status };
  }

  async decide(tenant: TenantContext, companyId: string, leaveId: string, status: "APPROVED" | "REJECTED") {
    const scope = await this.scope(tenant,companyId);
    if (scope.role !== "HR_MANAGER") throw new ForbiddenException();
    return this.db.runInTenantContext(tenant.tenantId, async client => {
      const row = await client.query(
        "SELECT id,tenant_id,company_id,employee_id,starts_on::text,ends_on::text,status,decided_by FROM hr_leave_requests WHERE tenant_id=$1 AND company_id=$2 AND id=$3 FOR UPDATE",
        [tenant.tenantId,companyId,leaveId]);
      if (!row.rows.length) throw new NotFoundException("Leave not found");
      const x = row.rows[0];
      const employee = await client.query(
        'SELECT id,tenant_id AS "tenantId",company_id AS "companyId",user_id AS "userId",display_name AS "displayName",start_date::text AS "startDate",end_date::text AS "endDate" FROM hr_employees WHERE tenant_id=$1 AND company_id=$2 AND id=$3',
        [tenant.tenantId,companyId,x.employee_id]);
      if (!employee.rows.length) throw new NotFoundException("Employee not found");
      const leave: LeaveRequest = { id:x.id,tenantId:x.tenant_id,companyId:x.company_id,
        employeeId:x.employee_id,startsOn:x.starts_on,endsOn:x.ends_on,status:x.status,decidedBy:x.decided_by };
      const result = decideLeave(scope,employee.rows[0] as Employee,leave,status);
      await client.query("UPDATE hr_leave_requests SET status=$1,decided_by=$2 WHERE id=$3 AND tenant_id=$4",
        [result.status,result.decidedBy,leaveId,tenant.tenantId]);
      return { id: result.id, status: result.status };
    });
  }
}
