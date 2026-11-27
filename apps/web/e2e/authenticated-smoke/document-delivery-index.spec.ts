import fs from "node:fs/promises";
import { expect, test } from "./fixtures";

const projectId = "a0000010-0000-4000-8000-000000000010";
const indexPath = `/proyectos/${projectId}/documentos/indice-entrega`;
const exportPath = `/api/reports/proyectos/${projectId}/documentos/indice-entrega/export`;

test("delivery index preserves pagination, revisions and provenance and exports every matching file", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
  await page.goto(`/proyectos/${projectId}/documentos`);
  await page.getByRole("link", { name: "Índice de entrega", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${indexPath}$`));
  await page.getByLabel("Buscar archivo o descripción", { exact: true }).fill("Entrega CI");
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page.getByTestId("delivery-document")).toHaveCount(25);
  await expect(page.getByRole("navigation", { name: "Páginas del índice" })).toContainText("27 archivos");
  await page.getByRole("link", { name: "Siguiente", exact: true }).click();
  await expect(page.getByTestId("delivery-document")).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Páginas del índice" })).toContainText("Página 2 de 2");
  await expect(page.getByRole("link", { name: "Anterior: Entrega CI 00.pdf", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Descargar original", exact: true })).toHaveCount(0);
  await page.getByLabel("Estado", { exact: true }).selectOption("ALL");
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Páginas del índice" })).toContainText("Página 1 de 2");
  await page.getByRole("link", { name: "Siguiente", exact: true }).click();
  await expect(page.getByTestId("delivery-document")).toHaveCount(3);

  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "CSV", exact: true }).click();
  const download = await pendingDownload;
  const csv = await fs.readFile((await download.path())!, "utf8");
  expect(csv.split(/\r?\n/)).toHaveLength(29);
  expect(csv).toContain("Entrega CI 00.pdf");
  expect(csv).toContain("Entrega CI 27.pdf");
  expect(csv).toContain("Sin original registrado");
  expect(csv).not.toContain("storageKey");
  for (const format of ["xlsx", "pdf"]) {
    const response = await page.request.get(`${exportPath}?format=${format}&search=Entrega%20CI&status=ALL`);
    expect(response.status()).toBe(200);
    const buffer = await response.body();
    expect(buffer.subarray(0, format === "pdf" ? 4 : 2).toString()).toBe(format === "pdf" ? "%PDF" : "PK");
  }
  const invalid = await page.request.get(`${exportPath}?format=zip`);
  expect(invalid.status()).toBe(400);
  const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
  expect(layout.document).toBeLessThanOrEqual(layout.viewport + 1);
  await testInfo.attach("document-delivery-index", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  await page.getByRole("link", { name: "Anterior: Entrega CI 00.pdf", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/documentos/a0000400-0000-4000-8000-000000000001$`));
});
