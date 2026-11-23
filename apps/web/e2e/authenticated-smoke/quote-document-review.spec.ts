import { expect, test } from "@playwright/test";
import type { ProcurementQuoteDocumentPreview } from "@bloqer/ai";

const projectId = "a0000010-0000-4000-8000-000000000010";
test("quote file review maps request items and registers an offer without awarding", async ({ page }, testInfo) => {
  const description = `PRUEBA CI cotización ${testInfo.project.name}`;
  let reads = 0;
  await page.route("**/api/ai/procurement-quote-preview", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { enabled: true } });
    reads++;
    expect(route.request().postData()).toContain(projectId);
    const preview: ProcurementQuoteDocumentPreview = {
      documentKind: "QUOTE", supplierName: "Proveedor leído de prueba", currency: "ARS", validUntil: "2026-12-30", leadTimeDays: 7,
      pricesIncludeTax: false, iibbPerceptionRate: "0", total: "242.00", hasUnsupportedCharges: false,
      lines: [{ description, quantity: "2", unit: reads === 1 ? "caja" : "un", offerKind: "QUOTED", unitPrice: "100", taxRate: "21", discountPct: null }], blockingReasons: [], warnings: ["Completá el descuento desconocido."] };
    return route.fulfill({ json: { preview } });
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
  await page.goto(`/proyectos/${projectId}/solicitudes-compra/nueva`);
  await expect(page.locator("#pr-wbs")).toHaveCount(1);
  await page.locator("#pr-wbs").click(); await page.getByRole("option").first().click();
  await page.getByLabel("Descripción / material", { exact: true }).fill(description);
  await page.getByLabel("Cantidad", { exact: true }).fill("2");
  await page.getByLabel("Unidad", { exact: true }).click(); await page.getByRole("option", { name: "Unidad", exact: true }).click();
  await page.getByLabel(/^Fecha requerida/).fill("2026-12-20");
  await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}/solicitudes-compra/[0-9a-f-]{36}$`), { timeout: 30_000 });
  await page.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  const save = page.getByRole("button", { name: "Registrar cotización", exact: true });
  await expect(save).toBeVisible();
  await page.getByRole("button", { name: "Leer cotización desde archivo", exact: true }).click();
  await page.getByLabel("Archivo de cotización", { exact: true }).setInputFiles({ name: "cotizacion.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nSYNTHETIC QUOTE\n%%EOF") });
  await page.getByRole("button", { name: "Leer oferta", exact: true }).click();
  await page.getByLabel("Vincular renglón 1", { exact: true }).selectOption({ index: 1 });
  const apply = page.getByRole("button", { name: "Aplicar propuesta al formulario", exact: true });
  await expect(apply).toBeDisabled();
  await expect(page.getByText(/Cantidad o unidad distinta\/desconocida/)).toBeVisible();
  await page.getByRole("button", { name: "Leer oferta", exact: true }).click();
  await expect(page.getByLabel("Vincular renglón 1", { exact: true })).toHaveValue("");
  await page.getByLabel("Vincular renglón 1", { exact: true }).selectOption({ index: 1 });
  await page.getByRole("checkbox", { name: /Revisé el original, las correspondencias/ }).check();
  await apply.click();
  await expect(save).toBeDisabled();
  await page.locator("#quote-supplier").click(); await page.getByRole("option").first().click();
  const discount = page.getByLabel("Desc. %", { exact: true });
  await expect(discount).toHaveValue(""); await discount.fill("0"); await discount.blur();
  const review = page.getByRole("checkbox", { name: /Revisé proveedor, moneda, cantidades/ });
  await review.check(); await expect(save).toBeEnabled();
  const price = page.getByLabel("Precio unitario neto (sin IVA)", { exact: true });
  await price.fill("101"); await price.blur(); await expect(review).not.toBeChecked();
  await expect(save).toBeDisabled(); await price.fill("100"); await price.blur(); await expect(review).not.toBeChecked();
  await review.check(); await save.click();
  await expect(page.getByText("Cotización registrada.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Recibida", { exact: true }).and(page.locator(":visible"))).toBeVisible();
  await expect(page.getByText(description, { exact: true }).and(page.locator(":visible")).first()).toBeVisible();
  await expect(save).toBeVisible(); // Still SUBMITTED; registration did not adjudicate or create an OC.
  expect(reads).toBe(2);
  const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
});
