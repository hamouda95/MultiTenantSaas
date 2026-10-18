# ERP RH / Finance — development contract

This branch is isolated from main and from the ongoing POS/finance PR #4.

## Non-negotiable invariants
- Every HR record is scoped by tenant and company; access is checked in the API and with PostgreSQL RLS.
- Employees may read only their own personal records; HR managers may access only granted companies.
- Payroll is illustrative until country-specific legal rules, tax and social charges are implemented.
- A loan drawdown is not revenue, and principal repayment is not an expense. Interest is an expense.
- Never seed a live customer tenant; the demonstration must have a unique explicit demo tenant and idempotent fixtures.
- Additive migrations only, with a disposable-database integration test before deployment.

## Vertical slice 1
1. HR employee and employment contract entities, company assignments and scoped role checks.
2. Absence requests and approval lifecycle.
3. Payroll period and payslip simulation, with auditable calculations.
4. CEO/CFO annual P&L read model, company detail and holding consolidation.
5. Employee self-service read and leave-request UI.
6. Unit, PostgreSQL RLS and HTTP integration tests.

## Acceptance
- No cross-tenant or cross-company HR leakage.
- No salary information exposed through generic dashboard endpoints.
- P&L can reconcile to business source records.
- No production deployment until tests and review.
