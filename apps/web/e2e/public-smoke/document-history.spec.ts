import { expect, test } from "@playwright/test";

test("document history requires a session and is never publicly cached", async ({ request }) => {
  const response = await request.get("/api/documents/00000000-0000-4000-8000-000000000001/history");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["cache-control"]).toContain("private");
  expect(await response.json()).toEqual({ error: "No autenticado" });
});
