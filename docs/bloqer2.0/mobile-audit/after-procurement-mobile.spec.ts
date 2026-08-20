import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { getEnv, loadDocsIds } from "../guides/capture/lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "../guides/capture/lib/auth";

const env = getEnv();
const docsIds = loadDocsIds() ?? {};
const OUT_DIR = path.resolve(__dirname, "after-procurement-mobile");
const FIXTURE_PNG = path.resolve(__dirname, "fixtures/jobsite-evidence.png");

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

async function capture(page: Page, filename: string, fullPage = true): Promise<void> {
  await settle(page);
  await page.screenshot({ path: shotPath(filename), fullPage, animations: "disabled" });
}

test.describe.configure({ mode: "serial" });

test.describe("Procurement Mobile after screenshots", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);

  test("390 procurement screens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    await gotoSafe(page, "/dashboard");
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);

    const pid = env.projectId!;
    await gotoSafe(page, `/proyectos/${pid}/solicitudes-compra`);
    await expect(page.getByRole("heading", { name: /solicitudes de compra/i })).toBeVisible({ timeout: 40_000 });
    await capture(page, "01-solicitudes-390.png");

    await gotoSafe(page, `/proyectos/${pid}/solicitudes-compra/nueva`);
    await expect(page.getByRole("heading", { name: /nueva solicitud/i })).toBeVisible();
    await capture(page, "02-nueva-solicitud-390.png");

    if (fs.existsSync(FIXTURE_PNG)) {
      await page.getByTestId("purchase-request-evidence-file").setInputFiles(FIXTURE_PNG);
      await expect(page.getByText(/Archivo 1/)).toBeVisible({ timeout: 8_000 });
      await page.getByText(/Archivo 1/).scrollIntoViewIfNeeded();
    }
    await capture(page, "03-solicitud-foto-390.png");

    const prId = docsIds.purchaseRequestId;
    if (prId) {
      await gotoSafe(page, `/proyectos/${pid}/solicitudes-compra/${prId}`);
      await capture(page, "04-solicitud-detalle-390.png");
    }

    const submittedPoId = env.submittedPoId ?? docsIds.submittedPoId ?? env.returnPoId;
    if (submittedPoId) {
      await gotoSafe(page, `/proyectos/${pid}/ordenes-compra/${submittedPoId}`);
      await capture(page, "05-oc-approval-390.png");
      await page.getByTestId("po-line-card").first().scrollIntoViewIfNeeded().catch(() => undefined);
      await capture(page, "06-oc-lines-390.png");
      const ret = page.getByTestId("po-return-button");
      if (await ret.isVisible().catch(() => false)) {
        await ret.click();
        await page.getByTestId("po-return-reason").waitFor({ timeout: 8_000 });
        await capture(page, "07-oc-return-390.png");
        await page.getByRole("button", { name: /^cancelar$/i }).click().catch(() => undefined);
      }
    }

    const confirmedPoId = env.poId ?? docsIds.confirmedPoId;
    if (confirmedPoId) {
      await gotoSafe(page, `/proyectos/${pid}/ordenes-compra/${confirmedPoId}/recepciones/nueva`);
      await capture(page, "08-recepcion-390.png");
      if (fs.existsSync(FIXTURE_PNG)) {
        const file = page.getByTestId("receipt-evidence-file");
        if (await file.count()) {
          await file.setInputFiles(FIXTURE_PNG);
          await expect(page.getByText(/Archivo 1/)).toBeVisible({ timeout: 8_000 });
        }
      }
      await capture(page, "09-recepcion-foto-390.png");
    }

    await gotoSafe(page, `/proyectos/${pid}/recepciones`);
    await capture(page, "10-recepcion-detalle-390.png");
  });

  test("430 / 768 / 1440 procurement", async ({ page }) => {
    await login(page, env);
    const pid = env.projectId!;
    const submittedPoId = env.submittedPoId ?? docsIds.submittedPoId ?? env.poId;

    await page.setViewportSize({ width: 430, height: 932 });
    await gotoSafe(page, `/proyectos/${pid}/solicitudes-compra`);
    await capture(page, "solicitudes-430.png");

    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoSafe(page, `/proyectos/${pid}/solicitudes-compra`);
    await capture(page, "solicitudes-768.png");
    if (submittedPoId) {
      await gotoSafe(page, `/proyectos/${pid}/ordenes-compra/${submittedPoId}`);
      await capture(page, "oc-768.png");
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoSafe(page, `/proyectos/${pid}/solicitudes-compra`);
    await capture(page, "11-procurement-desktop-1440.png");
  });
});
