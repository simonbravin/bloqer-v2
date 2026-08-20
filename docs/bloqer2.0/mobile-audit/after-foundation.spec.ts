import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { getEnv } from "../guides/capture/lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "../guides/capture/lib/auth";

const env = getEnv();
const OUT_DIR = path.resolve(__dirname, "after-foundation");

function shotPath(filename: string): string {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return path.join(OUT_DIR, filename);
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page.waitForTimeout(400);
}

async function gotoSafe(page: Page, route: string): Promise<void> {
  const res = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await settle(page);
  expect(res?.status() ?? 200).toBeLessThan(400);
}

async function capture(page: Page, filename: string, fullPage = false): Promise<void> {
  await settle(page);
  await page.screenshot({ path: shotPath(filename), fullPage, animations: "disabled" });
}

async function mainMetrics(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const sidebar = document.getElementById("app-shell-sidebar");
    const overlay = document.getElementById("app-shell-sidebar-overlay");
    return {
      mainWidth: main ? Math.round(main.getBoundingClientRect().width) : 0,
      sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
      overlayWidth: overlay ? Math.round(overlay.getBoundingClientRect().width) : 0,
      overlayVisible: Boolean(overlay && overlay.offsetParent !== null),
      dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
    };
  });
}

test.describe.configure({ mode: "serial" });

test.describe("Mobile Foundation after screenshots", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);

  test("390 shell, cards, field screens, uploader, gantt fallback", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await expect(page.getByLabel(/correo|email/i)).toBeVisible({ timeout: 30_000 });
    await login(page, env);

    await gotoSafe(page, "/dashboard");
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);

    let metrics = await mainMetrics(page);
    expect(metrics.dialogOpen).toBeFalsy();
    expect(metrics.mainWidth).toBeGreaterThan(300);
    await capture(page, "01-dashboard-390-sidebar-closed.png");

    await page.locator("#shell-sidebar-toggle").click();
    await page.waitForTimeout(400);
    metrics = await mainMetrics(page);
    expect(metrics.dialogOpen).toBeTruthy();
    expect(metrics.mainWidth).toBeGreaterThan(300);
    await capture(page, "02-dashboard-390-sidebar-overlay.png");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    metrics = await mainMetrics(page);
    expect(metrics.dialogOpen).toBeFalsy();

    await gotoSafe(page, "/proyectos");
    await expect(page.getByText("Tarjetas").first()).toBeVisible();
    await page.waitForTimeout(500);
    await capture(page, "03-proyectos-cards-390.png", true);

    const pid = env.projectId!;
    await gotoSafe(page, `/proyectos/${pid}/ordenes-compra`);
    await page.waitForTimeout(500);
    await capture(page, "04-ordenes-compra-cards-390.png", true);

    await gotoSafe(page, `/proyectos/${pid}/ordenes-compra/${env.poId}/recepciones/nueva`);
    await expect(page.getByText("Cantidad recibida").first()).toBeVisible();
    await capture(page, "05-recepcion-390.png", true);

    await gotoSafe(page, `/proyectos/${pid}/certificaciones/${env.certificationId}`);
    await capture(page, "06-certificacion-390.png", true);

    await gotoSafe(page, `/proyectos/${pid}`);
    await capture(page, "07-project-overview-390.png", true);

    await gotoSafe(page, `/proyectos/${pid}/documentos`);
    await page.evaluate(() => {
      document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
    });
    const trigger = page.getByTestId("document-upload-trigger");
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click({ force: true });
      await page.waitForTimeout(600);
      await page.evaluate(() => {
        document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
      });
      const dialog = page.getByRole("dialog");
      const opened = await dialog.isVisible().catch(() => false);
      if (opened) {
        await expect(dialog.getByRole("button", { name: /tomar foto/i })).toBeVisible();
        await expect(dialog.getByRole("button", { name: /elegir archivo/i })).toBeVisible();
      } else {
        await expect(page.getByRole("button", { name: /tomar foto/i }).first()).toBeVisible({
          timeout: 15_000,
        });
      }
      await capture(page, "08-uploader-390.png");
      await page.keyboard.press("Escape");
    }

    await gotoSafe(page, `/proyectos/${pid}/cronograma?view=gantt`);
    await expect(page.getByText("El Gantt está disponible en pantallas grandes.")).toBeVisible({
      timeout: 20_000,
    });
    await capture(page, "09-cronograma-mobile-390.png", true);
  });

  test("1440 desktop shell and OC table remain", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page, env);
    await gotoSafe(page, "/dashboard");
    await assertNotOnErrorPage(page);
    const metrics = await mainMetrics(page);
    expect(metrics.mainWidth).toBeGreaterThan(900);
    await capture(page, "10-dashboard-1440.png");

    const pid = env.projectId!;
    await gotoSafe(page, `/proyectos/${pid}/ordenes-compra`);
    await capture(page, "11-ordenes-compra-1440.png");

    await gotoSafe(page, `/proyectos/${pid}/cronograma?view=gantt`);
    await expect(page.getByText("El Gantt está disponible en pantallas grandes.")).toHaveCount(0);
    await capture(page, "12-gantt-1440.png");

    await page.setViewportSize({ width: 430, height: 932 });
    await gotoSafe(page, "/dashboard");
    const m430 = await mainMetrics(page);
    expect(m430.mainWidth).toBeGreaterThan(340);
    await capture(page, "13-dashboard-430.png");

    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoSafe(page, `/proyectos/${pid}/ordenes-compra`);
    await capture(page, "14-ordenes-compra-768.png");
  });

  test("uploader camera controls at 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId!;
    await gotoSafe(page, `/proyectos/${pid}/documentos`);
    const addBtn = page.getByRole("button", { name: /agregar documento/i });
    await expect(addBtn).toBeVisible();
    await addBtn.click();
    await page.waitForTimeout(800);
    await capture(page, "08-uploader-390.png");
    const camera = page.getByRole("button", { name: /tomar foto/i });
    if (await camera.isVisible().catch(() => false)) {
      await expect(page.getByRole("button", { name: /elegir archivo/i })).toBeVisible();
    }
  });
});
