import { expect, test } from "./fixtures";

const projectPath = "/proyectos/a0000010-0000-4000-8000-000000000010";

test("chat preserves a project's conversation but clears it when entering or leaving the project", async ({ page }) => {
  const requests: { messages: { role: string; content: string }[]; currentProjectId?: string }[] = [];
  await page.route("**/api/ai/chat", async (route) => {
    requests.push(route.request().postDataJSON());
    const links = [
      { label: "Ir al proyecto de prueba", href: projectPath },
      { label: "Ir a solicitudes de prueba", href: `${projectPath}/solicitudes-compra` },
      { label: "Volver a empresa de prueba", href: "/dashboard" },
    ];
    const body = `event: tool_end\ndata: ${JSON.stringify({ ok: true, links })}\n\nevent: done\ndata: ${JSON.stringify({ assistantText: `Respuesta sintética ${requests.length}` })}\n\n`;
    await route.fulfill({ contentType: "text/event-stream", body });
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel("Contraseña", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });

  const open = () => page.getByRole("button", { name: "Preguntale a Bloqer", exact: true }).click();
  async function ask(question: string) {
    const responseNumber = requests.length + 1;
    await page.getByLabel("Pregunta para Bloqer AI", { exact: true }).fill(question);
    await page.getByTestId("bloqer-ai-send").click();
    await expect(page.getByText(`Respuesta sintética ${responseNumber}`, { exact: true })).toBeVisible();
  }
  await open(); await ask("Consulta empresa");
  await page.getByRole("link", { name: "Ir al proyecto de prueba", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${projectPath}$`));
  await open();
  await expect(page.getByText("Consulta empresa", { exact: true })).toHaveCount(0);
  await ask("Consulta obra");
  expect(requests[1]?.messages).toEqual([{ role: "user", content: "Consulta obra" }]);
  expect(requests[1]?.currentProjectId).toBe(projectPath.split("/").at(-1));

  await page.getByRole("link", { name: "Ir a solicitudes de prueba", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${projectPath}/solicitudes-compra$`));
  await open(); await expect(page.getByText("Consulta obra", { exact: true })).toBeVisible();
  await ask("Seguimiento obra");
  expect(requests[2]?.messages.map((message) => message.content)).toEqual(["Consulta obra", "Respuesta sintética 2", "Seguimiento obra"]);

  await page.getByRole("link", { name: "Volver a empresa de prueba", exact: true }).last().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await open(); await expect(page.getByText("Consulta obra", { exact: true })).toHaveCount(0);
  await ask("Nueva consulta empresa");
  expect(requests[3]?.messages).toEqual([{ role: "user", content: "Nueva consulta empresa" }]);
  expect(requests[3]?.currentProjectId).toBeUndefined();
});
