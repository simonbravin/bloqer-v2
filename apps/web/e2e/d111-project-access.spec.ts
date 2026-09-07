/**
 * D-111 Phase C — project access UI smoke (Neon DEV adversarial fixtures).
 *
 * Gated: BLOQER_AI_E2E=1 (same password as AI e2e) + seeded users.
 * Viewports: 390 / 768 / 1440.
 */
import { expect, test, type Page } from "@playwright/test";

const e2eEnabled = process.env.BLOQER_AI_E2E === "1";
const baseUrl = (process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3000").replace(/\/$/, "");
const password =
  process.env.BLOQER_AI_E2E_PASSWORD?.trim() ||
  process.env.E2E_USER_PASSWORD?.trim() ||
  "bloqer-ai-e2e-local-only";

const OWNER_EMAIL = "ai-adv-owner-a@bloqer.demo";
const PM_EMAIL = "ai-adv-pm-a@bloqer.demo";

const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

async function login(page: Page, email: string) {
  await page.goto(`${baseUrl}/login`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 45_000 });
}

test.describe("D-111 project access UI", () => {
  test.skip(!e2eEnabled, "Set BLOQER_AI_E2E=1 + seeded D-111 fixtures");

  for (const vp of viewports) {
    test(`OWNER Equipo → Acceso a obras @${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page, OWNER_EMAIL);
      await page.goto(`${baseUrl}/configuracion/equipo`);
      await expect(page.getByRole("heading", { name: /equipo/i })).toBeVisible({
        timeout: 20_000,
      });
      // Exclude Invitar — href also matches /configuracion/equipo/*
      const memberLink = page
        .locator('a[href^="/configuracion/equipo/"]')
        .filter({ hasNotText: /invitar/i })
        .first();
      await memberLink.click();
      await expect(page).toHaveURL(/\/configuracion\/equipo\/[^/]+$/, { timeout: 20_000 });
      await expect(page.getByText("Acceso a obras", { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(/permisos \(roles\)/i)).toBeVisible();
      await page.screenshot({
        path: `test-results/d111-acceso-obras-${vp.name}.png`,
        fullPage: true,
      });
    });
  }

  test("OWNER Políticas Acceso a proyectos", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, OWNER_EMAIL);
    await page.goto(`${baseUrl}/configuracion/politicas#acceso-obras`);
    await expect(
      page.getByText(/Solo proyectos asignados|Todos los proyectos/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: "test-results/d111-politicas-acceso-proyectos-1440.png",
      fullPage: true,
    });
  });

  test("PM cannot manage Equipo (unauthorized)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, PM_EMAIL);
    await page.goto(`${baseUrl}/configuracion/equipo`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const url = page.url();
    const deniedByRedirect = !url.includes("/configuracion/equipo");
    const accesoHeading = page.getByRole("heading", { name: /Acceso a obras/i });
    const hasAccesoUi = (await accesoHeading.count()) > 0;
    expect(deniedByRedirect || !hasAccesoUi).toBeTruthy();
  });
});
