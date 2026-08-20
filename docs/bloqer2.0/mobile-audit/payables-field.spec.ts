import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { getEnv, loadDocsIds } from "../guides/capture/lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "../guides/capture/lib/auth";

const env = getEnv();
const docsIds = loadDocsIds() ?? {};
const OUT_DIR = path.resolve(__dirname, "after-payables-field");

function shotPath(filename: string): string {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return path.join(OUT_DIR, filename);
}

async function dismissDevOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  }).catch(() => undefined);
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await dismissDevOverlays(page);
  await page.waitForTimeout(400);
}

async function viewportHintForWidth(width: number): Promise<"sm" | "md" | "lg"> {
  if (width >= 1024) return "lg";
  if (width >= 768) return "md";
  return "sm";
}

async function setViewportHintCookie(page: Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 390;
  const origin = new URL(page.url() === "about:blank" ? "http://localhost:3000" : page.url()).origin;
  await page.context().addCookies([
    {
      name: "bloqer-viewport",
      value: await viewportHintForWidth(width),
      url: origin,
    },
  ]);
}

async function gotoCxp(page: Page, projectId: string, query = "field=pending"): Promise<void> {
  await setViewportHintCookie(page);
  const res = await page.goto(`/proyectos/${projectId}/cuentas-por-pagar?${query}`, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  await settle(page);
  expect(res?.status() ?? 200).toBeLessThan(400);
}

async function capture(page: Page, filename: string, fullPage = true): Promise<void> {
  await settle(page);
  await page.screenshot({ path: shotPath(filename), fullPage, animations: "disabled" });
}

async function chooseTreasuryAccount(page: Page): Promise<void> {
  await page.locator("#payment-account").click();
  await page.getByRole("option", { name: /Cuenta Demo Conciliación/i }).click();
}

test.describe.configure({ mode: "serial" });

test.describe("Payables Field", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);

  test("390 list, overdue, partial pay, history and full pay", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    expect(pid).toBeTruthy();

    await gotoCxp(page, pid!);
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);

    await expect(page.getByRole("heading", { name: "Cuentas por pagar" })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("payables-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("payables-desktop-view")).toHaveCount(0);
    await expect(page.getByTestId("payables-field-chip-pending")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("payables-field-card").first()).toBeVisible();
    await capture(page, "01-cxp-pendientes-390.png");

    const queryMs = await page.getByTestId("payables-field-view").getAttribute("data-query-ms");
    const source = await page.getByTestId("payables-field-view").getAttribute("data-payables-source");
    console.log(`payables field queryMs=${queryMs} source=${source}`);

    await page.getByTestId("payables-field-chip-overdue").click();
    await expect(page.getByTestId("payables-field-chip-overdue")).toHaveAttribute("aria-pressed", "true");
    const overdueCard = page.getByTestId("payables-field-card").filter({ hasText: "FP-09101" });
    await expect(overdueCard).toBeVisible();
    await expect(overdueCard.getByTestId("payables-field-urgency")).toHaveText(/Vencida/);
    await expect(overdueCard.getByTestId("payables-field-card-open")).toHaveText("Ver cuenta");
    await capture(page, "02-cxp-vencidas-390.png");
    await capture(page, "03-cxp-card-390.png");

    await overdueCard.getByTestId("payables-field-card-open").click();
    await page.waitForURL(/\/cuentas-por-pagar\/[^/]+$/, { timeout: 40_000 });
    await settle(page);
    await expect(page.getByTestId("payables-field-detail")).toBeVisible();
    await expect(page.getByTestId("payables-field-register-pay")).toBeVisible();
    await expect(page.getByTestId("payables-field-invoice-link")).toBeVisible();
    await capture(page, "04-cxp-detalle-390.png");

    await page.getByTestId("payables-field-register-pay").click();
    await page.waitForURL(/\/pagar/, { timeout: 40_000 });
    await settle(page);
    await expect(page.getByTestId("payables-field-payment-form")).toBeVisible();
    await expect(page.getByTestId("payables-field-pending-balance")).toBeVisible();
    await chooseTreasuryAccount(page);
    await page.locator("#amount").fill("10000.00");
    await capture(page, "05-pago-mobile-390.png");

    await page.getByTestId("payables-field-review-pay").click();
    await expect(page.getByTestId("payables-field-payment-confirm")).toBeVisible();
    await expect(page.getByTestId("payables-field-confirm-pay")).toHaveText("Confirmar pago");
    await expect(page.getByTestId("payables-field-review-pay")).toHaveCount(0);
    await capture(page, "06-pago-confirmacion-390.png");

    await page.getByTestId("payables-field-confirm-pay").click();
    await page.waitForURL(/paid=1/, { timeout: 60_000 });
    await settle(page);
    await expect(page.getByTestId("payables-field-paid-banner")).toHaveText("Pago registrado");
    await expect(page.getByTestId("payables-field-balance")).not.toHaveText(/120\.000/);
    await expect(page.getByTestId("payables-field-payment-card").first()).toBeVisible();
    await capture(page, "07-pago-registrado-390.png");

    await gotoCxp(page, pid!, "field=upcoming");
    const upcoming = page.getByTestId("payables-field-card").filter({ hasText: "FP-09102" });
    await expect(upcoming).toBeVisible();
    await upcoming.getByTestId("payables-field-card-open").click();
    await page.waitForURL(/\/cuentas-por-pagar\/[^/]+$/, { timeout: 40_000 });
    await page.getByTestId("payables-field-register-pay").click();
    await page.waitForURL(/\/pagar/, { timeout: 40_000 });
    await settle(page);
    await chooseTreasuryAccount(page);
    await page.getByTestId("payables-field-pay-full").click();
    await page.getByTestId("payables-field-review-pay").click();
    await expect(page.getByTestId("payables-field-payment-confirm")).toBeVisible();
    await page.getByTestId("payables-field-confirm-pay").click();
    await page.waitForURL(/paid=1/, { timeout: 60_000 });
    await settle(page);
    await expect(page.getByTestId("payables-field-paid-banner")).toBeVisible();
    await expect(page.getByText("Pagado").first()).toBeVisible();
  });

  test("VIEWER can read and has no Registrar pago", async ({ page }) => {
    test.skip(!env.fieldViewerEmail && !docsIds.fieldViewerEmail, "Requires viewer demo user");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, { ...env, email: env.fieldViewerEmail ?? docsIds.fieldViewerEmail! });
    const pid = env.projectId ?? docsIds.projectId;
    await gotoCxp(page, pid!);
    await assertNotOnErrorPage(page);
    await expect(page.getByTestId("payables-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("payables-field-card").first()).toBeVisible();
    await page.getByTestId("payables-field-card").filter({ hasText: "FP-09101" }).getByTestId("payables-field-card-open").click();
    await expect(page.getByTestId("payables-field-detail")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("payables-field-register-pay")).toHaveCount(0);
    await capture(page, "08-cxp-viewer-390.png");
  });

  test("768 field cards and 1440 desktop aging", async ({ page }) => {
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;

    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoCxp(page, pid!);
    await expect(page.getByTestId("payables-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("payables-desktop-view")).toHaveCount(0);
    await capture(page, "09-cxp-768.png");

    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoCxp(page, pid!);
    await expect(page.getByRole("heading", { name: "Cuentas por pagar" })).toBeVisible({
      timeout: 40_000,
    });
    await expect(page.getByTestId("payables-desktop-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("payables-field-view")).toHaveCount(0);
    await expect(page.getByText(/Al \d{4}-\d{2}-\d{2}|Al \d{2}\/\d{2}/)).toBeVisible();
    await capture(page, "10-cxp-desktop-1440.png");
  });
});
