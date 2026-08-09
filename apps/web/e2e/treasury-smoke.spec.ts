import { test, expect } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL?.trim();
const password = process.env.E2E_USER_PASSWORD?.trim();
const configured = Boolean(process.env.E2E_BASE_URL?.trim() && email && password);

test.describe("Phase 5 finance smoke", () => {
  test.skip(!configured, "Requires E2E_BASE_URL + E2E_USER_EMAIL + E2E_USER_PASSWORD");

  test("login → tesorería loads", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/correo|email/i).fill(email!);
    await page.getByLabel(/contraseña|password/i).fill(password!);
    await page.getByRole("button", { name: /ingresar|entrar|iniciar/i }).click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });

    await page.goto("/tesoreria");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/tesoreria/);
  });

  test("unauthenticated dashboard redirects to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
