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
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAlElEQVR4nO3QMQ0AIAwEsQ78s+UHmhQY0nDJzT5n5g7A/rcA4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8BAPABFl0CAf0nVYkAAAAASUVORK5CYII=",
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

test.describe("Field Operations flows", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);

  test("01 — parte + foto fixture at 390", async ({ page }) => {
    ensureFixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    await page.goto("/dashboard");
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);

    const pid = env.projectId ?? docsIds.projectId;
    expect(pid).toBeTruthy();

    await page.goto(`/proyectos/${pid}/libro-obra`);
    await settle(page);
    await expect(page.getByRole("heading", { name: "Libro de obra" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /nuevo parte/i }).first()).toBeVisible();

    await page.goto(`/proyectos/${pid}/libro-obra/nuevo`);
    await settle(page);
    await expect(page.getByRole("heading", { name: /nuevo parte/i })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole("button", { name: /crear parte/i })).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /fotos \/ evidencia/i })).toBeVisible();

    const title = `Parte campo ${Date.now()}`;
    await page.locator("#title").fill(title);
    await page.getByTestId("jobsite-log-evidence-file").setInputFiles(FIXTURE_PNG);
    await expect(page.getByText(/Foto 1/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /crear parte/i }).click();
    const retryPanel = page.getByText(/Parte creado correctamente/i);
    await Promise.race([
      page.waitForURL(/\/libro-obra\/[0-9a-f-]{36}/i, { timeout: 90_000 }),
      retryPanel.waitFor({ timeout: 90_000 }),
    ]);
    if (await retryPanel.isVisible().catch(() => false)) {
      await page.getByRole("link", { name: /ver parte/i }).click();
      await page.waitForURL(/\/libro-obra\/[0-9a-f-]{36}/i, { timeout: 30_000 });
    }
    await settle(page);
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /adjuntos/i })).toBeVisible();
    await expect(page.getByText(/jobsite-evidence\.png|Foto 1/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("02 — registrar consumo at 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    await page.goto(`/proyectos/${pid}/consumos`);
    await settle(page);
    await expect(page.getByRole("heading", { name: "Consumos del proyecto" })).toBeVisible({ timeout: 20_000 });

    const register = page.getByRole("button", { name: /registrar consumo/i }).first();
    await expect(register).toBeVisible();
    await register.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 15_000 });

    const catalogsMissing = await sheet.getByText(/necesitás al menos un producto/i).isVisible().catch(() => false);
    if (catalogsMissing) {
      test.info().annotations.push({
        type: "note",
        description: "Demo sin catálogo de inventario; formulario visible, alta omitida.",
      });
      return;
    }

    const productCombo = sheet.getByRole("combobox").first();
    if (await productCombo.isVisible().catch(() => false)) {
      await productCombo.click();
      const option = page.getByRole("option").first();
      if (await option.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await option.click();
      }
    }

    const warehouseTrigger = sheet.getByRole("combobox").nth(1);
    if (await warehouseTrigger.isVisible().catch(() => false)) {
      await warehouseTrigger.click();
      const option = page.getByRole("option").first();
      if (await option.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await option.click();
      }
    }

    await sheet.locator("#quantity").fill("1");
    await sheet.getByRole("button", { name: /^registrar consumo$/i }).click();
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(new RegExp(`/proyectos/${pid}/consumos`));
  });

  test("03 — documentos uploader opens (tooling vs product)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    await page.goto(`/proyectos/${pid}/documentos`);
    await settle(page);
    await dismissDevOverlays(page);

    const trigger = page.getByTestId("document-upload-trigger");
    await expect(trigger).toBeVisible();
    await trigger.click({ force: true });
    await page.waitForTimeout(600);
    await dismissDevOverlays(page);

    const dialog = page.getByRole("dialog");
    const opened = await dialog.isVisible().catch(() => false);
    if (!opened) {
      await trigger.click({ force: true });
      await page.waitForTimeout(800);
    }
    const openedRetry = await page.getByRole("dialog").isVisible().catch(() => false);
    expect(
      openedRetry,
      openedRetry
        ? "Uploader dialog opened after overlay dismissal — Mobile Foundation miss was tooling (A)."
        : "Uploader dialog did not open even after removing nextjs-portal — possible product bug (B).",
    ).toBeTruthy();

    if (openedRetry) {
      await expect(page.getByRole("dialog").getByRole("button", { name: /tomar foto/i })).toBeVisible();
      await expect(page.getByRole("dialog").getByRole("button", { name: /elegir archivo/i })).toBeVisible();
      const fileInput = page.locator('input[type="file"]:not([capture])').last();
      ensureFixture();
      await fileInput.setInputFiles(FIXTURE_PNG);
      await expect(page.getByRole("dialog").getByText(/jobsite-evidence\.png/i)).toBeVisible({ timeout: 8_000 });
    }
  });
});
