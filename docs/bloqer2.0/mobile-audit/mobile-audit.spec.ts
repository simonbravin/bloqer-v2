import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { getEnv, loadDocsIds } from "../guides/capture/lib/env";
import {
  login,
  assertNotOnErrorPage,
  assertDemoTenantSafe,
  waitForAppReady,
} from "../guides/capture/lib/auth";
import { openProjectNavSections } from "../guides/capture/lib/interactions";

const env = getEnv();
const docsIds = loadDocsIds() ?? {};
const OUT_DIR = path.resolve(__dirname, "screenshots");
const METRICS_PATH = path.resolve(__dirname, "metrics.json");

type ViewportName = "390" | "430" | "768" | "1440";
const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
  "390": { width: 390, height: 844 },
  "430": { width: 430, height: 932 },
  "768": { width: 768, height: 1024 },
  "1440": { width: 1440, height: 1000 },
};

type LayoutMetrics = {
  filename: string;
  route: string;
  viewport: ViewportName;
  sidebarOpen: boolean;
  sidebarWidth: number;
  mainWidth: number;
  scrollWidth: number;
  clientWidth: number;
  overflowX: boolean;
  tableOverflowCount: number;
  dialogVisible: boolean;
  dialogHeight: number | null;
  smallTapTargets: number;
};

const metrics: LayoutMetrics[] = [];

function shotPath(filename: string): string {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return path.join(OUT_DIR, filename);
}

async function setVp(page: Page, name: ViewportName): Promise<void> {
  await page.setViewportSize(VIEWPORTS[name]);
}

async function setSidebar(page: Page, open: boolean): Promise<void> {
  await page.evaluate((next) => {
    try {
      localStorage.setItem("bloqer:sidebar-open", String(next));
      window.dispatchEvent(new Event("bloqer:sidebar-store-change"));
    } catch {
      /* ignore */
    }
  }, open);
  await page.waitForTimeout(250);
}

async function collectMetrics(page: Page, filename: string, route: string, viewport: ViewportName): Promise<LayoutMetrics> {
  const data = await page.evaluate(() => {
    const sidebar = document.getElementById("app-shell-sidebar");
    const sidebarWidth = sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0;
    const main = document.querySelector("main");
    const mainWidth = main ? Math.round(main.getBoundingClientRect().width) : 0;
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = document.documentElement.clientWidth;
    const tables = Array.from(document.querySelectorAll("table"));
    const tableOverflowCount = tables.filter((t) => {
      const parent = t.parentElement;
      if (!parent) return t.scrollWidth > t.clientWidth + 2;
      return t.scrollWidth > parent.clientWidth + 2;
    }).length;
    const dialog = document.querySelector('[role="dialog"]');
    const dialogVisible = Boolean(dialog && (dialog as HTMLElement).offsetParent !== null);
    const dialogHeight = dialog ? Math.round((dialog as HTMLElement).getBoundingClientRect().height) : null;
    const interactive = Array.from(
      document.querySelectorAll("button, a, [role='button'], input, select, textarea"),
    ) as HTMLElement[];
    const smallTapTargets = interactive.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      return r.width < 40 || r.height < 40;
    }).length;
    return {
      sidebarOpen: sidebarWidth > 40,
      sidebarWidth,
      mainWidth,
      scrollWidth,
      clientWidth,
      overflowX: scrollWidth > clientWidth + 2,
      tableOverflowCount,
      dialogVisible,
      dialogHeight,
      smallTapTargets,
    };
  });
  const row: LayoutMetrics = { filename, route, viewport, ...data };
  metrics.push(row);
  return row;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page.waitForTimeout(250);
}

function persistMetrics(): void {
  fs.writeFileSync(METRICS_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), metrics }, null, 2));
}

async function capture(
  page: Page,
  filename: string,
  route: string,
  viewport: ViewportName,
  options?: { fullPage?: boolean },
): Promise<void> {
  await settle(page);
  await collectMetrics(page, filename, route, viewport);
  await page.screenshot({
    path: shotPath(filename),
    fullPage: options?.fullPage ?? false,
    animations: "disabled",
  });
  persistMetrics();
}

