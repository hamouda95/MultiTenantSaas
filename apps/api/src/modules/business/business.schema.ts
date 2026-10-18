import { z } from "zod";
const id = z.string().uuid();
const text = z.string().trim().min(1).max(160);
const money = z.number().int().min(0).max(1_000_000_000_000);
const positive = money.min(1);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
const line = z
  .object({
    productId: id,
    quantity: z.number().int().min(1).max(1_000_000),
    unitPrice: money,
  })
  .strict();
const lines = z
  .array(line)
  .min(1)
  .max(100)
  .refine(
    (v) => new Set(v.map((x) => x.productId)).size === v.length,
    "Duplicate product lines",
  );
const company = z
  .object({
    name: text,
    currency: z.enum(["TND", "EUR", "USD", "TRY", "GBP", "JPY", "AED", "SAR"]),
    country: text,
    brands: z.array(text).max(30),
    leadDays: z.number().int().min(0).max(365),
    coverDays: z.number().int().min(1).max(365),
    minimumStock: z.number().int().min(0).max(100000),
    modules: z
      .array(
        z.enum(["purchasing", "inventory", "sales", "finance", "intelligence"]),
      )
      .max(5),
  })
  .strict();
export const BusinessCommandSchema = z
  .object({
    commandId: id,
    version: z.number().int().min(0),
    action: z.discriminatedUnion("type", [
      z.object({ type: z.literal("company.create"), data: company }).strict(),
      z
        .object({
          type: z.literal("company.configure"),
          companyId: id,
          data: company,
        })
        .strict(),
      z
        .object({
          type: z.literal("access.grant"),
          companyId: id,
          userId: id,
          role: z.enum(["MANAGER", "FINANCE", "OPERATIONS", "VIEWER"]),
        })
        .strict(),
      z
        .object({ type: z.literal("access.revoke"), companyId: id, userId: id })
        .strict(),
      z
        .object({
          type: z.literal("location.create"),
          companyId: id,
          name: text,
          kind: z.enum(["WAREHOUSE", "STORE"]),
        })
        .strict(),
      z
        .object({
          type: z.literal("product.create"),
          companyId: id,
          sku: text,
          name: text,
          brand: z.string().trim().max(160),
          size: z.string().trim().max(80),
          color: z.string().trim().max(80),
        })
        .strict(),
      z
        .object({
          type: z.literal("partner.create"),
          companyId: id,
          name: text,
          kind: z.enum(["SUPPLIER", "CUSTOMER"]),
          email: z.union([z.literal(""), z.string().email().max(254)]),
        })
        .strict(),
      z
        .object({
          type: z.literal("account.create"),
          companyId: id,
          name: text,
          kind: z.enum(["BANK", "CASH"]),
          opening: money,
          asOf: date,
        })
        .strict(),
      z
        .object({
          type: z.literal("order.create"),
          companyId: id,
          reference: text,
          supplierId: id,
          locationId: id,
          lines,
          origin: text,
          eta: date,
          dueDate: date,
          landedCharges: money,
        })
        .strict(),
      z
        .object({
          type: z.literal("order.transition"),
          companyId: id,
          orderId: id,
          status: z.enum([
            "APPROVED",
            "ORDERED",
            "SHIPPED",
            "CUSTOMS",
            "RECEIVED",
            "CANCELLED",
          ]),
        })
        .strict(),
      z
        .object({
          type: z.literal("stock.adjust"),
          companyId: id,
          productId: id,
          locationId: id,
          quantity: z
            .number()
            .int()
            .min(-1000000)
            .max(1000000)
            .refine((v) => v !== 0),
          unitCost: money,
          reason: text,
        })
        .strict(),
      z
        .object({
          type: z.literal("stock.transfer"),
          companyId: id,
          productId: id,
          fromId: id,
          toId: id,
          quantity: z.number().int().min(1).max(1000000),
        })
        .strict(),
      z
        .object({
          type: z.literal("sale.create"),
          companyId: id,
          reference: text,
          customerId: id,
          locationId: id,
          lines,
          dueDate: date,
        })
        .strict(),
      z
        .object({ type: z.literal("sale.return"), companyId: id, saleId: id })
        .strict(),
      z
        .object({
          type: z.literal("invoice.create"),
          companyId: id,
          reference: text,
          partnerId: id,
          kind: z.enum(["PAYABLE", "RECEIVABLE"]),
          amount: positive,
          dueDate: date,
        })
        .strict(),
      z
        .object({
          type: z.literal("payment.create"),
          companyId: id,
          invoiceId: id,
          accountId: id,
          amount: positive,
        })
        .strict(),
      z
        .object({
          type: z.literal("expense.create"),
          companyId: id,
          accountId: id,
          amount: positive,
          description: text,
        })
        .strict(),
      z
        .object({
          type: z.literal("cash.transfer"),
          companyId: id,
          fromId: id,
          toId: id,
          amount: positive,
        })
        .strict(),
    ]),
  })
  .strict();
export type BusinessCommand = z.infer<typeof BusinessCommandSchema>;
export type BusinessAction = BusinessCommand["action"];
