import { createHash } from "crypto";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { DocsEnv } from "./env";
import { waitForAppReady } from "./auth";

export function docsInvitationRawToken(): string {
  const fromEnv = process.env.DOCS_INVITATION_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return createHash("sha256").update("bloqer-docs-guide-invite-token-v1", "utf8").digest("hex");
}

export async function openProjectNavSections(
  page: Page,
  sectionTitles: string[],
): Promise<void> {
  for (const title of sectionTitles) {
    const trigger = page.getByRole("button", { name: new RegExp(title, "i") }).first();
    if (await trigger.isVisible().catch(() => false)) {
      const expanded = await trigger.getAttribute("aria-expanded");
      if (expanded !== "true") {
        await trigger.click();
      }
    }
  }
  await waitForAppReady(page);
}

export async function expandBudgetWbsGroups(page: Page): Promise<void> {
  const expandButtons = page.getByRole("button", {
    name: /Expandir capítulo|Contraer capítulo/i,
  });
  const count = await expandButtons.count();
  for (let i = 0; i < count; i++) {
    const btn = expandButtons.nth(i);
    if ((await btn.getAttribute("aria-expanded")) !== "true") {
      await btn.click();
    }
  }
  await waitForAppReady(page);
}

export async function expandBudgetApuForItem(page: Page, itemCode = "01.01"): Promise<void> {
  await expandBudgetWbsGroups(page);
  const row = page.getByRole("row").filter({ hasText: itemCode }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const apuBtn = row.getByRole("button", { name: /Ver composición APU|Ocultar composición APU/i });
  if ((await apuBtn.getAttribute("aria-expanded")) !== "true") {
    await apuBtn.click();
  }
  await expect(page.getByLabel(/Insumo APU:/i).first()).toBeVisible({ timeout: 10_000 });
  await waitForAppReady(page);
}

export async function captureInvitationAcceptPage(page: Page): Promise<void> {
  const token = docsInvitationRawToken();
  await page.goto(`/invitaciones/aceptar?token=${encodeURIComponent(token)}`);
  await page.waitForURL((url) => !url.searchParams.has("token"), { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /Aceptar invitación|Invitación/i })).toBeVisible({
    timeout: 20_000,
  });
  await waitForAppReady(page);
}

export async function selectUnmatchedStatementLine(page: Page): Promise<void> {
  const debitLine = page
    .locator("li")
    .filter({ hasText: /Pago proveedor demo/i })
    .first();
  if (await debitLine.isVisible().catch(() => false)) {
    await debitLine.click();
    await waitForAppReady(page);
    return;
  }
  const anyLine = page.locator("li button").first();
  await anyLine.click();
  await waitForAppReady(page);
}

export async function scrollToImportSection(page: Page): Promise<void> {
  const heading = page.getByRole("heading", { name: /Importar CSV de extracto/i });
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeVisible({ timeout: 10_000 });
}

export async function openCloseReconciliationDialog(page: Page): Promise<void> {
  const closeBtn = page.getByRole("button", { name: /^Cerrar conciliación$/i });
  await expect(closeBtn).toBeEnabled({ timeout: 20_000 });
  await closeBtn.click();
  await expect(page.getByRole("alertdialog").getByText(/Cerrar conciliación/i)).toBeVisible({
    timeout: 10_000,
  });
}

export async function openNewSalesInvoiceDialog(page: Page, projectId: string): Promise<void> {
  await page.goto(`/proyectos/${projectId}/facturas?create=1`);
  await expect(page.getByRole("dialog").getByText(/Nueva factura emitida/i)).toBeVisible({
    timeout: 20_000,
  });
}

export async function fillManualInvoiceLetterB(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });

  // SearchableCombobox exposes role=combobox with placeholder text as content.
  const clientCombo = dialog.getByRole("combobox").filter({ hasText: /Seleccionar cliente/i });
  await clientCombo.click();
  const search = page.getByPlaceholder(/Buscar cliente/i);
  await expect(search).toBeVisible({ timeout: 10_000 });
  await search.fill("Cliente Demo");
  await page.getByRole("option", { name: /Cliente Demo/i }).first().click();

  await dialog.getByRole("combobox", { name: /Tipo de factura/i }).click();
  await page.getByRole("option", { name: /Factura B/i }).first().click();

  const pricesCheckbox = dialog.getByRole("checkbox", { name: /precio unitario incluye IVA/i });
  if (await pricesCheckbox.isVisible().catch(() => false)) {
    if (!(await pricesCheckbox.isChecked())) {
      await pricesCheckbox.check();
    }
  }

  await dialog.getByLabel(/^Descripción$/i).fill("Servicios demo guía operativa");
  await dialog.getByLabel(/^Cantidad$/i).fill("1");
  await dialog.locator("#unitPrice").fill("150000");
  await expect(dialog.getByRole("textbox", { name: /Precio unitario \(c\/IVA\)/i })).toBeVisible();
}

export async function waitForProjectShell(page: Page): Promise<void> {
  await expect(page.getByText(/DEMO-001|Obra Demo Norte/i).first()).toBeVisible({ timeout: 30_000 });
  await waitForAppReady(page);
}

export function reconciliationRoute(env: DocsEnv, closeReady = false): string | null {
  const id = closeReady
    ? env.reconciliationCloseReadyId || env.reconciliationId
    : env.reconciliationId;
  return id ? `/tesoreria/conciliacion/${id}` : null;
}
