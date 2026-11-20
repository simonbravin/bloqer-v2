import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";

// Existing seedDocsGuideDataset IDs. The fixture lives only in disposable CI Postgres.
const projectId = "a0000010-0000-4000-8000-000000000010";
const orderId = "a0000020-0000-4000-8000-000000000020";
const orderPath = `/proyectos/${projectId}/ordenes-compra/${orderId}`;
const pdfPath = `/api/reports/proyectos/${projectId}/ordenes-compra/${orderId}/export?format=pdf`;

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
});

test("authenticated manual invoice entry remains usable while extraction is disabled", async ({ page }, testInfo) => {
  const capability = await page.request.get("/api/ai/supplier-invoice-preview");
  expect(capability.status()).toBe(200);
  expect(await capability.json()).toEqual({ enabled: false });
  const disabled = await page.request.post("/api/ai/supplier-invoice-preview");
  expect(disabled.status()).toBe(503);

  await page.goto("/finanzas/facturas-proveedor");
  await page.getByRole("button", { name: "Nueva factura", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva factura de gasto", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancelar", exact: true })).toBeEnabled();
  const layout = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
  await testInfo.attach("manual-invoice", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("a signed-in user can prepare and download the existing order PDF", async ({ page }, testInfo) => {
  await page.goto(orderPath);
  await page.getByRole("button", { name: "PDF para proveedor", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("status")).toHaveText("PDF listo para revisar", { timeout: 30_000 });
  const pendingDownload = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Descargar PDF", exact: true }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  const file = await download.path();
  expect(file).not.toBeNull();
  const bytes = await fs.readFile(file!);
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  expect(bytes.length).toBeGreaterThan(1000);
  await testInfo.attach("purchase-order", { body: bytes, contentType: "application/pdf" });
  await testInfo.attach("purchase-order-dialog", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  // The footer button precedes DialogContent's icon button with the same accessible name.
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).first().click();
  await expect(dialog).toHaveCount(0);
});

test("removing the session prevents access to a previously downloaded private PDF", async ({ page }) => {
  const authenticated = await page.request.get(pdfPath, { maxRedirects: 0 });
  expect(authenticated.status()).toBe(200);
  expect(authenticated.headers()["content-type"]).toContain("application/pdf");
  expect(authenticated.headers()["cache-control"]).toContain("no-store");
  await page.context().clearCookies();
  const anonymous = await page.request.get(pdfPath, { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  expect(new URL(anonymous.headers().location!).pathname).toBe("/login");
  expect(anonymous.headers()["content-disposition"]).toBeUndefined();
});
