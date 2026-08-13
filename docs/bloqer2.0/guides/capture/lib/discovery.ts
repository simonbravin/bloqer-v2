import type { Page } from "@playwright/test";
import type { DocsEnv } from "./env";
import { assertNotOnErrorPage } from "./auth";

const PROJECT_LINK = 'a[href^="/proyectos/"]:not([href="/proyectos/nuevo"]):not([href^="/proyectos/nuevo"])';
const PO_LINK = 'a[href*="/ordenes-compra/"]';

export async function discoverProjectId(page: Page, env: DocsEnv): Promise<string | null> {
  if (env.projectId) return env.projectId;

  await page.goto("/proyectos");
  await assertNotOnErrorPage(page);

  const href = await page.locator(PROJECT_LINK).first().getAttribute("href").catch(() => null);
  if (!href) return null;
  const m = href.match(/^\/proyectos\/([^/]+)/);
  return m?.[1] ?? null;
}

export async function discoverConfirmedPoId(
  page: Page,
  projectId: string,
  env: DocsEnv,
): Promise<string | null> {
  if (env.poId) return env.poId;

  await page.goto(`/proyectos/${projectId}/ordenes-compra?status=CONFIRMED`);
  await assertNotOnErrorPage(page);

  const href = await page.locator(PO_LINK).first().getAttribute("href").catch(() => null);
  if (!href) return null;
  const m = href.match(/\/ordenes-compra\/([^/?#]+)/);
  return m?.[1] ?? null;
}

export async function discoverApprovedBudgetId(page: Page, projectId: string, env: DocsEnv): Promise<string | null> {
  if (env.budgetId) return env.budgetId;

  await page.goto(`/proyectos/${projectId}/presupuestos`);
  await assertNotOnErrorPage(page);

  const href = await page
    .locator('a[href*="/presupuestos/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (!href) return null;
  const m = href.match(/\/presupuestos\/([^/?#]+)/);
  return m?.[1] ?? null;
}
