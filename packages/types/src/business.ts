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
  status?: "ACTIVE" | "ARCHIVED" | "DELETED";
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
  model?: string;
  name: string;
  brand: string;
  size: string;
  color: string;
  cost: number;
  salePrice?: number;
  barcode?: string;
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
  phone?: string;
  address?: string;
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
    | "PARTIALLY_RECEIVED"
    | "CANCELLED";
  origin: string;
  eta: string;
  dueDate: string;
  landedCharges: number;
  createdAt: string;
}
export interface BusinessInvoice {
  intercompanyId?: string;
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
  posSessionId?: string;
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
  posSessionId?: string;
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
  role:
    | "MANAGER"
    | "FINANCE"
    | "OPERATIONS"
    | "BUYER"
    | "WAREHOUSE"
    | "HR"
    | "VIEWER"
    | "CASHIER"
    | "STORE_MANAGER";
  locationIds?: string[];
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
  receipts?: PurchaseReceipt[];
  transfers?: StockTransfer[];
  intercompany?: IntercompanyCharge[];
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
  employees?: BusinessEmployee[];
  payroll?: BusinessPayroll[];
  payrollSummary?: {
    companyId: string;
    period: string;
    total: number;
    paid: number;
    accountId: string;
  }[];
  samples?: SupplierSample[];
  demoNotes?: { companyId: string; year: number; title: string }[];
  financings?: BusinessFinancing[];
  financingPayments?: FinancingPayment[];
  posConfigs?: PosConfig[];
  posSessions?: PosSession[];
  cashAdjustments?: {
    id: string;
    companyId: string;
    accountId: string;
    amount: number;
    reason: string;
    date: string;
  }[];
}
export interface BusinessSnapshot {
  hrAccess?: boolean;
  hrCompanyIds?: string[];
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

export interface PosConfig {
  id: string;
  companyId: string;
  locationId: string;
  cashAccountId: string;
  cardAccountId: string;
  customerId: string;
  maxDiscountBps: number;
}
export interface PosSession {
  id: string;
  companyId: string;
  locationId: string;
  userId: string;
  cashAccountId: string;
  opening: number;
  openedAt: string;
  closedAt?: string;
  counted?: number;
  expected?: number;
  variance?: number;
  reason?: string;
  reconciledAt?: string;
}
export interface PosSnapshot {
  version: number;
  userId: string;
  stores: {
    id: string;
    companyId: string;
    name: string;
    companyName: string;
    currency: string;
    canManage: boolean;
    canReconcile: boolean;
    configured: boolean;
    maxDiscountBps: number;
  }[];
  products: {
    id: string;
    companyId: string;
    sku: string;
    name: string;
    size: string;
    color: string;
    barcode: string;
    price: number;
  }[];
  customers: {
    id: string;
    companyId: string;
    name: string;
    email: string;
    phone: string;
  }[];
  availability: {
    productId: string;
    locationId: string;
    locationName: string;
    quantity: number;
  }[];
  sessions: PosSession[];
  tickets: {
    id: string;
    companyId: string;
    locationId: string;
    reference: string;
    customerId: string;
    date: string;
    total: number;
    returned: boolean;
    lines: BusinessLine[];
    tenders: { method: "CASH" | "CARD"; amount: number }[];
  }[];
}

export interface BusinessFinancing {
  id: string;
  companyId: string;
  reference: string;
  bank: string;
  accountId: string;
  orderId?: string;
  principal: number;
  interest: number;
  dueDate: string;
  createdAt: string;
  drawnAt?: string;
}
export interface FinancingPayment {
  id: string;
  companyId: string;
  financingId: string;
  accountId: string;
  principal: number;
  interest: number;
  date: string;
}

export interface BusinessEmployee {
  id: string;
  companyId: string;
  fullName: string;
  jobTitle: string;
  department: string;
  locationId?: string;
  grossSalary: number;
  employerChargesBps: number;
  hiredAt: string;
  status: "ACTIVE" | "INACTIVE";
}
export interface BusinessPayroll {
  id: string;
  companyId: string;
  employeeId: string;
  period: string;
  gross: number;
  employerCharges: number;
  total: number;
  createdAt: string;
  paidAt?: string;
  accountId?: string;
}
export interface SupplierSample {
  id: string;
  companyId: string;
  supplierId: string;
  model: string;
  reference: string;
  photoUrl: string;
  unitCost: number;
  minimumQuantity: number;
  leadDays: number;
  status: "PROPOSED" | "APPROVED";
  createdAt: string;
}

export interface PurchaseReceipt {
  id: string;
  companyId: string;
  orderId: string;
  reference: string;
  lines: { productId: string; quantity: number }[];
  landedCharges: number;
  invoiceId?: string;
  date: string;
}
export interface StockTransfer {
  id: string;
  companyId: string;
  reference: string;
  fromId: string;
  toId: string;
  lines: { productId: string; quantity: number; unitCost: number }[];
  status: "IN_TRANSIT" | "RECEIVED";
  date: string;
  receivedAt?: string;
}
export interface IntercompanyCharge {
  id: string;
  companyId: string;
  toCompanyId: string;
  reference: string;
  description: string;
  amount: number;
  date: string;
  receivableId: string;
  payableId: string;
}
