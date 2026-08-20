import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { getEnv, loadDocsIds } from "../guides/capture/lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "../guides/capture/lib/auth";
import {
  FIELD_EVIDENCE_PNG,
  replaySameEvidenceAndAssertSingleDocument,
} from "./lib/replay-field-evidence";

const env = getEnv();
const docsIds = loadDocsIds() ?? {};
const FIXTURE_DIR = path.resolve(__dirname, "fixtures");
const FIXTURE_PNG = path.join(FIXTURE_DIR, "jobsite-evidence.png");
const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

test.describe.configure({ mode: "default" });

function ensureFixture(): void {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(FIXTURE_PNG, FIELD_EVIDENCE_PNG);
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

function entityIdFromUrl(page: Page, kind: "libro-obra" | "solicitudes-compra" | "recepciones"): string {
  const match = page.url().match(new RegExp(`/${kind}/([0-9a-f-]{36})`, "i"));
  if (!match?.[1]) throw new Error(`No se pudo leer el id de ${kind} desde ${page.url()}`);
  return match[1];
}

test.describe("Field evidence idempotency", () => {
  test.skip(!env.configured, "Requires demo capture credentials");
  test.skip(/bloqer\.app|vercel\.app/i.test(env.baseUrl), `Refuse production URL ${env.baseUrl}`);
  test.skip(!hasDatabase, "Requires DATABASE_URL to verify Document rows");

  test("parte diario — foto + retry misma evidencia = 1 Document", async ({ page }) => {
    ensureFixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    await page.goto("/dashboard");
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);

    const pid = env.projectId ?? docsIds.projectId;
    expect(pid).toBeTruthy();

    await page.goto(`/proyectos/${pid}/libro-obra/nuevo`);
    await settle(page);
    const title = `Parte evidencia ${Date.now()}`;
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
    await expect(page.getByRole("heading", { name: /adjuntos/i })).toBeVisible();
    await expect(page.getByText(/jobsite-evidence\.png|Foto 1/i).first()).toBeVisible({ timeout: 20_000 });

    const logId = entityIdFromUrl(page, "libro-obra");
    const result = await replaySameEvidenceAndAssertSingleDocument({
      entityType: "JOBSITE_LOG",
      entityId: logId,
      projectId: pid!,
    });
    expect(result.documentId).toBeTruthy();
  });

  test("solicitud de compra — foto + retry = 1 Document", async ({ page }) => {
    ensureFixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    expect(pid).toBeTruthy();

    await page.goto(`/proyectos/${pid}/solicitudes-compra/nueva`);
    await settle(page);
    await page.locator("#pr-wbs").click();
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();
    const desc = `Cemento evidencia ${Date.now()}`;
    await page.locator("#description").fill(desc);
    await page.locator("#quantity").fill("1");
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
    await expect(page.getByText(/jobsite-evidence\.png|Archivo 1/i).first()).toBeVisible({ timeout: 20_000 });

    const prId = entityIdFromUrl(page, "solicitudes-compra");
    await replaySameEvidenceAndAssertSingleDocument({
      entityType: "PURCHASE_REQUEST",
      entityId: prId,
      projectId: pid!,
    });
  });

  test("recepción — foto + retry = 1 Document", async ({ page }) => {
    ensureFixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, env);
    const pid = env.projectId ?? docsIds.projectId;
    const poId = env.poId ?? docsIds.confirmedPoId;
    expect(pid).toBeTruthy();
    expect(poId).toBeTruthy();

    await page.goto(`/proyectos/${pid}/ordenes-compra/${poId}`);
    await settle(page);
    const register = page.getByTestId("po-register-receipt");
    if (!(await register.isVisible().catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Sin botón de recepción; no hay pendiente en la OC demo.",
      });
      return;
    }
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
    await expect(page.getByText(/jobsite-evidence\.png|Archivo 1/i).first()).toBeVisible({ timeout: 20_000 });

    const receiptId = entityIdFromUrl(page, "recepciones");
    await replaySameEvidenceAndAssertSingleDocument({
      entityType: "PURCHASE_RECEIPT",
      entityId: receiptId,
      projectId: pid!,
    });
  });
});
