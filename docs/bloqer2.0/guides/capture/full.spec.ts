import { test, expect } from "@playwright/test";
import { getEnv, loadManifest } from "./lib/env";
import { login, assertNotOnErrorPage, assertDemoTenantSafe } from "./lib/auth";
import { stableScreenshot } from "./lib/capture";
import {
  captureInvitationAcceptPage,
  expandBudgetApuForItem,
  expandBudgetWbsGroups,
  fillManualInvoiceLetterB,
  openCloseReconciliationDialog,
  openNewSalesInvoiceDialog,
  openProjectNavSections,
  reconciliationRoute,
  scrollToImportSection,
  selectUnmatchedStatementLine,
  waitForProjectShell,
} from "./lib/interactions";

const env = getEnv();
const manifest = loadManifest();

function resolveRoute(template: string | null, envVars: ReturnType<typeof getEnv>): string | null {
  if (!template) return null;
  let route = template.trim();
  if (/^cualquier pantalla autenticada/i.test(route)) return "/dashboard";
  if (/directorio/i.test(route) && !route.startsWith("/")) return "/directorio";
  if (/^detalle de sesión$|^detalle$/i.test(route)) {
    return reconciliationRoute(envVars, false);
  }
  if (/cualquier.*proyectos\/\[id\]/i.test(route)) {
    return envVars.projectId ? `/proyectos/${envVars.projectId}/materiales` : null;
  }
  if (/\/facturas` \(alta\)|\/facturas.*alta/i.test(route)) {
    return envVars.projectId ? `/proyectos/${envVars.projectId}/facturas?create=1` : null;
  }

  const projectId = envVars.projectId;
  const poId = envVars.poId;
  const budgetId = envVars.budgetId;
  const accountId = envVars.accountId;
  const reconciliationId = envVars.reconciliationId;
  const certificationId = envVars.certificationId;
  const salesInvoiceId = envVars.salesInvoiceId;
  const jobsiteLogId = envVars.jobsiteLogId;
  const subcontractId = envVars.subcontractId;
  const subcontractCertificationId = envVars.subcontractCertificationId;

  if (/\[id\]|\[projectId\]|proyectos\/\[\.\.\.\]/.test(route) && !projectId && route.startsWith("/proyectos/"))
    return null;
  if (/\[poId\]/.test(route) && !poId) return null;
  if (/\[budgetId\]/.test(route) && !budgetId) return null;
  if (/\[accountId\]/.test(route) && !accountId) return null;
  if (/\[reconciliationId\]/.test(route) && !reconciliationId) return null;
  if (/\/platform\//.test(route)) return null;

  route = route.replace(/\[`([^`]+)`\]/g, "$1").replace(/`/g, "");

  if (route.includes("/tesoreria/conciliacion/") && /\[id\]/.test(route)) {
    if (!reconciliationId) return null;
    route = route.replace(/\[id\]/g, reconciliationId);
  }

  if (projectId && route.startsWith("/proyectos/")) {
    const certId = route.includes("/subcontratos/")
      ? subcontractCertificationId || "00000000-0000-4000-8000-000000009998"
      : certificationId || "00000000-0000-4000-8000-000000009998";
    route = route
      .replace(/\[projectId\]/g, projectId)
      .replace(/\[id\]/g, projectId)
      .replace(/\[subId\]/g, subcontractId || "00000000-0000-4000-8000-000000009999")
      .replace(/\[certId\]/g, certId)
      .replace(/\[logId\]/g, jobsiteLogId || "00000000-0000-4000-8000-000000009997")
      .replace(/\[invoiceId\]/g, salesInvoiceId || "00000000-0000-4000-8000-000000009996")
      .replace(/\[supplierInvoiceId\]/g, "00000000-0000-4000-8000-000000009995");
  }
  if (poId) route = route.replace(/\[poId\]/g, poId);
  if (budgetId) route = route.replace(/\[budgetId\]/g, budgetId);
  if (accountId) route = route.replace(/\[accountId\]/g, accountId);
  if (reconciliationId) route = route.replace(/\[reconciliationId\]/g, reconciliationId);

  if (/\[[a-zA-Z]+\]/.test(route)) return null;
  if (!route.startsWith("/")) return null;
  return route;
}

async function runCapture(
  page: import("@playwright/test").Page,
  capture: { slug?: string; id: string; filename: string },
  route: string,
): Promise<void> {
  const slug = capture.slug || "";

  if (slug === "aceptar-invitacion") {
    await captureInvitationAcceptPage(page);
    await stableScreenshot(page, capture.filename);
    return;
  }

  if (route === "/login") {
    await page.goto(route);
  } else {
    await login(page, env);
    await page.goto("/dashboard");
    try {
      await assertNotOnErrorPage(page);
      await assertDemoTenantSafe(page);
    } catch (e) {
      test.skip(true, e instanceof Error ? e.message : "Tenant demo requerido");
    }
    if (route !== "/dashboard") {
      await page.goto(route);
      await assertNotOnErrorPage(page);
    }
  }

  switch (slug) {
    case "menu-del-proyecto-compras-operacion":
      await waitForProjectShell(page);
      await openProjectNavSections(page, ["Compras", "Operación"]);
      break;
    case "edt-con-insumos-expandibles":
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
      await expandBudgetApuForItem(page, "01.01");
      break;
    case "presupuesto-aprobado-edt":
      await expect(page.getByText(/Aprobado|APPROVED/i).first()).toBeVisible({ timeout: 20_000 });
      await expandBudgetWbsGroups(page);
      break;
    case "workspace-de-empareje-dos-columnas":
      await expect(page.getByRole("heading", { name: /^Extracto \(/i })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("heading", { name: /Movimientos del sistema/i })).toBeVisible({
        timeout: 20_000,
      });
      await selectUnmatchedStatementLine(page);
      break;
    case "importar-csv-ofx":
      await scrollToImportSection(page);
      break;
    case "cerrar-conciliacion": {
      const closeRoute = reconciliationRoute(env, true);
      if (closeRoute && closeRoute !== route) {
        await page.goto(closeRoute);
        await assertNotOnErrorPage(page);
      }
      await openCloseReconciliationDialog(page);
      break;
    }
    case "detalle-de-cuenta-con-cta-ajuste-manual":
      await expect(page.getByRole("link", { name: /Ajuste manual/i })).toBeVisible({ timeout: 20_000 });
      break;
    case "ajuste-manual-de-cuenta":
      await expect(page.getByText(/Ajuste manual/i).first()).toBeVisible({ timeout: 20_000 });
      break;
    case "certificacion-cliente-approved":
      await expect(page.getByText(/Aprobada|APPROVED/i).first()).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole("link", { name: /Crear borrador de factura/i }),
      ).toBeVisible({ timeout: 10_000 });
      break;
    case "cert-subcontrato-con-factura":
      await expect(page.getByText(/Revisar y emitir factura/i)).toBeVisible({ timeout: 20_000 });
      break;
    case "factura-con-letra-b-precio-c-iva":
      if (env.projectId) {
        await openNewSalesInvoiceDialog(page, env.projectId);
        await fillManualInvoiceLetterB(page);
      }
      break;
    case "factura-emitida-cxc-cobranza":
      await expect(page.getByText(/Cuenta por cobrar/i)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("link", { name: /Registrar cobranza/i })).toBeVisible({
        timeout: 10_000,
      });
      break;
    default:
      break;
  }

  await stableScreenshot(page, capture.filename);
}

test.describe("Guide full captures", () => {
  test.skip(!env.configured, "Requires DOCS credentials");

  for (const capture of manifest.captures) {
    if (capture.pilot) continue;
    if ((capture as { internalOnly?: boolean }).internalOnly) continue;
    if ((capture as { applied?: boolean }).applied) continue;

    test(`${capture.id} — ${capture.title}`, async ({ page }) => {
      const route = resolveRoute(
        (capture as { routeTemplate?: string | null }).routeTemplate ||
          (capture as { route?: string | null }).route ||
          null,
        env,
      );

      test.skip(!route && capture.slug !== "aceptar-invitacion", "REQUIERE DATOS o ruta no resoluble");

      if (capture.slug === "aceptar-invitacion") {
        await runCapture(page, capture, "/invitaciones/aceptar");
        return;
      }

      await runCapture(page, capture, route!);
    });
  }
});
