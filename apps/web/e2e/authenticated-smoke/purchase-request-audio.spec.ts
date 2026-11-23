import { expect, test } from "@playwright/test";

const projectId = "a0000010-0000-4000-8000-000000000010";
const path = `/proyectos/${projectId}/solicitudes-compra/nueva`;
const endpoint = "/api/ai/purchase-request-audio";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
});

test("audio proposal requires completion and renewed review before creating a real draft", async ({ page }, testInfo) => {
  const description = `PRUEBA CI audio ${testInfo.project.name}`;
  let transcriptions = 0, proposals = 0;
  // Only AI is intercepted. The existing action, session and disposable SQL are real.
  await page.route(`**${endpoint}`, async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { enabled: true } });
    if (req.headers()["content-type"]?.startsWith("multipart/form-data")) {
      transcriptions++;
      expect(req.postData()).toContain(projectId);
      return route.fulfill({ json: { transcript: "Necesito material el viernes" } });
    }
    proposals++;
    expect(req.postDataJSON()).toEqual({ projectId, transcript: "Necesito dos unidades de material el viernes" });
    return route.fulfill({ json: { proposal: { neededByDate: null, observations: "Confirmar fecha del viernes", lines: [{ description, quantity: "2", unit: null }] } } });
  });
  await page.goto(path);
  await page.getByRole("button", { name: "Dictar solicitud", exact: true }).click();
  await page.getByLabel("Audio del pedido", { exact: true }).setInputFiles({ name: "pedido.wav", mimeType: "audio/wav", buffer: Buffer.from("RIFFxxxxWAVEfixture") });
  await page.getByRole("button", { name: "Transcribir audio", exact: true }).click();
  const transcript = page.getByLabel("Revisá el texto del pedido", { exact: true });
  await expect(transcript).toHaveValue("Necesito material el viernes");
  await transcript.fill("Necesito dos unidades de material el viernes");
  const prepare = page.getByRole("button", { name: "Preparar renglones", exact: true });
  await expect(prepare).toBeDisabled();
  await page.getByRole("checkbox", { name: "Revisé el texto: refleja mi pedido.", exact: true }).check();
  await prepare.click();
  await expect(page.getByText(/Unidad pendiente/)).toBeVisible();
  await page.getByRole("button", { name: "Usar propuesta y completar", exact: true }).click();
  const save = page.getByRole("button", { name: "Guardar borrador", exact: true });
  await expect(save).toBeDisabled();
  await page.locator("#pr-wbs").click();
  await page.getByRole("option").first().click();
  await expect(page.getByLabel("Descripción / material", { exact: true })).toHaveValue(description);
  await page.getByLabel("Unidad", { exact: true }).click();
  await page.getByRole("option", { name: "Unidad", exact: true }).click();
  // The label includes its required marker; keep matching the semantic label.
  await page.getByLabel(/^Fecha requerida/).fill("2026-12-04");
  const review = page.getByRole("checkbox", { name: /Revisé la partida, los renglones/ });
  await review.check();
  await expect(save).toBeEnabled();
  const quantity = page.getByLabel("Cantidad", { exact: true });
  await quantity.focus();
  await expect(quantity).toHaveValue("2,0000");
  await quantity.fill("3");
  await quantity.blur();
  await expect(quantity).toHaveValue("3,00");
  await expect(review).not.toBeChecked();
  await expect(save).toBeDisabled();
  await review.check();
  await save.click();
  await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}/solicitudes-compra/[0-9a-f-]{36}$`), { timeout: 30_000 });
  const draftUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(draftUrl);
  // The detail keeps both the mobile card and desktop table in the DOM.
  // Assert one visible row, rather than counting the intentionally hidden layout.
  const persistedLine = page.getByText(description, { exact: true }).and(page.locator(":visible"));
  await expect(persistedLine).toHaveCount(1);
  await expect(persistedLine).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar solicitud", exact: true })).toBeVisible();
  expect(transcriptions).toBe(1); expect(proposals).toBe(1);
  const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
  await testInfo.attach("reviewed-purchase-request-draft", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

test("disabled audio preserves manual creation and denies provider access", async ({ page }) => {
  const capability = await page.request.get(endpoint);
  expect(capability.status()).toBe(200);
  expect(await capability.json()).toEqual({ enabled: false });
  expect((await page.request.post(endpoint)).status()).toBe(503);
  await page.goto(path);
  await expect(page.getByRole("button", { name: "Dictar solicitud", exact: true })).toHaveCount(0);
  // Wait for streamed SSR markup to settle without accepting duplicate controls.
  await expect(page.locator("#pr-wbs")).toHaveCount(1);
  await expect(page.locator("#pr-wbs")).toBeVisible();
});
