import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { getEnv, loadDocsIds } from "../guides/capture/lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "../guides/capture/lib/auth";

const env = getEnv();
const docsIds = loadDocsIds() ?? {};
const OUT_DIR = path.resolve(__dirname, "after-materials-field");

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

async function gotoMateriales(page: Page, projectId: string, query = "field=shortfall"): Promise<void> {
  await setViewportHintCookie(page);
  const res = await page.goto(`/proyectos/${projectId}/materiales?${query}`, {
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

test.describe.configure({ mode: "serial" });

test.describe("Materials Field", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);

  test("390 field list, week, search, detail and Pedir prefill", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    expect(pid).toBeTruthy();

    await gotoMateriales(page, pid!);
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);

    await expect(page.getByRole("heading", { name: "Materiales" })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("materials-toolbar")).toBeVisible();
    await expect(page.getByTestId("materials-toolbar").getByRole("link", { name: "EDT y costos" })).toBeVisible();
    await expect(
      page.getByTestId("materials-toolbar").getByRole("link", { name: "Solicitudes", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByTestId("materials-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("materials-desktop-view")).toHaveCount(0);
    await expect(page.getByTestId("materials-board-table")).toHaveCount(0);
    await expect(page.getByTestId("materials-field-chip-shortfall")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("materials-field-card").first()).toBeVisible();
    await capture(page, "01-materiales-faltantes-390.png");
    await capture(page, "03-material-card-390.png");

    const queryMs = await page.getByTestId("materials-field-view").getAttribute("data-query-ms");
    const source = await page.getByTestId("materials-field-view").getAttribute("data-materials-source");
    console.log(`materials field queryMs=${queryMs} source=${source}`);

    await page.getByTestId("materials-field-chip-week").click();
    await expect(page.getByTestId("materials-field-chip-week")).toHaveAttribute("aria-pressed", "true");
    await settle(page);
    await capture(page, "02-materiales-semana-390.png");

    await page.getByTestId("materials-field-chip-shortfall").click();
    await page.getByTestId("materials-field-search").fill("Hormigón");
    await expect(page.getByTestId("materials-field-card").filter({ hasText: "Hormigón" })).toBeVisible();
    await capture(page, "06-material-search-390.png");

    await page.getByTestId("materials-field-card").filter({ hasText: "Hormigón" }).getByTestId("materials-field-card-open").click();
    const sheet = page.getByTestId("materials-field-detail-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/EDT|01/i).first()).toBeVisible();
    await expect(sheet.getByText(/Necesario|Faltante/i).first()).toBeVisible();
    await capture(page, "04-material-detail-390.png");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 10_000 });

    const pedir = page.getByTestId("materials-field-pedir").first();
    await expect(pedir).toBeVisible();
    await pedir.click();
    await page.waitForURL(/\/solicitudes-compra\/nueva/, { timeout: 40_000 });
    await settle(page);
    await expect(page.getByRole("heading", { name: /nueva solicitud/i })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(/Prefill desde Materiales/i)).toBeVisible();
    await expect(page.locator("#description")).toHaveValue(/Hormigón/i);
    await expect(page.locator("#quantity")).not.toHaveValue("");
    await capture(page, "05-material-pedir-390.png");

    await gotoMateriales(page, pid!, "field=ordered");
    const linked = page.getByTestId("materials-field-card").filter({ hasText: "Caño PVC" });
    if (await linked.isVisible().catch(() => false)) {
      await expect(linked.getByTestId("materials-field-ver-solicitud")).toBeVisible();
      // Pedir stays if the existing SC only covers part of the need.
    }
  });

  test("VIEWER can read and has no Pedir", async ({ page }) => {
    test.skip(!env.fieldViewerEmail && !docsIds.fieldViewerEmail, "Requires viewer demo user");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, { ...env, email: env.fieldViewerEmail ?? docsIds.fieldViewerEmail! });
    const pid = env.projectId ?? docsIds.projectId;
    await gotoMateriales(page, pid!);
    await assertNotOnErrorPage(page);
    await expect(page.getByTestId("materials-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("materials-field-card").first()).toBeVisible();
    await expect(page.getByTestId("materials-field-pedir")).toHaveCount(0);
    await capture(page, "07-materiales-viewer-390.png");
  });

  test("430 / 768 field cards and 1440 desktop table", async ({ page }) => {
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;

    await page.setViewportSize({ width: 430, height: 932 });
    await gotoMateriales(page, pid!);
    await expect(page.getByTestId("materials-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("materials-desktop-view")).toHaveCount(0);
    await capture(page, "08-materiales-430.png");

    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoMateriales(page, pid!);
    await expect(page.getByTestId("materials-field-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("materials-board-table")).toHaveCount(0);
    await capture(page, "09-materiales-768.png");

    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoMateriales(page, pid!, "window=all");
    await expect(page.getByRole("heading", { name: /Materiales del proyecto/i })).toBeVisible({
      timeout: 40_000,
    });
    await expect(page.getByTestId("materials-desktop-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("materials-board-table")).toBeVisible();
    await expect(page.getByTestId("materials-field-view")).toHaveCount(0);
    await expect(page.getByTestId("materials-toolbar")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Operativo" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Varianza ($)" })).toBeVisible();
    await expect(page.getByTestId("materials-toolbar").getByRole("link", { name: "Tablero de compras" })).toBeVisible();
    await expect(
      page.getByTestId("materials-toolbar").getByRole("link", { name: "Solicitudes", exact: true }),
    ).toHaveCount(0);
    await capture(page, "10-materiales-desktop-1440.png");
  });
});
