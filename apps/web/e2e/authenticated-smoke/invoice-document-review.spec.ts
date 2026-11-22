import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { SupplierInvoiceDocumentPreview } from "@bloqer/ai";

// UI integration only: real session/server action/disposable SQL; AI and object transport
// are intercepted. These cases do not claim provider quality or a remote production pilot.
const original = Buffer.from("%PDF-1.7\nsynthetic invoice for review\n%%EOF");

function preview(description: string): SupplierInvoiceDocumentPreview {
  return {
    documentKind: "INVOICE", currency: "ARS", supplierName: "Proveedor de prueba",
    supplierTaxId: null, fiscalReference: "0001-00000012", invoiceLetter: "C",
    issueDate: "2026-11-20", dueDate: null, pricesIncludeTax: false,
    iibbPerceptionRate: "0", iibbPerceptionAmount: "0", subtotal: "200", taxTotal: "0", total: "200",
    lines: [{ description, quantity: "2", unitPrice: "100", taxRate: "0", discountPercent: "0" }],
    warnings: [], reviewReasons: ["Completá el vencimiento y elegí el proveedor."],
    blockingReasons: [], canApply: true,
  };
}

async function openAssistedEntry(page: Page, result: SupplierInvoiceDocumentPreview) {
  await page.route("**/api/ai/supplier-invoice-preview", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { enabled: true } });
    } else {
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataBuffer()?.includes(original)).toBeTruthy();
      await route.fulfill({ json: { preview: result } });
    }
  });
  await page.goto("/finanzas/facturas-proveedor");
  await page.getByRole("button", { name: "Nueva factura", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva factura de gasto", exact: true });
  await dialog.getByRole("button", { name: /^Desde un comprobante/ }).click();
  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: "factura-prueba.pdf", mimeType: "application/pdf", buffer: original,
  });
  await dialog.getByRole("button", { name: "Leer comprobante", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "2. Revisá la lectura", exact: true })).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
});

test("daily digest offers compatible hours and persists an explicit choice", async ({ page }) => {
  await page.goto("/configuracion/politicas#notificaciones");
  const hour = page.getByLabel("Hora mínima del resumen", { exact: true });
  await expect(hour).toBeVisible();
  await hour.click();
  const enabled = page.locator('[role="option"]:not([aria-disabled="true"])');
  // Seeded tenant uses Argentina: 04–07 can join the 07:05 daily review.
  await expect(page.getByRole("option", { name: "09:00", exact: true })).toHaveCount(0);
  await expect(enabled).toHaveCount(4);
  await page.getByRole("option", { name: "06:00", exact: true }).click();
  await page.getByRole("button", { name: "Guardar política de email", exact: true }).click();
  await expect(page.getByText("Política de email guardada.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Hora mínima del resumen", { exact: true })).toHaveText("06:00");
});