async function gotoSafe(page: Page, route: string): Promise<boolean> {
  try {
    const res = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await settle(page);
    if (res && res.status() >= 400) return false;
    const body = await page.locator("body").innerText().catch(() => "");
    if (/^404$|página no encontrada|not found/i.test(body.slice(0, 400))) return false;
    return true;
  } catch {
    return false;
  }
}

test.describe.configure({ mode: "serial" });

test.describe("Mobile UX audit", () => {
  test.skip(!env.configured, "Requires DOCS/E2E/SEED user email + password env vars");
  test.skip(
    /bloqer\.app|vercel\.app/i.test(env.baseUrl),
    `Refuse production URL ${env.baseUrl}. Set DOCS_BASE_URL=http://localhost:3000`,
  );

  test("01 — login + shell + field routes at 390", async ({ page }) => {
    await setVp(page, "390");

    await page.goto("/login");
    await expect(page.getByLabel(/correo|email/i)).toBeVisible({ timeout: 30_000 });
    await capture(page, "01-login-390.png", "/login", "390");

    await login(page, env);
    await page.goto("/dashboard");
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);

    await setSidebar(page, true);
    await capture(page, "02-dashboard-sidebar-open-390.png", "/dashboard", "390");

    await setSidebar(page, false);
    await capture(page, "03-dashboard-390.png", "/dashboard", "390", { fullPage: true });

    const toggle = page.locator("#shell-sidebar-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await page.waitForTimeout(300);
    await capture(page, "04-dashboard-sidebar-toggled-390.png", "/dashboard", "390");
    await setSidebar(page, false);

    const pid = env.projectId!;
    expect(pid, "docs-demo-ids.json projectId required").toBeTruthy();

    const general: Array<[string, string]> = [
      ["/proyectos", "05-proyectos-390.png"],
      ["/directorio", "06-directorio-390.png"],
      ["/notificaciones", "07-notificaciones-390.png"],
    ];
    for (const [route, file] of general) {
      if (await gotoSafe(page, route)) await capture(page, file, route, "390", { fullPage: true });
    }

    const projectHome = `/proyectos/${pid}`;
    await gotoSafe(page, projectHome);
    await setSidebar(page, true);
    await openProjectNavSections(page, ["Planificación", "Operación", "Compras", "Finanzas"]);
    await capture(page, "08-project-menu-390.png", projectHome, "390");
    await setSidebar(page, false);
    await capture(page, "09-project-overview-390.png", projectHome, "390", { fullPage: true });

    const planning: Array<[string, string]> = [
      [`/proyectos/${pid}/presupuestos`, "10-presupuestos-390.png"],
      [`/proyectos/${pid}/presupuestos/${env.budgetId}`, "11-presupuesto-detalle-390.png"],
      [`/proyectos/${pid}/cronograma?view=gantt`, "12-cronograma-gantt-390.png"],
      [`/proyectos/${pid}/cronograma?view=kanban`, "13-cronograma-kanban-390.png"],
      [`/proyectos/${pid}/cronograma?view=table`, "14-cronograma-tabla-390.png"],
      [`/proyectos/${pid}/cronograma?view=calendar`, "15-cronograma-calendario-390.png"],
      [`/proyectos/${pid}/control-costos`, "16-control-costos-390.png"],
      [`/proyectos/${pid}/reportes`, "17-reportes-390.png"],
    ];
    for (const [route, file] of planning) {
      if (await gotoSafe(page, route)) await capture(page, file, route, "390", { fullPage: true });
    }

    const field: Array<[string, string]> = [
      [`/proyectos/${pid}/libro-obra`, "18-libro-obra-390.png"],
      [`/proyectos/${pid}/libro-obra/${env.jobsiteLogId}`, "20-parte-detalle-390.png"],
      [`/proyectos/${pid}/materiales`, "21-materiales-390.png"],
      [`/proyectos/${pid}/inventario`, "22-inventario-proyecto-390.png"],
      [`/proyectos/${pid}/consumos`, "23-consumos-390.png"],
      [`/proyectos/${pid}/documentos`, "25-documentos-390.png"],
    ];
    for (const [route, file] of field) {
      const ok = await gotoSafe(page, route);
      if (ok) await capture(page, file, route, "390", { fullPage: true });
    }

    if (await gotoSafe(page, `/proyectos/${pid}/libro-obra?create=1`)) {
      if (await page.getByRole("dialog").isVisible({ timeout: 20_000 }).catch(() => false)) {
        await capture(page, "19-libro-obra-nuevo-dialog-390.png", `/proyectos/${pid}/libro-obra?create=1`, "390");
        await page.keyboard.press("Escape");
      }
    }

    if (await gotoSafe(page, `/proyectos/${pid}/consumos?create=1`)) {
      if (await page.getByRole("dialog").isVisible({ timeout: 20_000 }).catch(() => false)) {
        await capture(page, "24-consumo-nuevo-dialog-390.png", `/proyectos/${pid}/consumos?create=1`, "390");
        await page.keyboard.press("Escape");
      }
    }
  });

  test("02 — procurement + finance + config at 390", async ({ page }) => {
    await setVp(page, "390");
    await login(page, env);
    await page.goto("/dashboard");
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);
    await setSidebar(page, false);

    const pid = env.projectId!;
    const poId = env.poId!;

    const proc: Array<[string, string]> = [
      [`/proyectos/${pid}/compras`, "26-compras-hub-390.png"],
      [`/proyectos/${pid}/solicitudes-compra`, "27-solicitudes-compra-390.png"],
      [`/proyectos/${pid}/ordenes-compra`, "29-ordenes-compra-390.png"],
      [`/proyectos/${pid}/ordenes-compra?view=cards`, "30-ordenes-compra-cards-390.png"],
      [`/proyectos/${pid}/ordenes-compra/${poId}`, "32-oc-detalle-390.png"],
      [`/proyectos/${pid}/ordenes-compra/${poId}/recepciones/nueva`, "35-recepcion-nueva-390.png"],
      [`/proyectos/${pid}/recepciones`, "34-recepciones-390.png"],
      [`/proyectos/${pid}/subcontratos`, "36-subcontratos-390.png"],
      [`/proyectos/${pid}/subcontratos/${env.subcontractId}`, "37-subcontrato-detalle-390.png"],
      [
        `/proyectos/${pid}/subcontratos/${env.subcontractId}/certificaciones/${env.subcontractCertificationId}`,
        "38-cert-subcontrato-390.png",
      ],
      [`/proyectos/${pid}/certificaciones`, "39-certificaciones-390.png"],
      [`/proyectos/${pid}/certificaciones/${env.certificationId}`, "41-certificacion-detalle-390.png"],
      [`/proyectos/${pid}/finanzas`, "42-finanzas-proyecto-390.png"],
      [`/proyectos/${pid}/flujo-caja`, "43-flujo-caja-390.png"],
      [`/proyectos/${pid}/facturas-proveedor`, "44-facturas-proveedor-390.png"],
      [`/proyectos/${pid}/facturas`, "45-facturas-venta-390.png"],
      [`/proyectos/${pid}/cuentas-por-pagar`, "46-cxp-proyecto-390.png"],
      [`/proyectos/${pid}/cuentas-por-cobrar`, "47-cxc-proyecto-390.png"],
      [`/proyectos/${pid}/cuentas-por-cobrar/${docsIds.receivableId}/cobrar`, "48-cobrar-390.png"],
    ];
    for (const [route, file] of proc) {
      const ok = await gotoSafe(page, route);
      if (ok) await capture(page, file, route, "390", { fullPage: true });
    }

    if (await gotoSafe(page, `/proyectos/${pid}/solicitudes-compra?create=1`)) {
      if (await page.getByRole("dialog").isVisible({ timeout: 20_000 }).catch(() => false)) {
        await capture(page, "28-solicitud-nueva-dialog-390.png", `/proyectos/${pid}/solicitudes-compra?create=1`, "390");
        const wbs = page.getByRole("combobox").or(page.getByRole("button", { name: /partida|EDT|elegir/i })).first();
        if (await wbs.isVisible().catch(() => false)) {
          await wbs.click();
          await page.waitForTimeout(400);
          await capture(page, "28b-solicitud-edt-combobox-390.png", `/proyectos/${pid}/solicitudes-compra?create=1`, "390");
          await page.keyboard.press("Escape");
        }
        await page.keyboard.press("Escape");
      }
    }

    if (await gotoSafe(page, `/proyectos/${pid}/ordenes-compra?create=1`)) {
      if (await page.getByRole("dialog").isVisible().catch(() => false)) {
        await capture(page, "31-oc-nueva-dialog-390.png", `/proyectos/${pid}/ordenes-compra?create=1`, "390");
        await page.keyboard.press("Escape");
      }
    }

    if (await gotoSafe(page, `/proyectos/${pid}/certificaciones?create=1`)) {
      if (await page.getByRole("dialog").isVisible().catch(() => false)) {
        await capture(page, "40-certificacion-nueva-dialog-390.png", `/proyectos/${pid}/certificaciones?create=1`, "390");
        await page.keyboard.press("Escape");
      }
    }

    if (await gotoSafe(page, `/proyectos/${pid}/documentos`)) {
      const attach = page.getByRole("button", { name: /adjuntar/i }).first();
      if (await attach.isVisible().catch(() => false)) {
        await attach.click();
        if (await page.getByRole("dialog").isVisible({ timeout: 10_000 }).catch(() => false)) {
          await capture(page, "25b-documentos-upload-dialog-390.png", `/proyectos/${pid}/documentos`, "390");
          await page.keyboard.press("Escape");
        }
      }
    }

    const corp: Array<[string, string]> = [
      ["/finanzas", "49-finanzas-corp-390.png"],
      ["/finanzas/transacciones", "50-transacciones-390.png"],
      ["/finanzas/cuentas-por-pagar", "51-cxp-corp-390.png"],
      ["/finanzas/cuentas-por-cobrar", "52-cxc-corp-390.png"],
      ["/tesoreria", "53-tesoreria-390.png"],
      ["/tesoreria/cuentas", "54-tesoreria-cuentas-390.png"],
      ["/tesoreria/movimientos", "55-tesoreria-movimientos-390.png"],
      ["/tesoreria/transferencias", "56-tesoreria-transferencias-390.png"],
      ["/tesoreria/conciliacion", "57-conciliacion-390.png"],
      ["/configuracion", "58-config-empresa-390.png"],
      ["/configuracion/equipo", "59-config-equipo-390.png"],
      ["/configuracion/permisos", "60-config-permisos-390.png"],
      ["/configuracion/politicas", "61-config-compras-390.png"],
      ["/contabilidad", "62-contabilidad-390.png"],
    ];
    for (const [route, file] of corp) {
      if (await gotoSafe(page, route)) await capture(page, file, route, "390", { fullPage: true });
    }

    if (await gotoSafe(page, "/finanzas/transacciones?register=ap")) {
      if (await page.getByRole("dialog").isVisible().catch(() => false)) {
        await capture(page, "50b-transaccion-nueva-dialog-390.png", "/finanzas/transacciones?register=ap", "390");
        await page.keyboard.press("Escape");
      }
    }

    if (env.reconciliationId) {
      const recRoute = `/tesoreria/conciliacion/${env.reconciliationId}`;
      if (await gotoSafe(page, recRoute)) {
        await capture(page, "57b-conciliacion-workspace-390.png", recRoute, "390", { fullPage: true });
      }
    }
  });

  test("03 — 430 / 768 / 1440 comparisons", async ({ page }) => {
    await login(page, env);
    await page.goto("/dashboard");
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);

    const pid = env.projectId!;
    const poId = env.poId!;

    await setVp(page, "430");
    await setSidebar(page, false);
    for (const [route, file] of [
      ["/dashboard", "63-dashboard-430.png"],
      [`/proyectos/${pid}/libro-obra`, "64-libro-obra-430.png"],
      [`/proyectos/${pid}/ordenes-compra`, "65-ordenes-compra-430.png"],
      [`/proyectos/${pid}/materiales`, "66-materiales-430.png"],
    ] as Array<[string, string]>) {
      if (await gotoSafe(page, route)) await capture(page, file, route, "430", { fullPage: true });
    }

    await setVp(page, "768");
    await setSidebar(page, true);
    for (const [route, file] of [
      ["/dashboard", "67-dashboard-sidebar-open-768.png"],
      [`/proyectos/${pid}/cronograma?view=gantt`, "68-gantt-768.png"],
      [`/proyectos/${pid}/ordenes-compra`, "69-ordenes-compra-768.png"],
    ] as Array<[string, string]>) {
      if (await gotoSafe(page, route)) await capture(page, file, route, "768", { fullPage: true });
    }
    await setSidebar(page, false);
    if (await gotoSafe(page, `/proyectos/${pid}`)) {
      await capture(page, "70-project-overview-768.png", `/proyectos/${pid}`, "768", { fullPage: true });
    }

    await setVp(page, "1440");
    await setSidebar(page, true);
    for (const [route, file] of [
      ["/dashboard", "71-dashboard-1440.png"],
      [`/proyectos/${pid}/ordenes-compra`, "purchase-orders-1440.png"],
      [`/proyectos/${pid}/ordenes-compra/${poId}`, "72-oc-detalle-1440.png"],
      [`/proyectos/${pid}/cronograma?view=gantt`, "73-gantt-1440.png"],
      [`/proyectos/${pid}/libro-obra`, "74-libro-obra-1440.png"],
      [`/proyectos/${pid}/materiales`, "75-materiales-1440.png"],
      [`/proyectos/${pid}/presupuestos/${env.budgetId}`, "76-presupuesto-1440.png"],
      ["/tesoreria/conciliacion", "77-conciliacion-1440.png"],
    ] as Array<[string, string]>) {
      if (await gotoSafe(page, route)) await capture(page, file, route, "1440");
    }

    fs.writeFileSync(METRICS_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), metrics }, null, 2));
  });

  test("04 — remaining 390 dialogs, tesoreria, config", async ({ page }) => {
    await setVp(page, "390");
    await login(page, env);
    await page.goto("/dashboard");
    await assertNotOnErrorPage(page);
    await assertDemoTenantSafe(page);
    await setSidebar(page, false);

    const pid = env.projectId!;

    const rest: Array<[string, string]> = [
      ["/tesoreria", "53-tesoreria-390.png"],
      ["/tesoreria/cuentas", "54-tesoreria-cuentas-390.png"],
      ["/tesoreria/movimientos", "55-tesoreria-movimientos-390.png"],
      ["/tesoreria/transferencias", "56-tesoreria-transferencias-390.png"],
      ["/tesoreria/conciliacion", "57-conciliacion-390.png"],
      ["/configuracion", "58-config-empresa-390.png"],
      ["/configuracion/equipo", "59-config-equipo-390.png"],
      ["/configuracion/permisos", "60-config-permisos-390.png"],
      ["/configuracion/politicas", "61-config-compras-390.png"],
      ["/contabilidad", "62-contabilidad-390.png"],
    ];
    for (const [route, file] of rest) {
      if (await gotoSafe(page, route)) await capture(page, file, route, "390", { fullPage: true });
    }

    if (await gotoSafe(page, `/proyectos/${pid}/libro-obra?create=1`)) {
      if (await page.getByRole("dialog").isVisible({ timeout: 15_000 }).catch(() => false)) {
        await capture(page, "19-libro-obra-nuevo-dialog-390.png", `/proyectos/${pid}/libro-obra?create=1`, "390");
        await page.keyboard.press("Escape");
      }
    }
    if (await gotoSafe(page, `/proyectos/${pid}/solicitudes-compra?create=1`)) {
      if (await page.getByRole("dialog").isVisible({ timeout: 15_000 }).catch(() => false)) {
        await capture(page, "28-solicitud-nueva-dialog-390.png", `/proyectos/${pid}/solicitudes-compra?create=1`, "390");
        await page.keyboard.press("Escape");
      }
    }
    if (await gotoSafe(page, `/proyectos/${pid}/consumos?create=1`)) {
      if (await page.getByRole("dialog").isVisible({ timeout: 15_000 }).catch(() => false)) {
        await capture(page, "24-consumo-nuevo-dialog-390.png", `/proyectos/${pid}/consumos?create=1`, "390");
        await page.keyboard.press("Escape");
      }
    }
    persistMetrics();
  });
});
