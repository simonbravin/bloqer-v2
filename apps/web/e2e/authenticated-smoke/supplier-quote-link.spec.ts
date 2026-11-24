import { expect, test } from "@playwright/test";

test("supplier responds without a session, Compras reviews and imports once", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const index = ["desktop", "tablet", "phone"].indexOf(testInfo.project.name);
  expect(index).toBeGreaterThanOrEqual(0);
  const requestId = `a0000e20-0000-4000-8000-00000000000${index + 1}`;
  const path = `/proyectos/a0000010-0000-4000-8000-000000000010/solicitudes-compra/${requestId}`;
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
  await page.goto(path);
  const panel = page.getByRole("region", { name: "Respuestas por enlace" });
  await panel.getByLabel("Proveedor", { exact: true }).click();
  await page.getByRole("option").first().click();
  await panel.getByRole("button", { name: "Crear enlace", exact: true }).click();
  const share = panel.getByLabel("Enlace para el proveedor");
  await expect(share).toBeVisible();
  const link = await share.inputValue();
  expect(link).toMatch(/\/cotizar\/[a-f0-9-]+#token=[a-f0-9]{64}$/);
  const supplierContext = await browser.newContext({ viewport: page.viewportSize()! });
  try {
    const supplier = await supplierContext.newPage();
    await supplier.goto(link);
    await expect(supplier.getByLabel("Moneda", { exact: true })).toBeVisible();
    await expect(supplier).not.toHaveURL(/#|token=/);
    expect((await supplierContext.cookies()).some(cookie => cookie.name.includes("session-token"))).toBe(false);
    const cookie = (await supplierContext.cookies()).find(cookie => cookie.name.startsWith("supplier-quote-"));
    expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe("Strict");
    expect(cookie?.path).toBe(new URL(link).pathname);
    const endpoint = `${new URL(link).origin}${new URL(link).pathname}/response`;
    const read = await supplierContext.request.get(endpoint);
    expect(read.headers()["cache-control"]).toContain("no-store");
    expect(read.headers()["referrer-policy"]).toBe("no-referrer");
    expect((await supplierContext.request.post(endpoint, { headers: { origin: "https://another-company.invalid" }, data: {} })).status()).toBe(403);
    await expect(supplier.getByText("Internal supplier link fixture")).toHaveCount(0);
    await supplier.getByLabel("Moneda", { exact: true }).click();
    await supplier.getByRole("option", { name: /ARS/ }).click();
    await supplier.getByLabel("Precios unitarios", { exact: true }).click();
    await supplier.getByRole("option", { name: "Sin IVA incluido", exact: true }).click();
    await supplier.getByLabel("Percepción IIBB (%)", { exact: true }).fill("0");
    await supplier.getByLabel("Plazo de entrega (días)", { exact: true }).fill("3");
    await supplier.getByLabel("Oferta válida hasta", { exact: true }).fill("2050-01-01");
    await supplier.getByLabel("Precio unitario", { exact: true }).fill("1200,50");
    await supplier.getByLabel("IVA (%)", { exact: true }).fill("21");
    await supplier.getByLabel("Descuento (%)", { exact: true }).fill("0");
    await supplier.getByRole("button", { name: "Revisar respuesta", exact: true }).click();
    await expect(supplier.getByText("Revisá los datos antes de confirmar", { exact: true })).toBeVisible();
    expect(await supplier.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await testInfo.attach("supplier-review", { body: await supplier.screenshot({ fullPage: true }), contentType: "image/png" });
    await supplier.getByRole("button", { name: "Confirmar y enviar respuesta", exact: true }).click();
    await expect(supplier.getByRole("heading", { name: "Respuesta recibida", exact: true })).toBeVisible();
    await supplier.reload();
    await expect(supplier.getByRole("heading", { name: "Respuesta recibida", exact: true })).toBeVisible();
    await page.reload();
    await panel.getByRole("button", { name: "Revisar respuesta", exact: true }).click();
    await expect(panel.getByLabel("Precio unitario", { exact: true })).toHaveValue("1.200,50");
    await panel.getByLabel("Observaciones (opcional)").fill("Revisada por Compras en CI");
    await panel.getByRole("button", { name: "Revisar respuesta", exact: true }).last().click();
    await panel.getByRole("button", { name: "Incorporar cotización", exact: true }).click();
    try {
      await expect(panel.getByText("Incorporada", { exact: true })).toBeVisible({ timeout: 10_000 });
    } catch (error) {
      // This panel contains only isolated fixture data; the share token was cleared on reload.
      const diagnosticScope = await panel.count() ? panel : page.locator("body");
      const state = await diagnosticScope.evaluate(element => ({
        text: element.textContent,
        invalid: Array.from(element.querySelectorAll<HTMLInputElement>("input:invalid")).map(input => ({ id: input.id, message: input.validationMessage })),
        buttons: Array.from(element.querySelectorAll<HTMLButtonElement>("button")).map(button => ({ text: button.textContent, disabled: button.disabled })),
      }));
      throw new Error(`Reviewed response did not become incorporated: ${JSON.stringify(state)}`, { cause: error });
    }
    await page.reload();
    await expect(panel.getByText("Incorporada", { exact: true })).toHaveCount(1);
    await expect(panel.getByRole("button", { name: "Revisar respuesta", exact: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "Ver respuesta original", exact: true }).click();
    await expect(panel.getByLabel("Observaciones (opcional)")).toHaveValue("");
    await expect(panel.getByLabel("Precio unitario", { exact: true })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Incorporar cotización", exact: true })).toHaveCount(0);
    await testInfo.attach("internal-reviewed-response", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    // Real second company + second authenticated issuer. Both supplier tabs share
    // one cookie jar, so path isolation is exercised without mocking the server.
    const buyerBContext = await browser.newContext({ viewport: page.viewportSize()! });
    try {
      const buyerB = await buyerBContext.newPage();
      await buyerB.goto(new URL(link).origin + "/login");
      await buyerB.getByLabel("Email", { exact: true }).fill("supplier-link-b@example.invalid");
      await buyerB.getByLabel("Contraseña", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
      await buyerB.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
      await expect(buyerB).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
      await buyerB.goto(`${new URL(link).origin}/proyectos/a0000e32-0000-4000-8000-000000000032/solicitudes-compra/a0000e21-0000-4000-8000-00000000000${index + 1}`);
      const panelB = buyerB.getByRole("region", { name: "Respuestas por enlace" });
      await panelB.getByLabel("Proveedor", { exact: true }).click(); await buyerB.getByRole("option").first().click();
      await panelB.getByRole("button", { name: "Crear enlace", exact: true }).click();
      const shareB = panelB.getByLabel("Enlace para el proveedor"); await expect(shareB).toBeVisible();
      const linkB = await shareB.inputValue(); const tabB = await supplierContext.newPage();
      await tabB.goto(linkB);
      await expect(tabB.getByText(/Empresa B de prueba de enlaces · Obra B/)).toBeVisible();
      await expect(tabB.getByLabel("Precio unitario", { exact: true })).toHaveValue("");
      await supplier.reload(); await expect(supplier.getByRole("heading", { name: "Respuesta recibida", exact: true })).toBeVisible();
      const swapped = await supplierContext.request.post(`${new URL(linkB).origin}${new URL(linkB).pathname}/access`, {
        headers: { origin: new URL(linkB).origin }, data: { token: new URLSearchParams(new URL(link).hash.slice(1)).get("token") },
      });
      expect(swapped.status()).toBe(404);
      await tabB.reload(); await expect(tabB.getByLabel("Precio unitario", { exact: true })).toHaveValue("");
      await panelB.getByRole("button", { name: "Revocar enlace", exact: true }).click();
      await expect(panelB.getByText("Revocado", { exact: true })).toBeVisible();
      await tabB.reload(); await expect(tabB.getByRole("alert")).toContainText("El enlace no está disponible");
    } finally { await buyerBContext.close(); }
    // A copied route without its capability cannot read this request in another session.
    const deniedContext = await browser.newContext();
    try {
      const denied = await deniedContext.newPage(); await denied.goto(new URL(link).origin + new URL(link).pathname);
      await expect(denied.getByRole("alert")).toContainText("El enlace no está disponible");
      await expect(denied.getByLabel("Precio unitario", { exact: true })).toHaveCount(0);
    } finally { await deniedContext.close(); }
  } finally { await supplierContext.close(); }
});