test("assisted review requires missing data and reconfirmation, then retries attachment on the same saved draft", async ({ page }, testInfo) => {
  const description = `Lectura CI ${testInfo.project.name} ${randomUUID()}`;
  const documentId = randomUUID();
  const uploads: Array<{ linkedEntityId: string; linkedEntityType: string; projectId: string | null; idempotencyKey: string }> = [];
  const uploadedBytes: Buffer[] = [];
  let confirmations = 0;
  await page.route("**/api/documents/initiate-upload", async (route) => {
    uploads.push(route.request().postDataJSON());
    await route.fulfill({ json: { documentId, uploadUrl: "https://storage.example.test/invoice", storageConfigured: true, status: "UPLOADING" } });
  });
  await page.route("https://storage.example.test/**", async (route) => {
    uploadedBytes.push(route.request().postDataBuffer()!);
    if (uploadedBytes.length === 1) await route.abort("failed");
    else await route.fulfill({ status: 200 });
  });
  await page.route(`**/api/documents/${documentId}/confirm`, async (route) => {
    confirmations += 1;
    await route.fulfill({ json: { ok: true } });
  });
  const dialog = await openAssistedEntry(page, preview(description));
  const apply = dialog.getByRole("button", { name: "Usar datos y completar", exact: true });
  await expect(apply).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /^Revisé la lectura y sus observaciones/ }).check();
  await apply.click();
  await expect(dialog.getByLabel("Fecha de vencimiento", { exact: true })).toHaveValue("");
  const review = dialog.getByRole("checkbox", { name: /^Verifiqué proveedor, fechas/ });
  const save = dialog.getByRole("button", { name: "Guardar borrador", exact: true });
  await expect(review).toBeDisabled();
  await expect(save).toBeDisabled();
  await dialog.getByLabel("A quién se le paga", { exact: true }).click();
  await page.getByRole("option").first().click();
  await dialog.getByLabel("Fecha de vencimiento", { exact: true }).fill("2026-12-20");
  await expect(dialog.getByLabel("Descripción", { exact: true })).toHaveValue(description);
  await expect(dialog.getByLabel("Cantidad", { exact: true })).toHaveValue("2,00");
  await review.check();
  await expect(save).toBeEnabled();
  await dialog.getByLabel("Cantidad", { exact: true }).fill("3");
  await dialog.getByLabel("Cantidad", { exact: true }).blur();
  await expect(dialog.getByLabel("Cantidad", { exact: true })).toHaveValue("3,00");
  await expect(review).not.toBeChecked();
  await expect(save).toBeDisabled();
  await review.check();

  let actions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) actions += 1;
  });
  await save.click();
  await expect(dialog.getByRole("alert")).toContainText("El borrador ya está guardado", { timeout: 30_000 });
  await expect(dialog.getByLabel("Descripción", { exact: true })).toBeDisabled();
  // The error can render before the server-action transition settles. Wait for
  // recovery to become actionable before asserting the final saved-draft state.
  const retry = dialog.getByRole("button", { name: "Reintentar adjunto", exact: true });
  await expect(retry).toBeEnabled({ timeout: 30_000 });
  await expect(save).toBeDisabled();
  expect(uploads).toHaveLength(1);
  expect(uploads[0]!.linkedEntityType).toBe("SUPPLIER_INVOICE");
  expect(uploads[0]!.projectId).toBeNull();
  const invoiceId = uploads[0]!.linkedEntityId;
  expect(invoiceId).toMatch(/^[0-9a-f-]{36}$/);
  await retry.click();
  await expect(page).toHaveURL(new RegExp(`/finanzas/facturas-proveedor/${invoiceId}$`), { timeout: 30_000 });
  expect(actions).toBe(1);
  expect(uploads).toHaveLength(2);
  expect(uploads[1]).toEqual(uploads[0]);
  expect(uploadedBytes).toHaveLength(2);
  for (const bytes of uploadedBytes) expect(bytes.equals(original)).toBeTruthy();
  expect(confirmations).toBe(1);
  await expect(page.getByRole("button", { name: "Emitir factura", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(description, { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Emitir factura", exact: true })).toBeVisible();
  await testInfo.attach("reviewed-draft-after-attachment-retry", {
    body: await page.screenshot({ fullPage: true }), contentType: "image/png",
  });
});

test("a credit note cannot be applied as a normal invoice and keeps its original for manual entry", async ({ page }) => {
  let actions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) actions += 1;
  });
  const dialog = await openAssistedEntry(page, {
    ...preview("Nota de crédito sintética"), documentKind: "CREDIT_NOTE", canApply: false,
    blockingReasons: ["La nota de crédito requiere el circuito manual correspondiente."],
  });
  await expect(dialog.getByText("Este comprobante necesita carga manual", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Usar datos y completar", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Continuar con carga manual", exact: true }).click();
  await expect(dialog.getByLabel("Descripción", { exact: true })).toHaveValue("");
  await expect(dialog.getByText("factura-prueba.pdf", { exact: true })).toBeVisible();
  // The picker clears its input after selection; the selected File lives in form state.
  // A second read proves that manual fallback retained the original bytes.
  await dialog.getByRole("button", { name: /^Desde un comprobante/ }).click();
  await dialog.getByRole("button", { name: "Leer comprobante", exact: true }).click();
  await expect(dialog.getByText("Este comprobante necesita carga manual", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(actions).toBe(0);
});
