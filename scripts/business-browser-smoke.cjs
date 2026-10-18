/* Runs against the real local-mode Compose stack. No mocked business responses. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
let failurePage;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  failurePage = page;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const headers = { Origin: "http://localhost:3000" };
  const api = async (path, data) => {
    const response = await context.request.post(path, { data, headers });
    assert(
      response.ok(),
      `${path}: ${response.status()} ${await response.text()}`,
    );
    return response.json();
  };
  const suffix = randomUUID();
  await api("/api/v1/auth/register", {
    email: `browser-${suffix}@example.test`,
    password: "browser-test-long-password",
    fullName: "Holding owner",
  });
  const holding = await api("/api/v1/tenants", {
    name: "Ben Makhlouf",
    slug: `browser-${suffix}`,
  });
  const tenantId = holding.tenant.id;
  await page.goto(`/t/${tenantId}`);
  await page
    .getByRole("heading", { name: "Gestion du holding", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Sociétés & configuration", exact: true })
    .click();
  await page.getByLabel("Nom de la société", { exact: true }).fill("Polaris");
  await page
    .getByLabel("Marques (séparées par des virgules)", { exact: true })
    .fill("Polaris");
  await page
    .getByRole("button", { name: "Vérifier le parcours", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer la configuration", exact: true })
    .click();
  await page
    .getByRole("cell", { name: "Polaris", exact: true })
    .first()
    .waitFor();
  await page
    .getByLabel("Société", { exact: true })
    .selectOption({ label: "Polaris · TND" });
  let response = await context.request.get(
    `/api/v1/tenants/${tenantId}/business`,
  );
  let snap = await response.json();
  const companyId = snap.state.companies[0].id;
  const cmd = async (action) => {
    snap = await api(`/api/v1/tenants/${tenantId}/business/commands`, {
      commandId: randomUUID(),
      version: snap.version,
      action: { companyId, ...action },
    });
  };
  await cmd({
    type: "location.create",
    name: "Central warehouse",
    kind: "WAREHOUSE",
  });
  await cmd({ type: "location.create", name: "Tunis store", kind: "STORE" });
  await cmd({
    type: "product.create",
    name: "Leather shoes",
    sku: "SHOE-42-BLACK",
    brand: "Polaris",
    size: "42",
    color: "Black",
  });
  await cmd({
    type: "partner.create",
    name: "Istanbul supplier",
    kind: "SUPPLIER",
    email: "",
  });
  await cmd({
    type: "partner.create",
    name: "Counter customer",
    kind: "CUSTOMER",
    email: "",
  });
  await cmd({
    type: "account.create",
    name: "Main bank",
    kind: "BANK",
    opening: 1000000,
    asOf: new Date().toISOString().slice(0, 10),
  });
  const productId = snap.state.products[0].id,
    warehouseId = snap.state.locations[0].id,
    storeId = snap.state.locations[1].id;
  await cmd({
    type: "order.create",
    reference: "PO-BROWSER",
    supplierId: snap.state.partners[0].id,
    locationId: warehouseId,
    origin: "Istanbul",
    eta: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    landedCharges: 10000,
    lines: [{ productId, quantity: 100, unitPrice: 1000 }],
  });
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await page
    .getByRole("button", { name: "Achats & imports", exact: true })
    .click();
  for (const label of [
    "Approuvée",
    "Commandée",
    "Expédiée",
    "Douane",
    "Réceptionner tout le stock",
  ]) {
    const button = page.getByRole("button", { name: label, exact: true });
    await button.waitFor();
    await button.click();
  }
  await page.getByRole("cell", { name: "Réceptionnée", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Stocks & transferts", exact: true })
    .click();
  const transfer = page.locator("form").filter({
    has: page.getByRole("button", {
      name: "Confirmer le transfert",
      exact: true,
    }),
  });
  await transfer
    .getByLabel("Variante", { exact: true })
    .selectOption(productId);
  await transfer
    .getByLabel("Depuis", { exact: true })
    .selectOption(warehouseId);
  await transfer.getByLabel("Vers", { exact: true }).selectOption(storeId);
  await transfer.getByLabel("Quantité", { exact: true }).fill("20");
  await transfer
    .getByRole("button", { name: "Confirmer le transfert", exact: true })
    .click();
  await page
    .getByRole("cell", { name: "TRANSFER", exact: true })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Ventes", exact: true }).click();
  await page
    .getByLabel("Référence ticket / facture", { exact: true })
    .fill("SALE-BROWSER");
  await page
    .getByLabel("Client (un client comptoir peut être créé)", { exact: true })
    .selectOption(snap.state.partners[1].id);
  await page
    .getByLabel("Magasin / emplacement", { exact: true })
    .selectOption(storeId);
  await page.getByLabel("Produit 1", { exact: true }).selectOption(productId);
  await page.getByLabel("Quantité entière", { exact: true }).fill("5");
  await page.getByLabel("Prix unitaire", { exact: true }).fill("2");
  await page
    .getByRole("button", {
      name: "Confirmer la vente et sortir le stock",
      exact: true,
    })
    .click();
  await page.getByRole("cell", { name: "SALE-BROWSER", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Banques & trésorerie", exact: true })
    .click();
  await page
    .getByRole("cell", { name: "SALE:SALE-BROWSER", exact: true })
    .waitFor();
  const payment = page.locator("form").filter({
    has: page.getByRole("button", {
      name: "Enregistrer le règlement",
      exact: true,
    }),
  });
  response = await context.request.get(`/api/v1/tenants/${tenantId}/business`);
  snap = await response.json();
  const invoice = snap.state.invoices.find((i) => i.kind === "RECEIVABLE");
  await payment
    .getByLabel("Facture à régler", { exact: true })
    .selectOption(invoice.id);
  await payment
    .getByLabel("Compte / caisse", { exact: true })
    .selectOption(snap.state.accounts[0].id);
  await payment.getByLabel("Montant (TND)", { exact: true }).fill("10");
  await payment
    .getByRole("button", { name: "Enregistrer le règlement", exact: true })
    .click();
  await page.getByRole("cell", { name: "Encaissement", exact: true }).waitFor();
  await page.getByRole("button", { name: "Vue holding", exact: true }).click();
  fs.mkdirSync("test-results", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/holding-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Mobile page overflows viewport",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/holding-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "Gestion du holding", exact: true })
    .waitFor();
  response = await context.request.get(`/api/v1/tenants/${tenantId}/business`);
  snap = await response.json();
  assert.equal(snap.state.sales.length, 1);
  assert.equal(snap.state.payments.length, 1);
  assert.equal(
    snap.state.movements
      .filter((m) => m.productId === productId)
      .reduce((n, m) => n + m.quantity, 0),
    95,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await cmd({
    type: "account.create",
    name: "POS Till",
    kind: "CASH",
    opening: 0,
    asOf: new Date().toISOString().slice(0, 10),
  });
  const cashAccountId = snap.state.accounts.at(-1).id;
  await cmd({
    type: "product.pricing",
    productId,
    salePrice: 2000,
    barcode: "POS-42",
  });
  await cmd({
    type: "pos.configure",
    locationId: storeId,
    cashAccountId,
    cardAccountId: snap.state.accounts[0].id,
    customerId: snap.state.partners[1].id,
    maxDiscountBps: 0,
  });
  await page.goto(`/t/${tenantId}/pos`);
  await page.getByRole("heading", { name: "Caisse", exact: true }).waitFor();
  await page.getByLabel("Fond de caisse", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Ouvrir la session", exact: true })
    .click();
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Valider la vente et le règlement",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Voir le ticket", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Voir le ticket", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Imprimer le ticket", exact: true })
    .waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/pos-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Espèces comptées", { exact: true }).fill("2");
  await page
    .getByLabel("Commentaire de clôture", { exact: true })
    .fill("Balanced browser closing");
  await page
    .getByRole("button", { name: "Clôturer la Caisse", exact: true })
    .click();
  await page.getByText("Rapprochée", { exact: false }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/pos-mobile.png",
    fullPage: true,
  });
  await page.goto("/administration");
  await page
    .getByRole("heading", { name: "Administration des holdings", exact: true })
    .waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Exporter toutes les données métier",
      exact: true,
    })
    .click();
  const download = await downloadPromise;
  assert(download.suggestedFilename().endsWith(".json"));
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "Real browser holding → purchase → stock → sale → payment smoke passed.",
  );
})().catch(async (error) => {
  console.error(error);
  if (failurePage) {
    fs.mkdirSync("test-results", { recursive: true });
    await failurePage
      .screenshot({ path: "test-results/business-failure.png", fullPage: true })
      .catch(() => {});
    fs.writeFileSync(
      "test-results/business-failure.html",
      await failurePage.content().catch(() => ""),
    );
  }
  process.exit(1);
});
