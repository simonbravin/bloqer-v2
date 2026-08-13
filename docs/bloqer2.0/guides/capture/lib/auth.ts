import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { DocsEnv } from "./env";

export async function login(page: Page, env: DocsEnv): Promise<void> {
  await page.goto("/login");
  await page.locator("#login-email").click();
  await page.locator("#login-email").fill("");
  await page.locator("#login-email").pressSequentially(env.email, { delay: 15 });
  await page.locator("#login-password").click();
  await page.locator("#login-password").fill("");
  await page.locator("#login-password").pressSequentially(env.password, { delay: 15 });

  await Promise.all([
    page.waitForURL(
      (url) => {
        const p = url.pathname;
        return !p.includes("/login") && !p.includes("/api/auth/error");
      },
      { timeout: 120_000 },
    ),
    page.getByRole("button", { name: /^iniciar sesión$/i }).click(),
  ]);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

export async function assertAuthenticatedShell(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: /404|500|internal server error|error inesperado/i }),
  ).not.toBeVisible({ timeout: 5_000 });
}

const NEXT_OVERLAY_ERROR_RE =
  /Runtime TypeError|Runtime Error|Unhandled Runtime Error|Application error|server-side exception|Digest:/i;

/**
 * Next.js 15 overlay lives in `<nextjs-portal>` (shadow/iframe). `body.innerText`
 * of the main frame misses it — that is how error PNGs were marked OK.
 */
export async function assertNoNextjsOverlay(page: Page): Promise<void> {
  const issueToast = page.getByText(/\b\d+\s+Issues?\b/i);
  if (await issueToast.first().isVisible().catch(() => false)) {
    throw new Error("Next.js error overlay toast is visible");
  }

  const chunks: string[] = [];
  for (const frame of page.frames()) {
    const text = await frame.locator("body").innerText().catch(() => "");
    if (text) chunks.push(text);
  }
  const text = chunks.join("\n");
  if (NEXT_OVERLAY_ERROR_RE.test(text)) {
    throw new Error(`Next.js error overlay is visible: ${text.slice(0, 180)}`);
  }
}

export async function assertNotOnErrorPage(page: Page): Promise<void> {
  await assertAuthenticatedShell(page);
  await assertNoNextjsOverlay(page);
  const body = await page.locator("body").innerText();
  if (/^404$|not found|página no encontrada/i.test(body.slice(0, 500))) {
    throw new Error("Landed on 404 page");
  }
}

export async function assertDemoTenantSafe(page: Page): Promise<void> {
  if (process.env.DOCS_ALLOW_REAL_TENANT === "1") return;
  const body = await page.locator("body").innerText();
  if (/Indari|Vision Building|visionbuildingtechs/i.test(body)) {
    throw new Error(
      "Se detectaron datos del tenant real. Usá docs-guide@bloqer.demo y DOCS_DEMO_SEED=1 pnpm db:seed.",
    );
  }
}

export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page.waitForTimeout(400);
}
