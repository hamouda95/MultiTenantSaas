import type { BusinessCompany, BusinessState } from "./business";

/** Operational period result, not statutory accounting or a certified P&L. */
export function periodOperatingResult(
  state: BusinessState,
  company: BusinessCompany,
  year: number,
) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    throw new RangeError("Invalid reporting year");
  const withinYear = (date: string) => date.slice(0, 4) === String(year);
  const sales = state.sales.filter(
    (sale) => sale.companyId === company.id && !sale.returned && withinYear(sale.date),
  );
  const expenses = state.expenses.filter(
    (expense) => expense.companyId === company.id && withinYear(expense.date),
  );
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const costOfGoodsSold = sales.reduce((sum, sale) => sum + sale.cost, 0);
  const operatingExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  return {
    year,
    companyId: company.id,
    currency: company.currency,
    revenue,
    costOfGoodsSold,
    grossProfit: revenue - costOfGoodsSold,
    operatingExpenses,
    operatingContribution: revenue - costOfGoodsSold - operatingExpenses,
    salesCount: sales.length,
  };
}
