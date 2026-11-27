import { expect, test, type Page, type TestInfo } from "@playwright/test";

// The maintained documentation dataset is installed only in disposable CI Postgres.
const project = "/proyectos/a0000010-0000-4000-8000-000000000010";
const order = `${project}/ordenes-compra/a0000020-0000-4000-8000-000000000020`;
const request = `${project}/solicitudes-compra/a00000e3-0000-4000-8000-0000000000e3`;

async function captureLayout(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(layout.document, `${name}: page must not scroll horizontally`).toBeLessThanOrEqual(layout.viewport + 1);
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
});

test("procurement pages contain their tables, totals and touch controls at every viewport", async ({ page }, testInfo) => {
  const routes = [
    ["hub", `${project}/compras`],
    ["requests", `${project}/solicitudes-compra`],
    ["orders", `${project}/ordenes-compra`],
    ["receipts", `${project}/recepciones`],
    ["request-detail-and-quote", request],
    ["order-detail", order],
    ["new-receipt", `${order}/recepciones/nueva`],
  ] as const;
  for (const [name, path] of routes) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/no encontrad|error|iniciar sesión/i);
    await captureLayout(page, testInfo, name);
    if ((name === "requests" || name === "orders") && testInfo.project.name === "phone") {
      const buttons = page.getByRole("group", { name: /^Filtrar/ }).getByRole("button");
      expect(await buttons.count()).toBeGreaterThan(0);
      for (const button of await buttons.all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    if (name === "order-detail" && testInfo.project.name !== "phone") {
      const first = page.getByRole("table", { name: "Líneas de la orden de compra" }).locator("tbody tr").first().locator("td").first();
      await expect(first).toHaveCSS("position", "sticky");
    }
  }
});

test("supplier delivery evidence opens its source and preserves scope in exports", async ({ page }, testInfo) => {
  await page.goto(`${project}/reportes/proveedores?currency=ARS`);
  const panel = page.getByRole("region", { name: "Entregas y cobertura de datos" });
  await expect(panel).toBeVisible();
  const supplier = panel.locator("details").filter({ has: page.locator(`a[href="${order}"]`) });
  await expect(supplier).toHaveCount(1);
  await supplier.locator("summary").click();
  await expect(supplier.getByRole("table")).toBeVisible();
  await expect(supplier.locator(`a[href="${order}"]`)).toBeVisible();
  await expect(supplier.getByText(/Fecha prevista:/)).toBeVisible();
  await captureLayout(page, testInfo, "supplier-delivery-evidence");
  const endpoint = `/api/reports${project}/proveedores.csv?currency=ARS`;
  const csv = await page.request.get(endpoint);
  expect(csv.ok()).toBe(true);
  expect(await csv.text()).toContain("ENTREGA_OC");
  const empty = await page.request.get(`${endpoint}&dateFrom=2050-01-01`);
  expect(empty.ok()).toBe(true);
  expect(await empty.text()).not.toContain("ENTREGA_OC");
  await supplier.locator(`a[href="${order}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${order}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("purchase follow-up exposes quantities and opens the original order at every viewport", async ({ page }, testInfo) => {
  await page.goto(`${project}/compras`);
  const panel = page.getByRole("region", { name: "Recepción y facturación por OC" });
  await expect(panel).toBeVisible();
  const row = panel.getByRole("article").filter({ has: page.locator(`a[href="${order}"]`) });
  await expect(row).toHaveCount(1);
  await row.locator("summary").click();
  await expect(row.getByRole("table")).toBeVisible();
  await expect(row.getByText(/Reservar en borrador no equivale a emitir/)).toBeVisible();
  await captureLayout(page, testInfo, "purchase-follow-up");
  if (testInfo.project.name === "phone") {
    for (const link of await row.getByRole("link").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await row.locator(`a[href="${order}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${order}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("finance brief separates due windows and opens the source obligation at every viewport", async ({ page }, testInfo) => {
  await page.goto("/finanzas");
  const panel = page.getByRole("region", { name: "Resumen para decidir", exact: true });
  await expect(panel).toBeVisible();
  const receivables = panel.getByRole("region", { name: "Por cobrar", exact: true });
  const overdue = receivables.getByRole("button", { name: /^Vencidos/ });
  const upcoming = receivables.getByRole("button", { name: /^Hoy y próximos 7 días/ });
  await upcoming.click();
  await expect(upcoming).toHaveAttribute("aria-pressed", "true");
  await expect(overdue).toHaveAttribute("aria-pressed", "false");
  await overdue.click();
  await expect(overdue).toHaveAttribute("aria-pressed", "true");
  const source = receivables.getByRole("link").first();
  await expect(source).toBeVisible();
  await expect(source).toContainText("Comprobante n.º");
  const href = await source.getAttribute("href");
  expect(href).toMatch(/^\/(?:proyectos\/[^/]+|finanzas)\/cuentas-por-cobrar\//);
  await expect(panel.getByRole("region", { name: "Por pagar", exact: true })).toBeVisible();
  await captureLayout(page, testInfo, "finance-management-brief");
  for (const button of await panel.getByRole("button").all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await source.click();
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === href);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("purchase forms align controls and preserve long values in light and dark themes", async ({ page }, testInfo) => {
  for (const kind of ["solicitudes-compra", "ordenes-compra"] as const) {
    await page.goto(`${project}/${kind}/nueva`);
    const submit = page.getByRole("button", { name: kind === "solicitudes-compra" ? "Crear solicitud" : "Crear orden de compra", exact: true });
    await expect(submit).toBeVisible();
    if (kind === "solicitudes-compra") {
      // Streaming can briefly retain the server copy alongside the hydrated form.
      await expect(page.locator("#pr-wbs")).toHaveCount(1);
      await page.locator("#pr-wbs").click();
      await page.getByRole("option").first().click();
    }
    const description = page.getByLabel(kind === "solicitudes-compra" ? "Descripción / material" : "Descripción", { exact: true });
    await expect(description).toHaveCount(1);
    await description.fill("Material de prueba con una descripción extensa para verificar el ancho disponible en escritorio, tablet y celular");
    const form = submit.locator("xpath=ancestor::form");
    // Measure user-facing fields, not the clipped file input behind the attachment button.
    const fields = form.getByRole("textbox").or(form.getByRole("combobox")).or(form.locator('input[type="date"]'));
    const controls = await fields.evaluateAll(elements => elements.filter(element => element.getClientRects().length > 0).map(element => {
      const rect = element.getBoundingClientRect();
      return { id: element.id, width: rect.width, height: rect.height };
    }));
    expect(controls.length).toBeGreaterThan(3);
    for (const control of controls) {
      expect(control.height, control.id).toBeGreaterThanOrEqual(testInfo.project.name === "phone" ? 44 : 40);
      expect(control.width, control.id).toBeGreaterThan(60);
    }
    await captureLayout(page, testInfo, `${kind}-form-light`);
    await page.getByRole("button", { name: "Cambiar tema", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await captureLayout(page, testInfo, `${kind}-form-dark`);
  }
});

test("purchase dialog fits a short viewport and restores keyboard focus on close", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "Phone creation uses its full page, covered above.");
  await page.setViewportSize({ width: testInfo.project.name === "tablet" ? 768 : 1280, height: 500 });
  await page.goto(`${project}/solicitudes-compra`);
  const trigger = page.getByRole("button", { name: "Nueva solicitud", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Nueva solicitud de compra", exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(15);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(485);
  expect(bounds!.width).toBeLessThanOrEqual(896);
  await captureLayout(page, testInfo, "request-dialog-short-viewport");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
