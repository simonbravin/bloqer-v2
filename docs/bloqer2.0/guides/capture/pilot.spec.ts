import { test, expect } from "@playwright/test";
import { getEnv, loadManifest } from "./lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "./lib/auth";
import { stableScreenshot } from "./lib/capture";
import { discoverProjectId, discoverConfirmedPoId } from "./lib/discovery";

const env = getEnv();
const manifest = loadManifest();
const pilotSlugs = new Set([
  "login-email-google",
  "dashboard-menu-empresa",
  "alta-de-proyecto",
  "cronograma-gantt",
  "oc-confirmada-con-links",
]);
const bySlug = (slug: string) => manifest.captures.find((c) => c.slug === slug);

test.describe.configure({ mode: "serial" });

test.describe("Guide pilot captures — anonymous", () => {
  test("01 — Login (email + Google)", async ({ page }) => {
    const spec = bySlug("login-email-google");
    expect(spec).toBeTruthy();

    await page.goto("/login");
    await expect(page.getByLabel(/correo|email/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
    await stableScreenshot(page, spec!.filename);
  });
});

test.describe("Guide pilot captures — authenticated", () => {
  test.skip(!env.configured, "Requires DOCS/E2E/SEED user email + password env vars");

  test("02 — Dashboard / menú empresa", async ({ page }) => {
    const spec = bySlug("dashboard-menu-empresa");
    expect(spec).toBeTruthy();

    await login(page, env);
    await page.goto("/dashboard");
    await assertNotOnErrorPage(page);
    try {
      await assertDemoTenantSafe(page);
    } catch (e) {
      test.skip(true, e instanceof Error ? e.message : "Tenant demo requerido");
    }
    await expect(page.getByRole("navigation").or(page.locator("nav")).first()).toBeVisible({
      timeout: 20_000,
    });
    await stableScreenshot(page, spec!.filename);
  });

  test("19 — Alta de proyecto", async ({ page }) => {
    const spec = bySlug("alta-de-proyecto");
    expect(spec).toBeTruthy();

    await login(page, env);
    await page.goto("/proyectos/nuevo");
    await assertNotOnErrorPage(page);
    try {
      await assertDemoTenantSafe(page);
    } catch (e) {
      test.skip(true, e instanceof Error ? e.message : "Tenant demo requerido");
    }
    await expect(page.getByLabel(/código|codigo/i).or(page.getByText(/código/i)).first()).toBeVisible({
      timeout: 20_000,
    });
    await stableScreenshot(page, spec!.filename);
  });

  test("23 — Cronograma Gantt", async ({ page }) => {
    const spec = bySlug("cronograma-gantt");
    expect(spec).toBeTruthy();

    await login(page, env);
    const projectId = await discoverProjectId(page, env);
    test.skip(!projectId, "REQUIERE DATOS: no active project in demo tenant (set DOCS_PROJECT_ID)");

    await page.goto(`/proyectos/${projectId}/cronograma?view=gantt`);
    await assertNotOnErrorPage(page);
    try {
      await assertDemoTenantSafe(page);
    } catch (e) {
      test.skip(true, e instanceof Error ? e.message : "Tenant demo requerido");
    }
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    await stableScreenshot(page, spec!.filename);
  });

  test("27 — OC confirmada con links", async ({ page }) => {
    const spec = bySlug("oc-confirmada-con-links");
    expect(spec).toBeTruthy();

    await login(page, env);
    const projectId = await discoverProjectId(page, env);
    test.skip(!projectId, "REQUIERE DATOS: no active project (set DOCS_PROJECT_ID)");

    const poId = await discoverConfirmedPoId(page, projectId!, env);
    test.skip(
      !poId,
      "REQUIERE DATOS: no CONFIRMED purchase order (set DOCS_PO_ID or create demo OC)",
    );

    await page.goto(`/proyectos/${projectId}/ordenes-compra/${poId}`);
    await assertNotOnErrorPage(page);
    try {
      await assertDemoTenantSafe(page);
    } catch (e) {
      test.skip(true, e instanceof Error ? e.message : "Tenant demo requerido");
    }
    await expect(page.getByText(/confirmad/i).first()).toBeVisible({ timeout: 20_000 });
    await stableScreenshot(page, spec!.filename);
  });
});
