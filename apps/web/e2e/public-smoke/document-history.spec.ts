import { expect, test } from "@playwright/test";

test("document history cannot be reached without a session", async ({ request }) => {
  const response = await request.get("/api/documents/00000000-0000-4000-8000-000000000001/history", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location!).pathname).toBe("/login");
  expect(await response.text()).not.toContain('"entries"');
});

test("document history export and integrity checks require a session", async ({ request }) => {
  for (const suffix of ["history/export", "integrity", "versions"]) {
    const response = await request.get(`/api/documents/00000000-0000-4000-8000-000000000001/${suffix}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location!).pathname).toBe("/login");
    expect(response.headers()["content-disposition"]).toBeUndefined();
  }
});
