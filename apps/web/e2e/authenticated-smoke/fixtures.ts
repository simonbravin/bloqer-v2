import { test as base, expect, type Request } from "@playwright/test";

// The isolated CI fixtures contain synthetic data only. Keep diagnostics bounded,
// and never record request bodies, headers, cookies, credentials or input values.
export const test = base.extend<{ browserDiagnostics: void }>({
  browserDiagnostics: [async ({ page }, use, testInfo) => {
    const events: { at: number; kind: string; detail: string }[] = [];
    const started = Date.now();
    const pending = new Map<Request, string>();
    const record = (kind: string, detail: string) => {
      events.push({ at: Date.now() - started, kind, detail: detail.slice(0, 1000) });
      if (events.length > 100) events.shift();
    };
    const route = (url: string) => {
      const parsed = new URL(url);
      return parsed.pathname + parsed.search + parsed.hash;
    };
    const relevant = (request: Request) => {
      const url = new URL(request.url());
      return url.hostname === "127.0.0.1" &&
        (url.pathname.startsWith("/proyectos/") || url.pathname.startsWith("/tesoreria/conciliacion/") || url.pathname === "/dashboard");
    };
    page.on("pageerror", (error) => record("pageerror", error.message));
    page.on("console", (message) => {
      if (message.text().startsWith("[smoke-interaction] ")) record("interaction", message.text().slice(20));
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) record("navigation", route(frame.url()));
    });
    page.on("request", (request) => {
      if (!relevant(request)) return;
      const detail = `${request.method()} ${route(request.url())}`;
      pending.set(request, detail);
      record("request", detail);
    });
    page.on("response", (response) => {
      if (pending.has(response.request())) record("response", `${response.status()} ${route(response.url())}`);
    });
    page.on("requestfinished", (request) => pending.delete(request));
    page.on("requestfailed", (request) => {
      if (pending.has(request)) record("requestfailed", `${route(request.url())}: ${request.failure()?.errorText}`);
      pending.delete(request);
    });
    await page.addInitScript(() => {
      for (const kind of ["pointerdown", "click", "submit", "invalid"]) {
        document.addEventListener(kind, (event) => {
          if (!(location.pathname.startsWith("/proyectos/") || location.pathname.startsWith("/tesoreria/conciliacion/") || location.pathname === "/dashboard")) return;
          const target = event.target instanceof Element ? event.target.closest("button, a, input, form") : null;
          if (!target) return;
          console.debug("[smoke-interaction] " + JSON.stringify({
            event: kind,
            tag: target.tagName,
            id: target.id,
            label: target.getAttribute("aria-label") ?? target.textContent?.trim().slice(0, 100),
            href: target.getAttribute("href"),
            prevented: event.defaultPrevented,
          }));
        }, true);
      }
    });
    await use();
    if (testInfo.status !== testInfo.expectedStatus) {
      const state = await page.evaluate(() => ({
        url: location.href,
        ready: document.readyState,
        active: document.activeElement?.tagName,
        invalid: Array.from(document.querySelectorAll(":invalid")).map((element) => element.id || element.tagName),
        deliveryRows: document.querySelectorAll('[data-testid="delivery-document"]').length,
        nextHref: Array.from(document.querySelectorAll("a")).find((link) => link.textContent?.trim() === "Siguiente")?.getAttribute("href"),
        projection: document.getElementById("proyeccion-caja")?.innerText.slice(0, 4000),
        projectionInputs: ["projection-date", "projection-delay"].map((id) => {
          const input = document.getElementById(id) as HTMLInputElement | null;
          return { id, value: input?.value, valid: input?.validity.valid };
        }),
        projectionChecked: document.querySelector<HTMLInputElement>('#proyeccion-caja input[type="checkbox"]')?.checked,
        projectionBusy: document.querySelector("#proyeccion-caja [aria-busy]")?.getAttribute("aria-busy"),
      })).catch((error: Error) => ({ unavailable: error.message }));
      const diagnostics = { state, pending: [...pending.values()], events };
      const body = JSON.stringify(diagnostics, null, 2);
      console.log(`Browser diagnostics: ${testInfo.project.name} / ${testInfo.title}\n${body}`);
      await testInfo.attach("browser-diagnostics", { body, contentType: "application/json" });
    }
  }, { auto: true }],
});

export { expect };
