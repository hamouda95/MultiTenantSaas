/** Creates ONLY an offline fictional ledger. Does not connect to a database.
 * Build @saas/types and @saas/api first. Output may be installed into a NEW demo tenant only.
 * Dates deliberately fixed for a reproducible 2025 CEO report and October 2026 walkthrough.
 */
const { randomUUID } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const {
  emptyBusiness,
  applyBusiness,
  stock,
  balance,
} = require("../apps/api/dist/modules/business/business.engine");
const {
  BusinessCommandSchema,
} = require("../apps/api/dist/modules/business/business.schema");
const { annualPnl, companyMetrics } = require("../packages/types/dist");
function buildDemo(actorId = "00000000-0000-4000-8000-000000000001") {
  const s = emptyBusiness();
  let commands = 0;
  function command(a, date = "2025-01-01") {
    const parsed = BusinessCommandSchema.parse({
      commandId: randomUUID(),
      version: commands,
      action: a,
    });
    applyBusiness(s, parsed.action, actorId, true, `${date}T12:00:00.000Z`);
    commands++;
  }
  function last(list) {
    return list[list.length - 1];
  }
  const modules = [
    "purchasing",
    "inventory",
    "sales",
    "finance",
    "intelligence",
    "hr",
  ];
  const definitions = [
    [
      "Polaris Footwear",
      "T9800",
      ["Tunis Lac", "La Marsa", "Sousse", "Sfax", "Nabeul"],
    ],
    ["Atlas Sports", "AS220", ["Tunis Centre", "Bizerte", "Monastir"]],
    ["Nova Distribution", "NV300", ["Gabès", "Djerba"]],
  ];
  for (const [ci, [name, model, storeNames]] of definitions.entries()) {
    command({
      type: "company.create",
      data: {
        name,
        currency: "TND",
        country: "Tunisie",
        brands: [`${name} Démo`],
        leadDays: 30,
        coverDays: 45,
        minimumStock: 10,
        modules,
      },
    });
    const c = last(s.companies),
      companyId = c.id;
    const run = (a, date) => command({ ...a, companyId }, date);
    run({
      type: "location.create",
      name: `${name} · Entrepôt central`,
      kind: "WAREHOUSE",
    });
    const wh = last(s.locations);
    run({
      type: "account.create",
      name: "Banque Démo — compte exploitation",
      kind: "BANK",
      opening: 200000000,
      asOf: "2025-01-01",
    });
    const bank = last(s.accounts);
    run({
      type: "partner.create",
      name: `Istanbul Samples ${ci + 1} — fournisseur fictif`,
      kind: "SUPPLIER",
      email: `supplier${ci + 1}@example.com`,
      address: "Istanbul — adresse de démonstration",
    });
    const supplier = last(s.partners);
    run({
      type: "partner.create",
      name: "Transit Méditerranée — fictif",
      kind: "SUPPLIER",
      email: `freight${ci + 1}@example.com`,
    });
    const freight = last(s.partners);
    run({
      type: "partner.create",
      name: "Clients comptoir — synthèse démo",
      kind: "CUSTOMER",
      email: "",
    });
    const customer = last(s.partners);
    const products = [];
    for (const [colorIndex, color] of [
      "Noir",
      "Blanc",
      "Bleu marine",
      "Bordeaux",
      "Beige",
    ].entries())
      for (const size of ["40", "42"]) {
        run({
          type: "product.create",
          sku: `${model}-${colorIndex + 1}-${size}`,
          model,
          name: `Sneaker ${model}`,
          brand: `${name} Démo`,
          size,
          color,
          salePrice: 150000 + ci * 10000,
          barcode: `DEMO${ci + 1}${colorIndex + 1}${size}`,
        });
        products.push(last(s.products));
      }
    run({
      type: "sample.create",
      supplierId: supplier.id,
      model,
      reference: `OFFRE-${model}-2026`,
      photoUrl: "/demo/supplier-samples.png",
      unitCost: 60000 + ci * 4000,
      minimumQuantity: 100,
      leadDays: 30,
    });
    run({ type: "sample.approve", sampleId: last(s.samples).id });
    const stores = [];
    for (const storeName of storeNames) {
      run({
        type: "location.create",
        name: `${name.split(" ")[0]} · ${storeName}`,
        kind: "STORE",
      });
      const location = last(s.locations);
      run({
        type: "account.create",
        name: `Caisse ${storeName}`,
        kind: "CASH",
        opening: 0,
        asOf: "2025-01-01",
      });
      const cash = last(s.accounts);
      run({
        type: "pos.configure",
        locationId: location.id,
        cashAccountId: cash.id,
        cardAccountId: bank.id,
        customerId: customer.id,
        maxDiscountBps: 1000,
      });
      stores.push({ location, cash });
      for (const [i, job] of [
        "Responsable magasin",
        "Conseiller vente",
      ].entries())
        run({
          type: "hr.employee.create",
          fullName: `Démo ${storeName} ${i + 1}`,
          jobTitle: job,
          department: "Réseau magasins",
          locationId: location.id,
          grossSalary: 1400000 - i * 200000,
          employerChargesBps: 1800,
          hiredAt: "2025-01-01",
        });
    }
    for (const [i, job] of [
      "Magasinier",
      "Logisticien",
      "Directeur société",
    ].entries())
      run({
        type: "hr.employee.create",
        fullName: `Démo ${name.split(" ")[0]} ${job}`,
        jobTitle: job,
        department: i === 2 ? "Direction" : "Logistique",
        ...(i < 2 ? { locationId: wh.id } : {}),
        grossSalary: i === 2 ? 2800000 : 1600000,
        employerChargesBps: 1800,
        hiredAt: "2025-01-01",
      });
    const employees = s.employees.filter((e) => e.companyId === c.id);
    run({
      type: "financing.create",
      reference: `FIN-${model}`,
      bank: "Banque Démo",
      accountId: bank.id,
      principal: 50000000,
      interest: 5000000,
      dueDate: "2026-12-31",
    });
    const financing = last(s.financings);
    run({ type: "financing.draw", financingId: financing.id });
    for (let year = 2025; year <= 2026; year++)
      for (let month = 1; month <= (year === 2025 ? 12 : 10); month++) {
        const period = `${year}-${String(month).padStart(2, "0")}`,
          date = `${period}-${year === 2026 && month === 10 ? "15" : "25"}`;
        const quantities = stores.map((_, i) => 12 + i + (month >= 11 ? 4 : 0));
        const total = quantities.reduce((a, b) => a + b, 0);
        if (!(year === 2026 && month === 10)) {
          const qty = total + (year === 2025 ? 10 : 0),
            lines = products.map((p) => ({
              productId: p.id,
              quantity: qty,
              unitPrice: 60000 + ci * 4000,
            }));
          run(
            {
              type: "order.create",
              reference: `DEMO-IMPORT-${model}-${period}`,
              supplierId: supplier.id,
              locationId: wh.id,
              lines,
              origin: "Istanbul (fictif)",
              eta: `${period}-12`,
              dueDate: `${period}-28`,
              landedCharges: qty * products.length * 2500,
            },
            `${period}-02`,
          );
          const order = last(s.orders);
          for (const [i, status] of [
            "APPROVED",
            "ORDERED",
            "SHIPPED",
            "CUSTOMS",
            "RECEIVED",
          ].entries())
            run(
              { type: "order.transition", orderId: order.id, status },
              `${period}-${String(3 + i * 2).padStart(2, "0")}`,
            );
          const invoice = last(s.invoices);
          run(
            {
              type: "payment.create",
              invoiceId: invoice.id,
              accountId: bank.id,
              amount:
                year === 2026 && month === 9
                  ? Math.round(invoice.amount * 0.8)
                  : invoice.amount,
            },
            `${period}-14`,
          );
          run(
            {
              type: "invoice.create",
              reference: `TRANSIT-${model}-${period}`,
              partnerId: freight.id,
              kind: "PAYABLE",
              amount: order.landedCharges,
              dueDate: `${period}-28`,
            },
            `${period}-14`,
          );
          const fi = last(s.invoices);
          run(
            {
              type: "payment.create",
              invoiceId: fi.id,
              accountId: bank.id,
              amount: fi.amount,
            },
            `${period}-14`,
          );
        }
        for (const [si, { location, cash }] of stores.entries()) {
          for (const p of products)
            run(
              {
                type: "stock.transfer",
                productId: p.id,
                fromId: wh.id,
                toId: location.id,
                quantity: quantities[si],
              },
              date,
            );
          run(
            {
              type: "sale.create",
              reference: `DEMO-SYNTHESE-MENSUELLE-${model}-${si + 1}-${period}`,
              customerId: customer.id,
              locationId: location.id,
              lines: products.map((p) => ({
                productId: p.id,
                quantity: quantities[si],
                unitPrice: p.salePrice,
              })),
              dueDate: date,
            },
            date,
          );
          const invoice = last(s.invoices);
          const cashAmount = Math.round(invoice.amount * 0.4);
          run(
            {
              type: "payment.create",
              invoiceId: invoice.id,
              accountId: cash.id,
              amount: cashAmount,
            },
            date,
          );
          run(
            {
              type: "payment.create",
              invoiceId: invoice.id,
              accountId: bank.id,
              amount:
                Math.round(
                  invoice.amount * (year === 2026 && month === 9 ? 0.9 : 1),
                ) - cashAmount,
            },
            date,
          );
          run(
            {
              type: "cash.transfer",
              fromId: cash.id,
              toId: bank.id,
              amount: cashAmount,
            },
            date,
          );
        }
        run(
          {
            type: "expense.create",
            accountId: bank.id,
            amount: (stores.length * 1800 + 2300) * 1000,
            description: `DEMO loyers, énergie et marketing ${period}`,
          },
          date,
        );
        if (!(year === 2026 && month === 10))
          for (const e of employees) {
            run({ type: "hr.payroll.record", employeeId: e.id, period }, date);
            run(
              {
                type: "hr.payroll.pay",
                payrollId: last(s.payroll).id,
                accountId: bank.id,
              },
              date,
            );
          }
        if (year === 2025)
          run(
            {
              type: "financing.repay",
              financingId: financing.id,
              accountId: bank.id,
              principal: 2500000,
              interest: 400000,
            },
            date,
          );
      }
    // Put a few genuine-format POS tickets in the recent sales history; leave every drawer closed.
    for (const [i, { location, cash }] of stores.entries()) {
      const p = products[i % products.length];
      run(
        {
          type: "stock.transfer",
          productId: p.id,
          fromId: wh.id,
          toId: location.id,
          quantity: 5,
        },
        "2026-10-18",
      );
      run(
        { type: "pos.open", locationId: location.id, opening: 0 },
        "2026-10-18",
      );
      const session = last(s.posSessions);
      run(
        {
          type: "pos.checkout",
          sessionId: session.id,
          items: [{ productId: p.id, quantity: 1 }],
          discountBps: 0,
          cash: p.salePrice,
          card: 0,
          cashGiven: p.salePrice,
        },
        "2026-10-18",
      );
      run(
        {
          type: "pos.checkout",
          sessionId: session.id,
          items: [{ productId: p.id, quantity: 1 }],
          discountBps: 0,
          cash: 0,
          card: p.salePrice,
          cashGiven: 0,
        },
        "2026-10-18",
      );
      run(
        {
          type: "pos.close",
          sessionId: session.id,
          counted: p.salePrice,
          reason: "Clôture de démonstration",
        },
        "2026-10-18",
      );
      run(
        {
          type: "cash.transfer",
          fromId: cash.id,
          toId: bank.id,
          amount: p.salePrice,
        },
        "2026-10-18",
      );
    }
    // An import that has not yet arrived; no received stock is invented.
    run(
      {
        type: "order.create",
        reference: `DEMO-EN-TRANSIT-${model}`,
        supplierId: supplier.id,
        locationId: wh.id,
        lines: products.map((p) => ({
          productId: p.id,
          quantity: 10,
          unitPrice: 60000 + ci * 4000,
        })),
        origin: "Istanbul (fictif)",
        eta: "2026-11-15",
        dueDate: "2026-11-30",
        landedCharges: 250000,
      },
      "2026-10-16",
    );
    const open = last(s.orders);
    for (const status of ["APPROVED", "ORDERED", "SHIPPED"])
      run({ type: "order.transition", orderId: open.id, status }, "2026-10-17");
  }
  s.demoNotes = s.companies.map((c) => ({
    companyId: c.id,
    year: 2025,
    title: "DÉMO — Groupe Horizon — données entièrement fictives",
  }));
  for (const p of s.products)
    for (const l of s.locations.filter((l) => l.companyId === p.companyId))
      if (stock(s, p.id, l.id) < 0) throw Error("Negative stock");
  for (const a of s.accounts)
    if (balance(s, a.id) < 0) throw Error("Negative cash");
  if (s.posSessions.some((x) => !x.closedAt)) throw Error("Open drawer");
  const report = s.companies.map((c) => ({
    company: c.name,
    currency: c.currency,
    ...annualPnl(s, c.id, 2025).total,
    bank: companyMetrics(s, c, new Date("2026-10-18")).bank,
  }));
  const json = JSON.stringify(s);
  if (Buffer.byteLength(json) > 8 * 1024 * 1024)
    throw Error("Ledger exceeds cap");
  return { state: s, commands, report, bytes: Buffer.byteLength(json) };
}
module.exports = { buildDemo };
if (require.main === module) {
  const result = buildDemo(process.argv[3]);
  if (!process.argv[2]) throw Error("Pass an output JSON path");
  writeFileSync(process.argv[2], JSON.stringify(result));
  console.log(
    JSON.stringify(
      {
        commands: result.commands,
        bytes: result.bytes,
        companies: result.state.companies.length,
        stores: result.state.locations.filter((l) => l.kind === "STORE").length,
        employees: result.state.employees.length,
        report: result.report,
      },
      null,
      2,
    ),
  );
}
