import { expect, test } from "./fixtures";

// Existing maintained documentation fixtures, installed only in disposable CI SQL.
const project = "/proyectos/a0000010-0000-4000-8000-000000000010";
const taskId = "a0000100-0000-4000-8000-000000000100";
const order = `${project}/ordenes-compra/a0000020-0000-4000-8000-000000000020`;

test("schedule supply shows source quantities on desktop and Field, with complete Excel and PDF", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
  await page.goto(`${project}/cronograma?view=table&field=all&itemId=${taskId}`);
  const supply = page.getByRole("region", { name: "Abastecimiento de la tarea" });
  await expect(supply).toBeVisible();
  await expect(supply.getByText("Cemento Portland demo", { exact: true })).toBeVisible();
  await expect(supply.getByText(/Pendiente [\d.,]+ bolsa/)).toBeVisible();
  await expect(supply.getByText(/La última recepción puede ser parcial/)).toBeVisible();
  const source = supply.locator(`a[href="${order}"]`);
  await expect(source).toBeVisible();
  expect((await source.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  await testInfo.attach("schedule-supply", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await page.keyboard.press("Escape");
  await expect(supply).not.toBeVisible();
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Exportar cronograma" });
  await expect(dialog).toBeVisible();
  if (testInfo.project.name !== "desktop") await expect(dialog.getByText(/sin los filtros de las tarjetas/)).toBeVisible();
  await dialog.getByRole("button", { name: "Tabla", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Excel", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const workbook = Buffer.concat(chunks).toString("utf8");
  expect(workbook).toContain('name="Abastecimiento"');
  expect(workbook).toContain("Cemento Portland demo");
  expect(workbook).toContain("Pendiente");
  const pdf = await page.request.get(`/api/reports${project}/cronograma?format=pdf&view=table`);
  expect(pdf.ok()).toBe(true);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await page.keyboard.press("Escape");
  await page.goto(`${project}/cronograma?view=table&field=all&itemId=${taskId}`);
  await page.getByRole("region", { name: "Abastecimiento de la tarea" }).locator(`a[href="${order}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${order}$`));
});
