import type { BusinessCompany, BusinessState } from "./business";

export interface MonthlyOperatingResult {
  month: number;
  revenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingContribution: number;
  salesCount: number;
}

/** Date-scoped operational metrics, never a statutory accounting report. */
export function monthlyOperatingResults(
  state: BusinessState,
  company: BusinessCompany,
  year: number,
): MonthlyOperatingResult[] {
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    throw new RangeError("Invalid reporting year");
  const months: MonthlyOperatingResult[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1, revenue: 0, costOfGoodsSold: 0, grossProfit: 0,
    operatingExpenses: 0, operatingContribution: 0, salesCount: 0,
  }));
  const monthIndex = (date: string): number => {
    if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(date) || date.slice(0, 4) !== String(year)) return -1;
    const month = Number(date.slice(5, 7));
    return month >= 1 && month <= 12 ? month - 1 : -1;
  };
  for (const sale of state.sales) {
    if (sale.companyId !== company.id || sale.returned) continue;
    const index = monthIndex(sale.date);
    if (index < 0) continue;
    months[index].revenue += sale.total;
    months[index].costOfGoodsSold += sale.cost;
    months[index].salesCount++;
  }
  for (const expense of state.expenses) {
    if (expense.companyId !== company.id) continue;
    const index = monthIndex(expense.date);
    if (index >= 0) months[index].operatingExpenses += expense.amount;
  }
  for (const month of months) {
    month.grossProfit = month.revenue - month.costOfGoodsSold;
    month.operatingContribution = month.grossProfit - month.operatingExpenses;
  }
  return months;
}
