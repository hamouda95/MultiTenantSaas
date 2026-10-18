# Holding business operations

This is the first working import/retail business release, not a complete ERP or certified accounting product. Existing workspaces represent holdings; each holding owns separate companies. No demo records are inserted into real accounts.

## Try on an existing MacBook installation

From your existing clone (usually `~/MultiTenantSaas-local`):

```sh
git pull --ff-only origin feat/claude-frontend-integration
./scripts/local.sh
```

The launcher starts the existing database, applies additive idempotent migration 05, rebuilds the app and keeps the existing volume and credentials. Do not delete `.env.local-docker` or use `down --volumes`. Normal production upgrades require a verified backup and operator-run migration 05 before deploying the new API; automatic local migration is for the local launcher only.

Open your workspace. Its default page now opens **Gestion du holding**. The previous quotas/modules dashboard remains under **Administration SaaS**.

1. In **Sociétés & configuration**, create Polaris: country, operating currency, brands, supply lead time, target coverage, minimum stock and enabled modules. Review the generated workflow before confirming.
2. Select Polaris at the top. In **Catalogue & réseau**, create the central warehouse, stores, product variants (unique SKU + size/colour), supplier and a customer (a generic counter customer is supported).
3. In **Banques & trésorerie**, create a bank account and cash account with their manually verified opening balances and dates.
4. In **Achats & imports**, enter a purchase with multiple product lines, origin, ETA, supplier due date and landed charges. A manager approves it, then track Ordered → Shipped → Customs → Received. Receipt is complete, exactly once: it creates warehouse stock and the merchandise supplier payable.
5. Record freight/customs invoices separately under Treasury. Landed charges increase inventory cost but are not automatically added to the merchandise supplier payable.
6. In **Stocks & transferts**, distribute stock, or use **Intelligence** to review a suggested allocation and explicitly confirm it.
7. Enter a store sale. It decrements stock and creates a receivable. Record the actual collection in Treasury. Supplier payments work similarly; partial payments are supported.
8. Review company balances, amounts due, inventory value, cumulative sales/gross margin and a 30-day cash scenario in **Vue holding**. Export the company summary to CSV.
9. Invite staff under **Membres**, have them accept the invitation, then assign company access under **Accès sociétés**. A workspace membership alone exposes no company data to non-owners.

## Implemented scope and boundaries

| Capability                                                    | Status / actual behavior                                                                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Holdings, multiple companies, company onboarding              | Implemented; holding = tenant workspace; company currency fixed after creation                                                                                    |
| Brands, warehouses, stores, SKU variants, suppliers/customers | Implemented; brand names configured per company                                                                                                                   |
| Company permissions                                           | Implemented: holding Owner sees all; explicit Manager, Finance, Operations or Viewer grants for other active members                                              |
| Purchasing / import stages                                    | Implemented; full order receipt, manager approval, ETA delay alerts; no partial receipts, quotation comparison or attachments yet                                 |
| Inventory                                                     | Implemented: receipt, weighted average unit cost, justified adjustments, immediate transfers, movement ledger, unpaid full sale returns                           |
| Sales / margin                                                | Implemented manual multi-line sales, original COGS, unpaid complete returns; no POS connector or paid/partial refunds                                             |
| Bank / cash                                                   | Implemented recorded balances, expenses and same-company account transfers; no live bank feeds, overdrafts or statement reconciliation                            |
| Payables / receivables                                        | Implemented: automatic order/sale invoices, manual opening/other bills, partial settlements, overdue alerts; transactions in company currency only                |
| Reports                                                       | Implemented cumulative revenue, gross margin, recorded operating contribution, inventory, open purchases, balances and CSV export; no period comparison UI yet    |
| Replenishment                                                 | Implemented deterministic 30-day sales rule, minimum-stock cold start, shared warehouse cap, relative shortage priority, explicit confirmation                    |
| Cash forecast                                                 | Implemented scenario: current recorded cash + open receivables due by 30 days − open payables due by 30 days; not a probabilistic prediction                      |
| Accounting / tax                                              | Not implemented: double-entry journals, chart of accounts, VAT, fiscal closing, legal statements, fiscal invoices; operational figures are not certified accounts |
| Consolidation                                                 | Company-level comparison implemented; FX conversion and intercompany elimination/transfers not implemented; currencies are never added together                   |
| Staff / approvals                                             | Membership + company roles and purchase manager approval implemented; payroll, attendance, granular store restrictions and dual payment approval not implemented  |
| Documents / compliance                                        | Audit trail implemented; file uploads, import document storage and jurisdiction-specific validation not implemented                                               |
| Advanced AI                                                   | No LLM, trained forecasting, anomaly detection or natural-language assistant implemented; suggestions are explicitly described as rules                           |
| Integrations                                                  | Bank, POS, SMTP, accounting/tax, supplier and logistics integrations need implementation plus provider credentials; credentials alone do not activate them        |

Roles: Manager configures and operates their assigned company and records finance; Finance records partners and financial operations; Operations creates purchases/products/partners, advances already approved orders, transfers stock and records sales; Viewer reads the entire assigned company. Only holding Owners assign company access. Company roles do not currently restrict individual stores or hide treasury fields within an assigned company. Runtime API enforces these rules, regardless of frontend visibility. Do not grant company access if all company data should not be visible to that person.

## Data and money integrity

Money uses integer currency minor units (TND 3, JPY 0, other supported currencies 2). Quantities are whole units per SKU variant. Product average unit costs round to minor units, so operational stock values can have small rounding differences from aggregate purchase costs; statutory costing/reconciliation requires a future accounting implementation. Returns restore original sold unit costs. Sales returns are currently allowed only before collection; paid returns fail clearly rather than silently editing cash.

Each command validates a strict Zod schema, references only records within its company, checks the caller's current company grant, locks the holding ledger and checks the expected version. A stale screen gets 409 and must refresh. Unique command IDs plus actor/action hashes prevent replayed requests from duplicating receipts, sales or payments. Validation errors roll back the entire mutation; audit and data commit together. Runtime audit rows and processed command IDs are not editable/deletable by the app database role. Negative inventory, overpayment, insufficient recorded cash, invalid state transitions and duplicate references are rejected.

## Pilot persistence limit

`business_ledgers` stores a versioned JSONB document per holding, with PostgreSQL FORCE RLS on both ledger and command records. Company boundaries are enforced inside the business service/engine; they are not separate PostgreSQL row policies. Writes serialize per holding. Documents are capped at 8 MiB to bound memory and response sizes. This is suitable for a pilot, not high-volume deployment of 10 busy retailers. Before commercial rollout, migrate collections into normalized company-keyed tables with indexed queries/pagination, database company policies, archival/retention, backups, load tests and operational monitoring. Historical command records should not be pruned casually: they provide replay protection.

## Verification

The domain suite tests an approved Istanbul import through stock, sale and settlement; cost/margin arithmetic; account transfers/expenses; company isolation and role restrictions; manager approval; stock and cash limits; returns; allocation caps; and input validation. The real PostgreSQL suite checks persistence, replay payload protection, concurrent version conflicts, explicit company grants, denied writes, rollback and direct app-role RLS.

CI additionally builds both Docker images, starts the local-mode stack, runs a real Chromium purchase/receipt/transfer/sale/payment workflow and captures desktop/mobile screenshots. Its result is authoritative; local browser binaries and Docker are unavailable in the editing sandbox. See the PR checks for actual latest results.
