import { expect, test } from "./fixtures";

// Reuses the maintained docs-guide open receivable; this test only reads financial data.
const route = "/proyectos/a0000010-0000-4000-8000-000000000010/flujo-caja";

test("project collection scenario compares applied values, clears drafts and remains usable on mobile", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
  await page.goto(`${route}?currency=ARS`);
  await page.getByRole("button", { name: "Proyección de caja", exact: true }).click();
  // Ignore hidden streamed fragments; require one accessible accordion region.
  const panel = page.getByRole("region", { name: "Proyección de caja", exact: true });
  const dateInput = panel.getByLabel("Fecha de proyección", { exact: true });
  const compare = panel.getByLabel("Comparar atraso de cobranza", { exact: true });
  const delay = panel.getByLabel("Atraso hipotético (días corridos)", { exact: true });
  const today = await dateInput.inputValue();
  const apply = panel.getByRole("button", { name: "Aplicar", exact: true });
  const clear = panel.getByRole("link", { name: "Limpiar", exact: true });
  await compare.check();
  await delay.fill("0");
  await apply.click();
  await expect(panel.getByText(/Escenario aplicado: 0 días/)).toBeVisible();
  const baseValue = panel.getByTestId("projection-base-ARS").locator("p.tabular-nums");
  const scenarioValue = panel.getByTestId("projection-scenario-ARS").locator("p.tabular-nums");
  const differenceValue = panel.getByTestId("projection-difference-ARS").locator("p.tabular-nums");
  await expect(scenarioValue).toHaveText(await baseValue.innerText());
  await expect(differenceValue).toContainText("0,00");

  await delay.fill("1");
  await expect(panel.getByText(/Cambios sin aplicar/)).toBeVisible();
  await expect(panel.getByText(/Escenario aplicado: 0 días/)).toBeVisible();
  await apply.click();
  await expect(panel.getByText(/Escenario aplicado: 1 día corrido/)).toBeVisible();
  await expect(differenceValue).toContainText("-");
  await expect(panel.getByText(/no modifica vencimientos, documentos ni saldos reales/)).toBeVisible();
  expect((await apply.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await clear.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  await testInfo.attach("cash-position-scenario", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  // Regression: applied today without delay, then unsubmitted edits must also be cleared.
  await compare.uncheck();
  await apply.click();
  await expect(panel.getByTestId("projection-base-ARS")).toBeVisible();
  await expect(panel.getByTestId("projection-scenario-ARS")).toHaveCount(0);
  const tomorrow = new Date(`${today}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await dateInput.fill(tomorrow.toISOString().slice(0, 10));
  await compare.check();
  await delay.fill("30");
  await clear.click();
  await expect(page).not.toHaveURL(/projectionDate|projectionCollectionDelayDays/);
  await expect(page).toHaveURL(/currency=ARS/);
  await expect(dateInput).toHaveValue(today);
  await expect(compare).not.toBeChecked();
  await expect(panel.getByText("Elegí una fecha y presioná Aplicar para ver los indicadores.")).toBeVisible();

  await page.goto(`${route}?currency=ARS&projectionDate=${today}&projectionCollectionDelayDays=-1`);
  await expect(panel.getByRole("alert")).toContainText("Se muestra solamente la proyección base.");
  await expect(panel.getByTestId("projection-base-ARS")).toBeVisible();
  await expect(panel.getByTestId("projection-scenario-ARS")).toHaveCount(0);
});
