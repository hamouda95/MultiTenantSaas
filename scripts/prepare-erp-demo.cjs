/** Offline, additive extension for an explicitly fictional holding. Never opens a database connection.
 * Input: {version, seed_input:{companies,locations,products,partners}} read from that demo holding.
 * Output: append-only collections, validated with the production command schema/domain engine.
 */
const fs = require("node:fs"),
  { randomUUID } = require("node:crypto");
const {
  emptyBusiness,
  applyBusiness,
} = require("../apps/api/dist/modules/business/business.engine");
const {
  BusinessCommandSchema,
} = require("../apps/api/dist/modules/business/business.schema");
const { groupAnnual } = require("../packages/types/dist");
function prepare(input, actorId) {
  const s = { ...emptyBusiness(), ...structuredClone(input.seed_input) };
  const company = s.companies.find(
    (c) =>
      c.name === "Polaris Footwear" && (!c.status || c.status === "ACTIVE"),
  );
  const other = s.companies.find(
    (c) =>
      c.id !== company?.id &&
      c.currency === "TND" &&
      (!c.status || c.status === "ACTIVE") &&
      c.modules.includes("finance"),
  );
  if (!company || !other || company.currency !== "TND")
    throw Error("Expected active fictional TND companies");
  const product = s.products.find(
    (p) => p.companyId === company.id && p.cost > 0,
  );
  const supplier = s.partners.find(
    (p) => p.companyId === company.id && p.kind === "SUPPLIER",
  );
  const warehouse = s.locations.find(
      (l) => l.companyId === company.id && l.kind === "WAREHOUSE",
    ),
    store = s.locations.find(
      (l) => l.companyId === company.id && l.kind === "STORE",
    );
  if (!product || !supplier || !warehouse || !store)
    throw Error("Incomplete demo master data");
  const beforePartners = s.partners.length,
    originalCosts = s.products.map((p) => p.cost);
  let commands = 0;
  const run = (action, date = "2026-10-18") => {
    const parsed = BusinessCommandSchema.parse({
      commandId: randomUUID(),
      version: input.version + commands,
      action: { companyId: company.id, ...action },
    });
    applyBusiness(s, parsed.action, actorId, true, `${date}T12:00:00.000Z`);
    commands++;
  };
  run({
    type: "order.create",
    reference: "DEMO-ERP-ACHAT-PARTIEL",
    supplierId: supplier.id,
    locationId: warehouse.id,
    origin: "Istanbul — exemple ERP fictif",
    eta: "2026-10-18",
    dueDate: "2026-11-18",
    landedCharges: 0,
    lines: [{ productId: product.id, quantity: 100, unitPrice: product.cost }],
  });
  const order = s.orders.at(-1);
  for (const status of ["APPROVED", "ORDERED", "SHIPPED", "CUSTOMS"])
    run({ type: "order.transition", orderId: order.id, status });
  run({
    type: "order.receive",
    orderId: order.id,
    reference: "DEMO-ERP-BR-40",
    lines: [{ productId: product.id, quantity: 40 }],
  });
  run({
    type: "stock.ship",
    reference: "DEMO-ERP-TRANSIT-10",
    fromId: warehouse.id,
    toId: store.id,
    lines: [{ productId: product.id, quantity: 10 }],
  });
  run(
    {
      type: "intercompany.create",
      toCompanyId: other.id,
      reference: "DEMO-ERP-SERVICES-2025",
      description:
        "Prestation logistique interne fictive pour illustrer les éliminations de gestion",
      amount: 12000000,
      dueDate: "2025-12-31",
    },
    "2025-12-31",
  );
  if (s.products.some((p, i) => p.cost !== originalCosts[i]))
    throw Error("Extension must not modify existing product costs");
  const append = {
    orders: s.orders,
    receipts: s.receipts,
    transfers: s.transfers,
    intercompany: s.intercompany,
    partners: s.partners.slice(beforePartners),
    invoices: s.invoices,
    movements: s.movements,
    events: s.events,
  };
  const report = groupAnnual(s, [company.id, other.id], 2025, "TND");
  if (
    report.elimination !== 12000000 ||
    report.consolidated.revenue !== 0 ||
    report.consolidated.beforeTax !== 0
  )
    throw Error("Unbalanced internal elimination");
  return {
    baseVersion: input.version,
    commands,
    append,
    companyId: company.id,
    toCompanyId: other.id,
    receiptQuantity: 40,
    remaining: 60,
    transitQuantity: 10,
    elimination: 12000000,
  };
}
module.exports = { prepare };
if (require.main === module) {
  const [inputPath, outputPath, actorId] = process.argv.slice(2);
  if (!inputPath || !outputPath || !actorId)
    throw Error(
      "Usage: node scripts/prepare-erp-demo.cjs input.json output.json owner_uuid",
    );
  const result = prepare(
    JSON.parse(fs.readFileSync(inputPath, "utf8")),
    actorId,
  );
  fs.writeFileSync(outputPath, JSON.stringify(result));
  console.log(
    JSON.stringify({
      commands: result.commands,
      receiptQuantity: result.receiptQuantity,
      remaining: result.remaining,
      transitQuantity: result.transitQuantity,
      elimination: result.elimination,
    }),
  );
}
