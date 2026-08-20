import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { getEnv, loadDocsIds } from "../guides/capture/lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "../guides/capture/lib/auth";

const env = getEnv();
const docsIds = loadDocsIds() ?? {};
const OUT_DIR = path.resolve(__dirname, "after-receivables-field");

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

async function gotoCxc(page: Page, projectId: string, query = "field=pending"): Promise<void> {
  await setViewportHintCookie(page);
  const res = await page.goto(`/proyectos/${projectId}/cuentas-por-cobrar?${query}`, {
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
  await page.locator("#collection-account").click();
  await page.getByRole("option", { name: /Cuenta Demo Conciliación/i }).click();
}

test.describe.configure({ mode: "serial" });

test.describe("Receivables Field", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);

  test("390 list, overdue, partial collect, history and full collect", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    expect(pid).toBeTruthy();

    await gotoCxc(page, pid!);
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);

    await expect(page.getByRole("heading", { name: "Cuentas por cobrar" })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("receivables-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("receivables-desktop-view")).toHaveCount(0);
    await expect(page.getByTestId("receivables-field-chip-pending")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("receivables-field-card").first()).toBeVisible();
    await capture(page, "01-cxc-pendientes-390.png");

    const queryMs = await page.getByTestId("receivables-field-view").getAttribute("data-query-ms");
    const source = await page.getByTestId("receivables-field-view").getAttribute("data-receivables-source");
    console.log(`receivables field queryMs=${queryMs} source=${source}`);

    await page.getByTestId("receivables-field-chip-overdue").click();
    await expect(page.getByTestId("receivables-field-chip-overdue")).toHaveAttribute("aria-pressed", "true");
    const overdueCard = page.getByTestId("receivables-field-card").filter({ hasText: "FAC-09201" });
    await expect(overdueCard).toBeVisible();
    await expect(overdueCard.getByTestId("receivables-field-urgency")).toHaveText(/Vencida/);
    await expect(overdueCard.getByTestId("receivables-field-card-open")).toHaveText("Ver cuenta");
    await capture(page, "02-cxc-vencidas-390.png");
    await capture(page, "03-cxc-card-390.png");

    await page.getByTestId("receivables-field-search").fill("FAC-09201");
    await expect(page.getByTestId("receivables-field-card")).toHaveCount(1);
    await expect(overdueCard).toBeVisible();

    await overdueCard.getByTestId("receivables-field-card-open").click();
    await page.waitForURL(/\/cuentas-por-cobrar\/[^/]+$/, { timeout: 180_000, waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByTestId("receivables-field-detail")).toBeVisible();
    await expect(page.getByTestId("receivables-field-register-collect")).toBeVisible();
    await expect(page.getByTestId("receivables-field-invoice-link")).toBeVisible();
    await capture(page, "04-cxc-detalle-390.png");

    await page.getByTestId("receivables-field-register-collect").click();
    await page.waitForURL(/\/cobrar/, { timeout: 180_000, waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByTestId("receivables-field-collection-form")).toBeVisible();
    await expect(page.getByTestId("receivables-field-pending-balance")).toBeVisible();
    await chooseTreasuryAccount(page);
    await page.locator("#amount").fill("10000.00");
    await capture(page, "05-cobro-mobile-390.png");

    await page.getByTestId("receivables-field-review-collect").click();
    await expect(page.getByTestId("receivables-field-collection-confirm")).toBeVisible();
    await expect(page.getByTestId("receivables-field-confirm-collect")).toHaveText("Confirmar cobro");
    await expect(page.getByTestId("receivables-field-review-collect")).toHaveCount(0);
    await capture(page, "06-cobro-confirmacion-390.png");

    await page.getByTestId("receivables-field-confirm-collect").click();
    await page.waitForURL(/collected=1/, { timeout: 180_000, waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByTestId("receivables-field-collected-banner")).toHaveText("Cobro registrado");
    await expect(page.getByTestId("receivables-field-balance")).not.toHaveText(/120\.000/);
    await expect(page.getByTestId("receivables-field-collection-card").first()).toBeVisible();
    await capture(page, "07-cobro-registrado-390.png");

    await gotoCxc(page, pid!, "field=upcoming");
    const upcoming = page.getByTestId("receivables-field-card").filter({ hasText: "FAC-09202" });
    await expect(upcoming).toBeVisible();
    await upcoming.getByTestId("receivables-field-card-open").click();
    await page.waitForURL(/\/cuentas-por-cobrar\/[^/]+$/, { timeout: 180_000, waitUntil: "domcontentloaded" });
    await page.getByTestId("receivables-field-register-collect").click();
    await page.waitForURL(/\/cobrar/, { timeout: 180_000, waitUntil: "domcontentloaded" });
    await settle(page);
    await chooseTreasuryAccount(page);
    await page.getByTestId("receivables-field-collect-full").click();
    await page.getByTestId("receivables-field-review-collect").click();
    await expect(page.getByTestId("receivables-field-collection-confirm")).toBeVisible();
    await page.getByTestId("receivables-field-confirm-collect").click();
    await page.waitForURL(/collected=1/, { timeout: 180_000, waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByTestId("receivables-field-collected-banner")).toBeVisible();
    await expect(page.getByText("Cobrada").first()).toBeVisible();
  });

  test("VIEWER can read and has no Registrar cobro", async ({ page }) => {
    test.skip(!env.fieldViewerEmail && !docsIds.fieldViewerEmail, "Requires viewer demo user");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, { ...env, email: env.fieldViewerEmail ?? docsIds.fieldViewerEmail! });
    const pid = env.projectId ?? docsIds.projectId;
    await gotoCxc(page, pid!);
    await assertNotOnErrorPage(page);
    await expect(page.getByTestId("receivables-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("receivables-field-card").first()).toBeVisible();
    await page.getByTestId("receivables-field-card").filter({ hasText: "FAC-09201" }).getByTestId("receivables-field-card-open").click();
    await expect(page.getByTestId("receivables-field-detail")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("receivables-field-register-collect")).toHaveCount(0);
    await capture(page, "08-cxc-viewer-390.png");
  });

  test("768 field cards and 1440 desktop aging", async ({ page }) => {
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;

    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoCxc(page, pid!);
    await expect(page.getByTestId("receivables-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("receivables-desktop-view")).toHaveCount(0);
    await capture(page, "09-cxc-768.png");

    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoCxc(page, pid!);
    await expect(page.getByRole("heading", { name: "Cuentas por cobrar" })).toBeVisible({
      timeout: 40_000,
    });
    await expect(page.getByTestId("receivables-desktop-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("receivables-field-view")).toHaveCount(0);
    await expect(page.getByText(/Al \d{4}-\d{2}-\d{2}|Al \d{2}\/\d{2}/)).toBeVisible();
    await capture(page, "10-cxc-desktop-1440.png");
  });
});
