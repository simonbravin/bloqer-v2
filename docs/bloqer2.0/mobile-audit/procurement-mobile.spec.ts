import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { getEnv, loadDocsIds } from "../guides/capture/lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "../guides/capture/lib/auth";

const env = getEnv();
const docsIds = loadDocsIds() ?? {};
const FIXTURE_DIR = path.resolve(__dirname, "fixtures");
const FIXTURE_PNG = path.join(FIXTURE_DIR, "jobsite-evidence.png");

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAlElEQVR4nO3QMQ0AIAwEsQ78s+UHmhQY0nDJzT5n5g7A/rcA4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8BAPABFl0CAf0nVYkAAAAASUVORK5CYII=",
  "base64",
);

test.describe.configure({ mode: "default" });

function ensureFixture(): void {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  if (!fs.existsSync(FIXTURE_PNG)) fs.writeFileSync(FIXTURE_PNG, PNG_BYTES);
}

async function dismissDevOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  });
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page.waitForTimeout(300);
}

test.describe("Procurement Mobile flows", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);

  test("01 — solicitud + foto + enviar at 390", async ({ page }) => {
    ensureFixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    await page.goto("/dashboard");
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);

    const pid = env.projectId ?? docsIds.projectId;
    expect(pid).toBeTruthy();

    await page.goto(`/proyectos/${pid}/solicitudes-compra`);
    await settle(page);
    await expect(page.getByRole("heading", { name: /solicitudes de compra/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("purchase-request-mobile-card").first()).toBeVisible();

    await page.goto(`/proyectos/${pid}/solicitudes-compra/nueva`);
    await settle(page);
    await expect(page.getByRole("heading", { name: /nueva solicitud/i })).toBeVisible({ timeout: 40_000 });

    await page.locator("#pr-wbs").click();
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();
    const desc = `Cemento campo ${Date.now()}`;
    await page.locator("#description").fill(desc);
    await page.locator("#quantity").fill("3");

    await page.getByTestId("purchase-request-evidence-file").setInputFiles(FIXTURE_PNG);
    await expect(page.getByText(/Archivo 1/)).toBeVisible({ timeout: 10_000 });

    await dismissDevOverlays(page);
    await page.getByTestId("purchase-request-create-submit").click();
    const retryPanel = page.getByText(/Solicitud creada correctamente/i);
    await Promise.race([
      page.waitForURL(/\/solicitudes-compra\/[0-9a-f-]{36}/i, { timeout: 90_000 }),
      retryPanel.waitFor({ timeout: 90_000 }),
    ]);
    if (await retryPanel.isVisible().catch(() => false)) {
      await page.getByRole("link", { name: /ver solicitud/i }).click();
      await page.waitForURL(/\/solicitudes-compra\/[0-9a-f-]{36}/i, { timeout: 30_000 });
    }
    await settle(page);
    await expect(page.getByText(desc).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/jobsite-evidence\.png|Archivo 1/i).first()).toBeVisible({ timeout: 20_000 });

    const submit = page.getByTestId("purchase-request-submit");
    if (await submit.isVisible().catch(() => false)) {
      await dismissDevOverlays(page);
      await submit.click({ force: true });
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      if (await page.getByRole("heading", { name: /application error/i }).isVisible().catch(() => false)) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
      }
      await expect(page.getByText("Enviada").first()).toBeVisible({ timeout: 40_000 });
    }
  });

  test("02 — aprobar OC SUBMITTED at 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    const poId = env.submittedPoId ?? docsIds.submittedPoId;
    expect(poId).toBeTruthy();

    await page.goto(`/proyectos/${pid}/ordenes-compra/${poId}`);
    await settle(page);
    await expect(page.getByTestId("po-mobile-fiche")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("po-line-card").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /documentos/i })).toBeVisible();

    await page.getByTestId("po-approve-button").click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^aprobar$/i }).click();
    await settle(page);
    await expect(page.getByText(/aprobad/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("03 — devolver OC SUBMITTED con motivo at 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    const poId = env.returnPoId ?? docsIds.returnPoId;
    expect(poId).toBeTruthy();

    await page.goto(`/proyectos/${pid}/ordenes-compra/${poId}`);
    await settle(page);
    await page.getByTestId("po-return-button").click();
    await page.getByTestId("po-return-reason").fill("Falta cotización de respaldo demo.");
    await page.getByTestId("po-return-confirm").click();
    await settle(page);
    await expect(page.getByText(/borrador/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("04 — PROJECT_MANAGER no ve Aprobar", async ({ page }) => {
    test.skip(!env.fieldPmEmail && !docsIds.fieldPmEmail, "Requires field PM demo user");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, { ...env, email: env.fieldPmEmail ?? docsIds.fieldPmEmail! });
    const pid = env.projectId ?? docsIds.projectId;
    const poId = env.returnPoId ?? docsIds.returnPoId ?? env.submittedPoId ?? docsIds.submittedPoId;
    await page.goto(`/proyectos/${pid}/ordenes-compra/${poId}`);
    await settle(page);
    await expect(page.getByTestId("po-approve-button")).toHaveCount(0);
    await expect(page.getByTestId("po-return-button")).toHaveCount(0);
  });

  test("05 — recepción + foto from OC confirmada at 390", async ({ page }) => {
    ensureFixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    const poId = env.poId ?? docsIds.confirmedPoId;
    expect(poId).toBeTruthy();

    await page.goto(`/proyectos/${pid}/ordenes-compra/${poId}`);
    await settle(page);
    const register = page.getByTestId("po-register-receipt");
    await expect(register).toBeVisible({ timeout: 20_000 });
    await register.click();
    await page.waitForURL(/\/recepciones\/nueva/, { timeout: 20_000 });
    await settle(page);

    const qty = page.locator('input[inputmode="decimal"]').first();
    await expect(qty).toBeVisible();
    await qty.fill("1");
    await page.getByTestId("receipt-evidence-file").setInputFiles(FIXTURE_PNG);
    await expect(page.getByText(/Archivo 1/)).toBeVisible({ timeout: 10_000 });

    await dismissDevOverlays(page);
    await page.getByRole("button", { name: /registrar recepción/i }).click();
    const retryPanel = page.getByText(/Recepción creada correctamente/i);
    await Promise.race([
      page.waitForURL(/\/recepciones\/[0-9a-f-]{36}/i, { timeout: 90_000 }),
      retryPanel.waitFor({ timeout: 90_000 }),
    ]);
    if (await retryPanel.isVisible().catch(() => false)) {
      await page.getByRole("link", { name: /ver recepción/i }).click();
      await page.waitForURL(/\/recepciones\/[0-9a-f-]{36}/i, { timeout: 30_000 });
    }
    await settle(page);
    await expect(page.getByRole("heading", { name: /recepción/i })).toBeVisible();
    await expect(page.getByText(/jobsite-evidence\.png|Archivo 1/i).first()).toBeVisible({ timeout: 20_000 });
    await dismissDevOverlays(page);
    await page.getByTestId("receipt-po-link").click({ force: true });
    await page.waitForURL(new RegExp(`/ordenes-compra/${poId}(?:\\?|$)`), {
      timeout: 20_000,
      waitUntil: "domcontentloaded",
    });
  });

  test("06 — recepción cantidad inválida (excede pendiente)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    const poId = env.poId ?? docsIds.confirmedPoId;
    await page.goto(`/proyectos/${pid}/ordenes-compra/${poId}/recepciones/nueva`);
    await settle(page);
    const qty = page.locator('input[inputmode="decimal"]').first();
    if (!(await qty.isVisible().catch(() => false))) {
      test.info().annotations.push({ type: "note", description: "Sin cantidades pendientes; tolerancia no ejercitada." });
      return;
    }
    await qty.fill("999999");
    await page.getByRole("button", { name: /registrar recepción/i }).click();
    await expect(page.getByText(/excede/i)).toBeVisible({ timeout: 10_000 });
  });

  test("07 — consumo demo se registra", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    await page.goto(`/proyectos/${pid}/consumos`);
    await settle(page);
    await dismissDevOverlays(page);
    const register = page.getByRole("button", { name: /registrar consumo/i }).first();
    await expect(register).toBeVisible();
    await register.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByText(/necesitás al menos un producto/i)).toHaveCount(0);

    await sheet.getByRole("combobox").first().click();
    await page.getByRole("option").first().click();
    await sheet.getByRole("combobox").nth(1).click();
    await page.getByRole("option").first().click();
    await sheet.locator("#quantity").fill("1");
    await sheet.getByRole("button", { name: /^registrar consumo$/i }).click();
    await page.waitForURL(new RegExp(`/proyectos/${pid}/consumos$`), { timeout: 30_000 });
    await settle(page);
    await expect(page.getByText(/cemento portland demo|CEM-DEMO-50/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
