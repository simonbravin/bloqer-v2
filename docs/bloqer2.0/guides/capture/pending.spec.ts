import { test, expect } from "@playwright/test";
import { getEnv } from "./lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "./lib/auth";
import { stableScreenshot } from "./lib/capture";
import {
  expandBudgetApuForItem,
  fillManualInvoiceLetterB,
  openCloseReconciliationDialog,
  openNewSalesInvoiceDialog,
  reconciliationRoute,
  scrollToImportSection,
  selectUnmatchedStatementLine,
} from "./lib/interactions";

const env = getEnv();

test.describe("Pending guide captures", () => {
  test.beforeAll(() => {
    console.log(
      JSON.stringify({
        configured: env.configured,
        email: env.email,
        hasPassword: Boolean(env.password),
        projectId: env.projectId,
        budgetId: env.budgetId,
        accountId: env.accountId,
        reconciliationId: env.reconciliationId,
        reconciliationCloseReadyId: env.reconciliationCloseReadyId,
        certificationId: env.certificationId,
        salesInvoiceId: env.salesInvoiceId,
      }),
    );
  });

  test.skip(!env.configured, "Requires DOCS credentials");

  test("13 — Workspace de empareje", async ({ page }) => {
    test.skip(!env.reconciliationId, "missing reconciliationId");
    await login(page, env);
    await page.goto("/dashboard");
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);
    await page.goto(`/tesoreria/conciliacion/${env.reconciliationId}`);
    await assertNotOnErrorPage(page);
    await expect(page.getByRole("heading", { name: /^Conciliación$/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: /^Extracto \(/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: /Movimientos del sistema/i })).toBeVisible({
      timeout: 20_000,
    });
    await selectUnmatchedStatementLine(page);
    await stableScreenshot(page, "13-workspace-de-empareje-dos-columnas.png");
  });

  test("14 — Importar CSV / OFX", async ({ page }) => {
    test.skip(!env.reconciliationId, "missing reconciliationId");
    await login(page, env);
    await page.goto(`/tesoreria/conciliacion/${env.reconciliationId}`);
    await assertNotOnErrorPage(page);
    await scrollToImportSection(page);
    await stableScreenshot(page, "14-importar-csv-ofx.png");
  });

  test("15 — Cerrar conciliación", async ({ page }) => {
    const route = reconciliationRoute(env, true);
    test.skip(!route, "missing close-ready reconciliation");
    await login(page, env);
    await page.goto(route!);
    await assertNotOnErrorPage(page);
    await openCloseReconciliationDialog(page);
    await stableScreenshot(page, "15-cerrar-conciliacion.png");
  });

  test("16 — Ajuste manual de cuenta", async ({ page }) => {
    test.skip(!env.accountId, "missing accountId");
    await login(page, env);
    await page.goto(`/tesoreria/cuentas/${env.accountId}/ajuste`);
    await assertNotOnErrorPage(page);
    await expect(page.getByText(/Ajuste manual/i).first()).toBeVisible({ timeout: 20_000 });
    await stableScreenshot(page, "16-ajuste-manual-de-cuenta.png");
  });

  test("17 — Detalle cuenta CTA Ajuste", async ({ page }) => {
    test.skip(!env.accountId, "missing accountId");
    await login(page, env);
    await page.goto(`/tesoreria/cuentas/${env.accountId}`);
    await assertNotOnErrorPage(page);
    await expect(page.getByRole("link", { name: /Ajuste manual/i })).toBeVisible({ timeout: 20_000 });
    await stableScreenshot(page, "17-detalle-de-cuenta-con-cta-ajuste-manual.png");
  });

  test("29 — Certificación cliente APPROVED", async ({ page }) => {
    test.skip(!env.projectId || !env.certificationId, "missing cert");
    await login(page, env);
    await page.goto(`/proyectos/${env.projectId}/certificaciones/${env.certificationId}`);
    await assertNotOnErrorPage(page);
    await expect(page.getByText(/Aprobada|APPROVED/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /Crear borrador de factura/i })).toBeVisible({
      timeout: 10_000,
    });
    await stableScreenshot(page, "29-certificacion-cliente-approved.png");
  });

  test("30 — Factura letra B + precio c/IVA", async ({ page }) => {
    test.skip(!env.projectId, "missing project");
    await login(page, env);
    await openNewSalesInvoiceDialog(page, env.projectId!);
    await fillManualInvoiceLetterB(page);
    await stableScreenshot(page, "30-factura-con-letra-b-precio-c-iva.png");
  });

  test("31 — Factura emitida → CxC", async ({ page }) => {
    test.skip(!env.projectId || !env.salesInvoiceId, "missing invoice");
    await login(page, env);
    await page.goto(`/proyectos/${env.projectId}/facturas/${env.salesInvoiceId}`);
    await assertNotOnErrorPage(page);
    await expect(page.getByText(/Cuenta por cobrar/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /Registrar cobranza/i })).toBeVisible({
      timeout: 10_000,
    });
    await stableScreenshot(page, "31-factura-emitida-cxc-cobranza.png");
  });
});
