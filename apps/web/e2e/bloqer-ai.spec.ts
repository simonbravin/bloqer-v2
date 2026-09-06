import { test, expect, type Page } from "@playwright/test";

/** Fixture emails/IDs mirrored from adversarial fixtures (tests only). */
const OWNER_EMAIL = "ai-adv-owner-a@bloqer.demo";
const VIEWER_EMAIL = "ai-adv-viewer-a@bloqer.demo";
const PROJECT_A1 = "b1a00000-0000-4000-8000-000000000030";

/**
 * Bloqer AI local E2E (FakeAiProvider).
 *
 * Requires a running Next server with:
 *   BLOQER_AI_ENABLED=true
 *   BLOQER_AI_PROVIDER=fake
 *   APP_ENV=development (never production)
 *
 * Auth: adversarial fixture users (password from BLOQER_AI_E2E_PASSWORD or default local-only).
 *
 *   E2E_BASE_URL=http://127.0.0.1:3000
 *   BLOQER_AI_E2E=1
 *   E2E_USER_EMAIL=ai-adv-owner-a@bloqer.demo
 *   E2E_USER_PASSWORD=bloqer-ai-e2e-local-only
 */

const e2eEnabled = process.env.BLOQER_AI_E2E === "1";
const baseUrl = (process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3000").replace(/\/$/, "");
const ownerEmail = process.env.E2E_USER_EMAIL?.trim() || OWNER_EMAIL;
const viewerEmail = VIEWER_EMAIL;
const password =
  process.env.E2E_USER_PASSWORD?.trim() ||
  process.env.BLOQER_AI_E2E_PASSWORD?.trim() ||
  "bloqer-ai-e2e-local-only";
const projectA1 = PROJECT_A1;

const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

function chatDialog(page: Page) {
  return page.getByRole("dialog", { name: /preguntale a bloqer/i });
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${baseUrl}/login`);
  // Session may already be authenticated (soft redirect / shell still painting).
  const fab = page.getByRole("button", { name: /preguntale a bloqer/i });
  if (await fab.isVisible().catch(() => false)) return;
  if (!page.url().includes("/login")) return;

  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();

  // Prefer auth chrome over waitForURL("load") — client navigations can miss the load event.
  try {
    await Promise.race([
      page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 45_000,
        waitUntil: "commit",
      }),
      fab.waitFor({ state: "visible", timeout: 45_000 }),
      page.getByRole("navigation").waitFor({ state: "visible", timeout: 45_000 }),
    ]);
  } catch (err) {
    if (await fab.isVisible().catch(() => false)) return;
    if (!page.url().includes("/login")) return;
    const alert = await page
      .locator('[role="alert"], .text-destructive, body')
      .first()
      .innerText()
      .catch(() => "");
    throw new Error(
      `Login failed for ${email}. Page text snippet: ${alert.slice(0, 400)}. Cause: ${String(err)}`,
    );
  }
}

async function openChat(page: Page) {
  const fab = page.getByRole("button", { name: /preguntale a bloqer/i });
  await expect(fab).toBeVisible({ timeout: 30_000 });
  await fab.click();
  await expect(page.getByTestId("bloqer-ai-input")).toBeVisible({ timeout: 10_000 });
  return fab;
}

test.describe("Bloqer AI local Fake — posture when disabled", () => {
  test.skip(!e2eEnabled, "Set BLOQER_AI_E2E=1");

  test("unauthenticated AI chat does not leak secrets", async ({ request }) => {
    const res = await request.post(`${baseUrl}/api/ai/chat`, {
      data: { messages: [{ role: "user", content: "ping" }] },
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    // Local middleware may 307→login; route itself returns 401/503 when reached.
    expect([401, 403, 503, 307, 302]).toContain(res.status());
    const body = await res.text();
    expect(body).not.toMatch(/OPENAI_API_KEY|BEGIN PRIVATE|at Object\./i);
  });
});

for (const vp of viewports) {
  test.describe(`Bloqer AI OWNER Fake @ ${vp.name}`, () => {
    test.skip(!e2eEnabled, "Set BLOQER_AI_E2E=1 + seeded adversarial users + AI fake server");
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`login FAB help streaming OC close reopen @ ${vp.name}`, async ({ page }) => {
      await login(page, ownerEmail);
      // Prefer domcontentloaded — full "load" can flake with ERR_CONNECTION_RESET under Next turbopack.
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60_000 });

      const fab = page.getByRole("button", { name: /preguntale a bloqer/i });
      await expect(fab).toBeVisible({ timeout: 30_000 });

      if (vp.width <= 430) {
        const box = await fab.boundingBox();
        expect(box).toBeTruthy();
        expect(box!.y + box!.height).toBeLessThan(vp.height - 40);
      }

      await fab.click();
      await expect(page.getByTestId("bloqer-ai-input")).toBeVisible({ timeout: 10_000 });
      const dialog = chatDialog(page);

      const input = page.getByTestId("bloqer-ai-input");
      await input.fill("¿Cómo creo una solicitud de compra?");
      await page.getByTestId("bloqer-ai-send").click();
      await expect(dialog.getByTestId("bloqer-ai-presentation")).toBeVisible({ timeout: 45_000 });
      await expect(dialog.getByTestId("bloqer-ai-presentation")).toHaveAttribute(
        "data-kind",
        /help|explain|list/,
      );
      await expect(
        dialog.getByText(/solicitud de compra|FakeAiProvider|\/ayuda|cómo/i).first(),
      ).toBeVisible({ timeout: 5_000 });
      // Internal help link: empty-state link and/or path rendered from assistant text.
      await expect(
        dialog.getByRole("link", { name: /centro de ayuda|ayuda/i }).or(dialog.locator('a[href="/ayuda"]')).first(),
      ).toBeVisible({ timeout: 5_000 });

      await input.fill("¿Cómo viene esta obra?");
      await page.getByTestId("bloqer-ai-send").click();
      await expect(dialog.getByTestId("bloqer-ai-presentation")).toBeVisible({ timeout: 45_000 });
      await expect(dialog.getByTestId("bloqer-ai-presentation").last()).toHaveAttribute(
        "data-kind",
        "executive",
      );
      await expect(dialog.getByTestId("bloqer-ai-insight").first()).toBeVisible();
      await expect(dialog.getByText(/qué haría hoy/i).first()).toBeVisible();

      await input.fill("¿Qué OC están pendientes?");
      await page.getByTestId("bloqer-ai-send").click();
      await expect(
        dialog.getByText(/OC pendientes|compras|FakeAiProvider|lectura/i).first(),
      ).toBeVisible({ timeout: 45_000 });

      await page.getByRole("button", { name: /cerrar/i }).click();
      await expect(page.getByTestId("bloqer-ai-input")).toHaveCount(0);
      await fab.click();
      await expect(page.getByTestId("bloqer-ai-input")).toBeVisible();
    });

    test(`project materials context @ ${vp.name}`, async ({ page }) => {
      await login(page, ownerEmail);
      await page.goto(`${baseUrl}/proyectos/${projectA1}/materiales`);
      await openChat(page);
      const dialog = chatDialog(page);
      const input = page.getByTestId("bloqer-ai-input");
      await input.fill("¿Qué materiales faltan?");
      await page.getByTestId("bloqer-ai-send").click();
      await expect(
        dialog.getByText(/revisá materiales|FakeAiProvider|materiales en la obra/i).first(),
      ).toBeVisible({ timeout: 45_000 });
    });
  });
}

test.describe("Bloqer AI VIEWER Fake", () => {
  test.skip(!e2eEnabled, "Set BLOQER_AI_E2E=1");
  test.use({ viewport: { width: 768, height: 1024 } });

  test("VIEWER can open chat and ask help", async ({ page }) => {
    await login(page, viewerEmail);
    await page.goto(`${baseUrl}/dashboard`);
    await openChat(page);
    const dialog = chatDialog(page);
    await page.getByTestId("bloqer-ai-input").fill("¿Cómo creo una solicitud de compra?");
    await page.getByTestId("bloqer-ai-send").click();
    await expect(dialog.getByText(/solicitud de compra|FakeAiProvider|\/ayuda/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe("Bloqer AI streaming abort", () => {
  test.skip(!e2eEnabled, "Set BLOQER_AI_E2E=1");
  test.use({ viewport: { width: 390, height: 844 } });

  test("closing sheet during stream does not crash app", async ({ page }) => {
    await login(page, ownerEmail);
    await page.goto(`${baseUrl}/dashboard`);
    const fab = await openChat(page);
    await page.getByTestId("bloqer-ai-input").fill("¿Qué OC están pendientes?");
    await page.getByTestId("bloqer-ai-send").click();
    await page.getByRole("button", { name: /cerrar/i }).click();
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 10_000 });
    await fab.click();
    await expect(page.getByTestId("bloqer-ai-input")).toBeVisible();
  });
});

test.describe("Bloqer AI links + rate limit + errors", () => {
  test.skip(!e2eEnabled, "Set BLOQER_AI_E2E=1");
  test.use({ viewport: { width: 768, height: 1024 } });

  test("tool ui.links render as clickable chips", async ({ page }) => {
    await login(page, ownerEmail);
    await page.goto(`${baseUrl}/proyectos/${projectA1}/materiales`);
    await openChat(page);
    const dialog = chatDialog(page);
    await page.getByTestId("bloqer-ai-input").fill("¿Qué materiales faltan?");
    await page.getByTestId("bloqer-ai-send").click();
    await expect(dialog.getByText(/materiales|FakeAiProvider/i).first()).toBeVisible({
      timeout: 45_000,
    });
    // Links may render as presentation cards or legacy chips under the message.
    const presentationLink = dialog.getByTestId("bloqer-ai-presentation").getByRole("link").first();
    const legacyLinks = dialog.getByTestId("bloqer-ai-links").getByRole("link").first();
    await expect(presentationLink.or(legacyLinks)).toBeVisible({ timeout: 15_000 });
    await expect(presentationLink.or(legacyLinks)).toHaveAttribute("href", /^\//);
  });

  test("Help article Preguntale a Bloqer is reachable", async ({ page }) => {
    await login(page, ownerEmail);
    await page.goto(`${baseUrl}/ayuda/preguntale-a-bloqer`);
    await expect(page.getByRole("heading", { name: /preguntale a bloqer/i })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("provider/error path surfaces safe Spanish message", async ({ page, request }) => {
    await login(page, ownerEmail);
    // Unauthenticated already covered; authenticated empty payload → 400.
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await request.post(`${baseUrl}/api/ai/chat`, {
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      data: { messages: [] },
      failOnStatusCode: false,
    });
    expect([400, 429, 503]).toContain(res.status());
    const body = await res.text();
    expect(body).not.toMatch(/OPENAI_API_KEY|sk-[a-zA-Z0-9]{10,}/i);
  });

  test("rate limit returns 429 with user-facing message", async ({ page, request }) => {
    test.skip(
      process.env.BLOQER_AI_RATE_LIMIT_USER_PER_MINUTE !== "2",
      "Set BLOQER_AI_RATE_LIMIT_USER_PER_MINUTE=2 on the Next server to exercise this test",
    );
    await login(page, ownerEmail);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const payload = {
      messages: [{ role: "user", content: "ping rate limit" }],
      currentRoute: "/dashboard",
    };
    let saw429 = false;
    for (let i = 0; i < 5; i++) {
      const res = await request.post(`${baseUrl}/api/ai/chat`, {
        headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
        data: payload,
        failOnStatusCode: false,
      });
      if (res.status() === 429) {
        saw429 = true;
        const json = (await res.json()) as { error?: string };
        expect(json.error).toMatch(/límite de consultas de Bloqer AI/i);
        break;
      }
    }
    expect(saw429).toBeTruthy();
  });
});
