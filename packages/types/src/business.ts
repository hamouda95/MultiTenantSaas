/** Money is integer currency minor units; quantities are whole product variants. */
export interface BusinessCompany {
  id: string;
  name: string;
  currency: string;
  country: string;
  brands: string[];
  leadDays: number;
  coverDays: number;
  minimumStock: number;
  modules: string[];
}
export interface BusinessLocation {
  id: string;
  companyId: string;
  name: string;
  kind: "WAREHOUSE" | "STORE";
}
export interface BusinessProduct {
  id: string;
  companyId: string;
  sku: string;
  name: string;
  brand: string;
  size: string;
  color: string;
  cost: number;
}
export interface BusinessAccount {
  id: string;
  companyId: string;
  name: string;
  kind: "BANK" | "CASH";
  opening: number;
  source: "MANUAL";
  asOf: string;
}
export interface BusinessPartner {
  id: string;
  companyId: string;
  name: string;
  kind: "SUPPLIER" | "CUSTOMER";
  email: string;
}
export interface BusinessLine {
  productId: string;
  quantity: number;
  unitPrice: number;
}
export interface BusinessOrder {
  id: string;
  companyId: string;
  reference: string;
  supplierId: string;
  locationId: string;
  lines: BusinessLine[];
  status:
    | "DRAFT"
    | "APPROVED"
    | "ORDERED"
    | "SHIPPED"
    | "CUSTOMS"
    | "RECEIVED"
    | "CANCELLED";
  origin: string;
  eta: string;
  dueDate: string;
  landedCharges: number;
  createdAt: string;
}
export interface BusinessInvoice {
  id: string;
  companyId: string;
  kind: "PAYABLE" | "RECEIVABLE";
  reference: string;
  partnerId: string;
  amount: number;
  dueDate: string;
  sourceId: string;
  createdAt: string;
}
export interface BusinessPayment {
  id: string;
  companyId: string;
  invoiceId: string;
  accountId: string;
  amount: number;
  date: string;
}
export interface BusinessMovement {
  id: string;
  companyId: string;
  productId: string;
  locationId: string;
  quantity: number;
  reason: string;
  sourceId: string;
  date: string;
}
export interface BusinessSale {
  id: string;
  companyId: string;
  reference: string;
  customerId: string;
  locationId: string;
  lines: BusinessLine[];
  unitCosts: Record<string, number>;
  cost: number;
  total: number;
  returned: boolean;
  date: string;
}
export interface BusinessExpense {
  id: string;
  companyId: string;
  accountId: string;
  amount: number;
  description: string;
  date: string;
}
export interface BusinessCashTransfer {
  id: string;
  companyId: string;
  fromId: string;
  toId: string;
  amount: number;
  date: string;
}
export interface BusinessAccess {
  /** Bound to this invitation/membership lifetime; rejoining requires a new grant. */
  membershipId?: string;
  companyId: string;
  userId: string;
  role: "MANAGER" | "FINANCE" | "OPERATIONS" | "VIEWER";
}
export interface BusinessEvent {
  id: string;
  companyId: string;
  action: string;
  actorId: string;
  date: string;
  reference: string;
}
export interface BusinessState {
  companies: BusinessCompany[];
  locations: BusinessLocation[];
  products: BusinessProduct[];
  accounts: BusinessAccount[];
  partners: BusinessPartner[];
  orders: BusinessOrder[];
  invoices: BusinessInvoice[];
  payments: BusinessPayment[];
  movements: BusinessMovement[];
  sales: BusinessSale[];
  expenses: BusinessExpense[];
  cashTransfers: BusinessCashTransfer[];
  access: BusinessAccess[];
  events: BusinessEvent[];
}
export interface BusinessSnapshot {
  version: number;
  state: BusinessState;
  holdingOwner: boolean;
  userId: string;
}
export interface ReplenishmentSuggestion {
  productId: string;
  storeId: string;
  warehouseId: string;
  sold: number;
  dailyDemand: number;
  stock: number;
  target: number;
  quantity: number;
  available: number;
  confidence: "LOW" | "MEDIUM";
  explanation: string;
}
