import { expect, test } from "@playwright/test";

const projectId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";

test("login renders without overflow, loads bundled fonts and supports keyboard password review", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:3100") await route.continue();
    else await route.abort();
  });

  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Iniciar sesión", exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  const password = page.getByLabel("Contraseña", { exact: true });
  await password.fill("fixture-only-not-a-real-password");
  const reveal = page.getByRole("button", { name: "Mostrar contraseña", exact: true });
  await reveal.focus();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar contraseña", exact: true }).press("Space");
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveValue("fixture-only-not-a-real-password");

  const layout = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      loadedFont: [...document.fonts].some((font) => font.status === "loaded"),
    };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.loadedFont).toBe(true);
  expect(errors).toEqual([]);
  await testInfo.attach("login", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

test("invoice and purchase-order screens require a session", async ({ page }) => {
  for (const path of ["/finanzas/facturas-proveedor", `/proyectos/${projectId}/ordenes-compra/${orderId}`]) {
    await page.goto(path);
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("callbackUrl") === path);
    await expect(page.getByRole("button", { name: "Iniciar sesión", exact: true })).toBeVisible();
  }
});

test("middleware rejects anonymous document extraction and PDF requests before the private handlers", async ({ request }) => {
  const cases = [
    { method: "GET", path: "/api/ai/supplier-invoice-preview" },
    { method: "POST", path: "/api/ai/supplier-invoice-preview" },
    { method: "GET", path: `/api/reports/proyectos/${projectId}/ordenes-compra/${orderId}/export?format=pdf` },
  ];
  for (const { method, path } of cases) {
    const response = await request.fetch(path, { method, maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const target = new URL(response.headers().location!);
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("callbackUrl")).toBe(path);
    expect(response.headers()["content-disposition"]).toBeUndefined();
  }
});
