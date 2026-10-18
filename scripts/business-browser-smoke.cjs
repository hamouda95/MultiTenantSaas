/* Runs against the real local-mode Compose stack. No mocked business responses. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
let failurePage;
(async () => {
  const cameraFile = "/tmp/saas-camera.y4m";
  require("./camera-fixture.cjs")(cameraFile, "POS-42");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${cameraFile}`,
    ],
  });
  const context = await browser.newContext({
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
    permissions: ["camera"],
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
    model: "T9800",
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
  await page
    .getByRole("combobox", { name: "Société", exact: true })
    .selectOption(companyId);
  await page
    .getByRole("button", { name: "Achats & imports", exact: true })
    .click();
  const funding = page.locator("form").filter({
    has: page.getByRole("button", {
      name: "Enregistrer le financement",
      exact: true,
    }),
  });
  await funding
    .getByLabel("Référence financement", { exact: true })
    .fill("LOAN-BROWSER");
  await funding.getByLabel("Banque prêteuse", { exact: true }).fill("Bank A");
  await funding
    .getByLabel("Capital financé (TND)", { exact: true })
    .fill("100");
  await funding
    .getByLabel("Intérêts et frais convenus (TND)", { exact: true })
    .fill("10");
  await funding
    .getByLabel("Échéance finale du crédit", { exact: true })
    .fill(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  await funding
    .getByRole("button", { name: "Enregistrer le financement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer le déblocage", exact: true })
    .click();
  await page.getByText("En remboursement", { exact: true }).waitFor();
  response = await context.request.get(`/api/v1/tenants/${tenantId}/business`);
  snap = await response.json();
  const loanId = snap.state.financings[0].id;
  const repayment = page.locator("form").filter({
    has: page.getByRole("button", {
      name: "Enregistrer le remboursement",
      exact: true,
    }),
  });
  await repayment
    .getByLabel("Crédit à rembourser", { exact: true })
    .selectOption(loanId);
  await repayment
    .getByLabel("Capital remboursé (TND)", { exact: true })
    .fill("40");
  await repayment.getByLabel("Intérêts payés (TND)", { exact: true }).fill("2");
  await repayment
    .getByRole("button", { name: "Enregistrer le remboursement", exact: true })
    .click();
  await page.getByText(/Capital 40,000/).waitFor();
  const article = page.locator("form").filter({
    has: page.getByRole("button", { name: "Créer l’article", exact: true }),
  });
  await article
    .getByLabel("Code modèle (ex. T9800)", { exact: true })
    .fill("T9800");
  await article
    .getByLabel("SKU de la variante", { exact: true })
    .fill("T9800-GREEN");
  await article
    .getByLabel("Désignation de l’article", { exact: true })
    .fill("Leather shoes");
  await article
    .getByLabel("Couleur de l’article", { exact: true })
    .fill("Green");
  await article
    .getByRole("button", { name: "Créer l’article", exact: true })
    .click();
  await article.getByLabel("SKU de la variante", { exact: true }).waitFor();
  // Wait for successful creation/reset before the following authoritative snapshot.
  await page.waitForFunction(
    () => document.querySelector('input[name="sku"]').value === "",
  );
  response = await context.request.get(`/api/v1/tenants/${tenantId}/business`);
  snap = await response.json();
  await cmd({
    type: "stock.adjust",
    productId: snap.state.products.at(-1).id,
    locationId: storeId,
    quantity: 2,
    unitCost: 1000,
    reason: "Opening browser variant",
  });
  for (const color of ["White", "Red", "Blue"]) {
    await cmd({
      type: "product.create",
      model: "T9800",
      name: "Leather shoes",
      sku: `T9800-${color}`,
      brand: "Polaris",
      size: "42",
      color,
    });
    await cmd({
      type: "stock.adjust",
      productId: snap.state.products.at(-1).id,
      locationId: storeId,
      quantity: 2,
      unitCost: 1000,
      reason: "Opening browser variant",
    });
  }
  await page
    .getByRole("button", { name: "Stocks & transferts", exact: true })
    .click();
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await page
    .getByRole("img", { name: /Répartition du stock T9800.*Total 103/ })
    .waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/inventory-colours.png",
    fullPage: true,
  });
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
  await page.getByText("Nouveau client", { exact: true }).click();
  await page
    .getByLabel("Nom du nouveau client", { exact: true })
    .fill("Amira Browser");
  await page
    .getByLabel("Téléphone du nouveau client", { exact: true })
    .fill("+21612345678");
  await page
    .getByRole("button", { name: "Créer le client en Caisse", exact: true })
    .click();
  await page
    .getByRole("option", { name: /Amira Browser/ })
    .waitFor({ state: "attached" });
  await page
    .getByLabel("Client de la vente", { exact: true })
    .selectOption({ label: "Amira Browser · +21612345678" });
  await page
    .getByRole("button", { name: "Scanner avec la caméra", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retirer une unité", exact: true })
    .waitFor({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Retirer une unité", exact: true })
    .click();
  const scan = page.getByLabel(
    "Scanner un code-barres ou rechercher un article",
    { exact: true },
  );
  await scan.fill("POS-42");
  await scan.press("Enter");
  await page
    .getByRole("button", { name: "Retirer une unité", exact: true })
    .waitFor();
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
  await page
    .getByLabel("Rechercher dans les ventes", { exact: true })
    .fill("Amira Browser");
  await page
    .getByRole("button", { name: "Voir le ticket", exact: true })
    .waitFor();
  response = await context.request.get(`/api/v1/tenants/${tenantId}/business`);
  snap = await response.json();
  assert.equal(snap.state.financingPayments[0].principal, 40000);
  assert.equal(
    snap.state.sales.at(-1).customerId,
    snap.state.partners.find((p) => p.name === "Amira Browser").id,
  );
  assert.equal(
    snap.state.movements
      .filter((m) => m.productId === productId)
      .reduce((n, m) => n + m.quantity, 0),
    94,
  );
  // New modules: real employee accrual/payment and supplier sample → purchase draft.
  await page.goto(`/t/${tenantId}/business`);
  await page.getByLabel("Société", { exact: true }).selectOption(companyId);
  await page
    .getByRole("button", { name: "Ressources humaines", exact: true })
    .click();
  await page.getByLabel("Nom complet", { exact: true }).fill("Salarié Browser");
  await page.getByLabel("Poste", { exact: true }).fill("Vendeur");
  await page.getByLabel("Département", { exact: true }).fill("Ventes");
  await page.getByLabel("Salaire brut (TND)", { exact: true }).fill("1000");
  await page.getByLabel("Date d’entrée", { exact: true }).fill("2025-01-01");
  await page
    .getByRole("button", { name: "Ajouter un salarié", exact: true })
    .click();
  await page.getByText("Salarié Browser", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Comptabiliser", exact: true })
    .click();
  await page.getByRole("button", { name: "Régler", exact: true }).waitFor();
  await page.getByRole("button", { name: "Régler", exact: true }).click();
  await page.getByText(/1[\s\u00a0\u202f]?180.*Réglé/).waitFor();
  await page.screenshot({
    path: "test-results/hr-desktop.png",
    fullPage: true,
  });
  response = await context.request.get(`/api/v1/tenants/${tenantId}/business`);
  snap = await response.json();
  assert.equal(snap.state.payroll[0].total, 1180000);
  assert(snap.state.payroll[0].paidAt);
  await cmd({
    type: "product.create",
    sku: "SAMPLE-NEW",
    name: "Nouveau modèle",
    model: "DEMO2027",
    brand: "Polaris",
    size: "42",
    color: "Noir",
  });
  await cmd({
    type: "sample.create",
    supplierId: snap.state.partners.find((p) => p.kind === "SUPPLIER").id,
    model: "DEMO2027",
    reference: "SAMPLE-BROWSER",
    photoUrl: "/demo/supplier-samples.png",
    unitCost: 50000,
    minimumQuantity: 100,
    leadDays: 30,
  });
  await page.reload();
  await page.getByLabel("Société", { exact: true }).selectOption(companyId);
  await page
    .getByRole("button", { name: "Échantillons & commandes", exact: true })
    .click();
  const samplePhoto = page.getByRole("img", {
    name: "Échantillon fournisseur DEMO2027",
    exact: true,
  });
  await samplePhoto.waitFor();
  assert(
    await samplePhoto.evaluate((img) => img.complete && img.naturalWidth > 0),
  );
  await page
    .getByRole("button", { name: "Approuver l’échantillon", exact: true })
    .click();
  await page.getByText("Échantillon approuvé", { exact: false }).waitFor();
  await page
    .getByRole("button", {
      name: "Préparer un brouillon de commande",
      exact: true,
    })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Opération enregistrée." })
    .waitFor();
  response = await context.request.get(`/api/v1/tenants/${tenantId}/business`);
  snap = await response.json();
  assert(
    snap.state.orders.some(
      (o) =>
        o.reference.startsWith("ECH-SAMPLE-BROWSER-") &&
        o.status === "DRAFT" &&
        o.lines[0].quantity === 100,
    ),
  );
  await page.screenshot({
    path: "test-results/supplier-samples-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "P&L annuel", exact: true }).click();
  await page
    .getByRole("heading", { name: "P&L annuel du holding", exact: true })
    .waitFor();
  const pnlDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter CSV", exact: true }).click();
  assert((await pnlDownload).suggestedFilename().startsWith("pnl-"));
  await page.screenshot({
    path: "test-results/pnl-desktop.png",
    fullPage: true,
  });
  await page.goto(`/t/${tenantId}/hr`);
  await page
    .getByRole("heading", { name: "Contrats & congés", exact: true })
    .waitFor();
  await page.getByText(/Salarié Browser — depuis/).waitFor();
  const leaveForm = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Demander un congé", exact: true }),
    });
  await leaveForm.getByLabel("Du", { exact: true }).fill("2026-11-01");
  await leaveForm.getByLabel("Au", { exact: true }).fill("2026-11-03");
  await leaveForm
    .getByRole("button", { name: "Demander un congé", exact: true })
    .click();
  await page.getByRole("button", { name: "Approuver", exact: true }).click();
  await page.getByText(/2026-11-01.*APPROVED/).waitFor();
  await page.screenshot({
    path: "test-results/hr-contracts-leave.png",
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
