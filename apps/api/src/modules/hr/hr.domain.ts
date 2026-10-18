/** Pure HR domain rules. All operations require a server-resolved tenant/company scope. */
export type HrRole = "HR_MANAGER" | "COMPANY_MANAGER" | "EMPLOYEE";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";
export interface HrScope {
  tenantId: string;
  companyIds: readonly string[];
  actorUserId: string;
  role: HrRole;
}
export interface Employee {
  id: string;
  tenantId: string;
  companyId: string;
  userId: string | null;
  displayName: string;
  startDate: string;
  endDate: string | null;
}
export interface EmploymentContract {
  id: string;
  tenantId: string;
  companyId: string;
  employeeId: string;
  startDate: string;
  endDate: string | null;
  monthlyGrossMinor: number;
  currency: string;
}
export interface LeaveRequest {
  id: string;
  tenantId: string;
  companyId: string;
  employeeId: string;
  startsOn: string;
  endsOn: string;
  status: LeaveStatus;
  decidedBy: string | null;
}
export class HrAccessDenied extends Error {
  constructor() {
    super("HR access denied");
    this.name = "HrAccessDenied";
  }
}
export class HrValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HrValidationError";
  }
}
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
export function validateDate(value: string): void {
  if (
    !isoDate.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value
  )
    throw new HrValidationError("Invalid calendar date");
}
export function validatePeriod(start: string, end: string | null): void {
  validateDate(start);
  if (end !== null) {
    validateDate(end);
    if (end < start)
      throw new HrValidationError("End date precedes start date");
  }
}
export function canReadEmployee(scope: HrScope, employee: Employee): boolean {
  if (
    scope.tenantId !== employee.tenantId ||
    !scope.companyIds.includes(employee.companyId)
  )
    return false;
  return (
    scope.role === "HR_MANAGER" ||
    scope.role === "COMPANY_MANAGER" ||
    (scope.role === "EMPLOYEE" && employee.userId === scope.actorUserId)
  );
}
export function assertEmployeeAccess(scope: HrScope, employee: Employee): void {
  if (!canReadEmployee(scope, employee)) throw new HrAccessDenied();
}
export function assertHrManager(
  scope: HrScope,
  tenantId: string,
  companyId: string,
): void {
  if (
    scope.tenantId !== tenantId ||
    !scope.companyIds.includes(companyId) ||
    scope.role !== "HR_MANAGER"
  )
    throw new HrAccessDenied();
}
export function validateContract(
  contract: EmploymentContract,
  employee: Employee,
): void {
  if (
    contract.tenantId !== employee.tenantId ||
    contract.companyId !== employee.companyId ||
    contract.employeeId !== employee.id
  )
    throw new HrValidationError("Contract and employee scope mismatch");
  validatePeriod(contract.startDate, contract.endDate);
  if (
    !Number.isSafeInteger(contract.monthlyGrossMinor) ||
    contract.monthlyGrossMinor < 0
  )
    throw new HrValidationError(
      "Gross pay must be non-negative integer minor units",
    );
  if (!/^[A-Z]{3}$/.test(contract.currency))
    throw new HrValidationError("Invalid currency");
}
export function requestLeave(
  scope: HrScope,
  employee: Employee,
  id: string,
  startsOn: string,
  endsOn: string,
): LeaveRequest {
  assertEmployeeAccess(scope, employee);
  validatePeriod(startsOn, endsOn);
  if (
    employee.startDate > startsOn ||
    (employee.endDate && employee.endDate < endsOn)
  )
    throw new HrValidationError("Leave falls outside employment dates");
  if (!id) throw new HrValidationError("Leave ID is required");
  return {
    id,
    tenantId: employee.tenantId,
    companyId: employee.companyId,
    employeeId: employee.id,
    startsOn,
    endsOn,
    status: "PENDING",
    decidedBy: null,
  };
}
export function decideLeave(
  scope: HrScope,
  employee: Employee,
  leave: LeaveRequest,
  decision: "APPROVED" | "REJECTED",
): LeaveRequest {
  assertHrManager(scope, employee.tenantId, employee.companyId);
  if (
    leave.tenantId !== employee.tenantId ||
    leave.companyId !== employee.companyId ||
    leave.employeeId !== employee.id
  )
    throw new HrValidationError("Leave and employee scope mismatch");
  if (leave.status !== "PENDING")
    throw new HrValidationError("Leave already decided");
  return { ...leave, status: decision, decidedBy: scope.actorUserId };
}
