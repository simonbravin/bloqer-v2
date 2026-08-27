import { test, expect, type Page } from "@playwright/test";
import { getEnv, loadDocsIds } from "../guides/capture/lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "../guides/capture/lib/auth";

const env = getEnv();
const docsIds = loadDocsIds() ?? {};

test.describe.configure({ mode: "default" });

async function dismissDevOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  });
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await dismissDevOverlays(page);
  await page.waitForTimeout(300);
}

async function loginFresh(page: Page, env: ReturnType<typeof getEnv> & { email: string }): Promise<void> {
  await page.context().clearCookies();
  await login(page, env);
}

async function clearLastProjectCookie(page: Page): Promise<void> {
  await page.context().clearCookies({ name: "bloqer-last-project-id" }).catch(() => undefined);
  await page.evaluate(() => {
    document.cookie = "bloqer-last-project-id=; Path=/; Max-Age=0";
  });
}

test.describe("Field Navigation flows", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);

  test("01 — OWNER Field Home at 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    if (pid) {
      await page.goto(`/proyectos/${pid}`);
      await settle(page);
    }
    await page.goto("/dashboard");
    await settle(page);
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);
    await expect(page.getByTestId("field-home")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("field-home-obra")).toBeVisible();
    await expect(page.getByTestId("field-bottom-nav")).toBeVisible();
    await expect(page.getByTestId("field-home-action-jobsiteLog")).toBeVisible();
    await expect(page.getByTestId("field-home-action-purchaseRequest")).toBeVisible();
    await expect(page.getByTestId("field-home-action-consumption")).toBeVisible();
    await expect(page.getByTestId("field-home-pendientes")).toBeVisible();
    await page.getByRole("link", { name: /^abrir obra$/i }).click();
    await page.waitForURL(/\/proyectos\/[0-9a-f-]{36}/i, { timeout: 20_000, waitUntil: "domcontentloaded" });
    await page.getByTestId("field-bottom-nav").getByRole("link", { name: /^inicio$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000, waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("field-home")).toBeVisible();
  });

  test("02 — PROJECT_MANAGER home hides consumption", async ({ page }) => {
    test.skip(!env.fieldPmEmail && !docsIds.fieldPmEmail, "Requires field PM demo user");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, { ...env, email: env.fieldPmEmail ?? docsIds.fieldPmEmail! });
    await page.goto("/dashboard");
    await settle(page);
    await expect(page.getByTestId("field-home")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("field-home-action-jobsiteLog")).toBeVisible();
    await expect(page.getByTestId("field-home-action-consumption")).toHaveCount(0);
  });

  test("03 — VIEWER has no create CTAs", async ({ page }) => {
    test.skip(!env.fieldViewerEmail && !docsIds.fieldViewerEmail, "Requires viewer demo user");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, { ...env, email: env.fieldViewerEmail ?? docsIds.fieldViewerEmail! });
    await page.goto("/dashboard");
    await settle(page);
    await expect(page.getByTestId("field-home")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("field-home-action-jobsiteLog")).toHaveCount(0);
    await expect(page.getByTestId("field-home-action-purchaseRequest")).toHaveCount(0);
    await expect(page.getByTestId("field-home-action-consumption")).toHaveCount(0);
  });

  test("04 — bottom nav + plus + more at 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    await page.goto(`/proyectos/${pid}`);
    await settle(page);
    await dismissDevOverlays(page);
    const nav = page.getByTestId("field-bottom-nav");
    await expect(nav).toBeVisible();
    await nav.getByRole("link", { name: /^inicio$/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000, waitUntil: "domcontentloaded" });
    await nav.getByRole("link", { name: /^obra$/i }).click();
    await page.waitForURL(new RegExp(`/proyectos/${pid}`), { timeout: 20_000, waitUntil: "domcontentloaded" });
    await page.getByTestId("field-plus-button").click();
    const plusSheet = page.getByTestId("field-plus-sheet");
    await expect(plusSheet).toBeVisible();
    await plusSheet.getByRole("button", { name: /nuevo parte/i }).click();
    await page.waitForURL(/\/libro-obra\/nuevo/, { timeout: 60_000, waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("field-bottom-nav")).toHaveCount(0);

    await page.goto(`/proyectos/${pid}`);
    await settle(page);
    await dismissDevOverlays(page);
    await page.getByTestId("field-plus-button").click();
    await page.getByTestId("field-plus-sheet").getByRole("button", { name: /solicitud de compra/i }).click();
    await page.waitForURL(/\/solicitudes-compra\/nueva/, { timeout: 60_000, waitUntil: "domcontentloaded" });

    await page.goto(`/proyectos/${pid}`);
    await settle(page);
    await dismissDevOverlays(page);
    await page.getByTestId("field-plus-button").click();
    await page.getByTestId("field-plus-sheet").getByRole("button", { name: /registrar consumo/i }).click();
    await page.waitForURL(/\/consumos/, { timeout: 60_000, waitUntil: "domcontentloaded" });

    await page.goto(`/proyectos/${pid}`);
    await settle(page);
    await dismissDevOverlays(page);
    await page.getByTestId("field-plus-button").click();
    await page.getByTestId("field-plus-sheet").getByRole("button", { name: /subir documento/i }).click();
    await page.waitForURL(/\/documentos/, { timeout: 60_000, waitUntil: "domcontentloaded" });

    await dismissDevOverlays(page);
    await page.getByTestId("field-bottom-nav").getByRole("link", { name: /pendientes/i }).click();
    await page.waitForURL(/\/pendientes/, { timeout: 60_000, waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("field-pending-inbox")).toBeVisible();

    await page.getByTestId("field-more-button").click();
    await expect(page.getByTestId("field-more-sheet")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /mostrar menú lateral/i }).click();
    await expect(page.getByRole("dialog").getByText(/libro de obra|resumen|inicio/i).first()).toBeVisible();
  });

  test("05 — OWNER pendientes include PO; PM does not", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    await page.goto("/pendientes");
    await settle(page);
    await expect(page.getByTestId("field-pending-card").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-entity-type="PURCHASE_ORDER"]').first()).toBeVisible();
    await expect(
      page.locator('[data-entity-type="PURCHASE_ORDER"]').getByRole("link", { name: /^revisar$/i }).first(),
    ).toBeVisible();
    await page.getByRole("link", { name: /^compras$/i }).click();
    await expect(page).toHaveURL(/grupo=compras/);

    test.skip(!env.fieldPmEmail && !docsIds.fieldPmEmail, "Requires field PM demo user");
    await loginFresh(page, { ...env, email: env.fieldPmEmail ?? docsIds.fieldPmEmail! });
    await page.goto("/pendientes");
    await settle(page);
    await expect(page.locator('[data-entity-type="PURCHASE_ORDER"]')).toHaveCount(0);
    await expect(page.locator('[data-entity-type="JOBSITE_LOG"]').first()).toBeVisible();
  });

  test("06 — plus does not assume DEMO-001 without context", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    await clearLastProjectCookie(page);
    await page.goto("/dashboard");
    await settle(page);
    await page.getByTestId("field-plus-button").click();
    await expect(page.getByTestId("field-plus-sheet")).toBeVisible();
    await page.getByRole("button", { name: /nuevo parte/i }).click();
    await expect(page.getByTestId("field-project-picker")).toBeVisible({ timeout: 15_000 });
    const project2 = env.project2Id ?? docsIds.project2Id;
    if (project2) {
      await page.getByRole("button", { name: /DEMO-002/i }).click();
      await page.waitForURL(new RegExp(`/proyectos/${project2}/libro-obra/nuevo`), {
        timeout: 20_000,
        waitUntil: "domcontentloaded",
      });
    }
  });

  test("07 — no bottom nav at 768 / 1440", async ({ page }) => {
    await login(page, env);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/dashboard");
    await settle(page);
    await expect(page.getByTestId("field-bottom-nav")).toBeHidden();
    await expect(page.getByTestId("field-home")).toBeHidden();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/dashboard");
    await settle(page);
    await expect(page.getByTestId("field-bottom-nav")).toBeHidden();
  });
});
