import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isDesktopDashboardViewport,
  isScheduleFieldViewport,
  isMaterialsFieldViewport,
  isPayablesFieldViewport,
  isReceivablesFieldViewport,
  parseViewportHint,
  readViewportHintFromDocument,
  shouldRefreshForViewport,
  viewportHintFromMatchMedia,
} from "./viewport-hint-cookie";

test("parseViewportHint accepts sm, md, and lg", () => {
  assert.equal(parseViewportHint("sm"), "sm");
  assert.equal(parseViewportHint("md"), "md");
  assert.equal(parseViewportHint("lg"), "lg");
  assert.equal(parseViewportHint(""), null);
  assert.equal(parseViewportHint(null), null);
  assert.equal(parseViewportHint("SM"), null);
});

test("dashboard desktop is md or lg; Field Home is sm or missing", () => {
  assert.equal(isDesktopDashboardViewport("sm"), false);
  assert.equal(isDesktopDashboardViewport("md"), true);
  assert.equal(isDesktopDashboardViewport("lg"), true);
  assert.equal(isDesktopDashboardViewport(null), false);
});

test("cronograma and materiales Field are everything except lg, including missing cookie", () => {
  assert.equal(isScheduleFieldViewport("sm"), true);
  assert.equal(isScheduleFieldViewport("md"), true);
  assert.equal(isScheduleFieldViewport(null), true);
  assert.equal(isScheduleFieldViewport("lg"), false);
  assert.equal(isMaterialsFieldViewport("md"), true);
  assert.equal(isMaterialsFieldViewport("lg"), false);
  assert.equal(isPayablesFieldViewport("md"), true);
  assert.equal(isPayablesFieldViewport("lg"), false);
  assert.equal(isReceivablesFieldViewport("md"), true);
  assert.equal(isReceivablesFieldViewport("lg"), false);
});

test("matchMedia maps 390/768/1440 onto sm/md/lg", () => {
  assert.equal(viewportHintFromMatchMedia(false, false), "sm");
  assert.equal(viewportHintFromMatchMedia(true, false), "md");
  assert.equal(viewportHintFromMatchMedia(true, true), "lg");
});

test("malformed viewport cookies are ignored instead of interrupting sync", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const browserDocument = { cookie: "unrelated=lg; bloqer-viewport=%E0%A4%A" };
  Object.defineProperty(globalThis, "document", { configurable: true, value: browserDocument });
  try {
    assert.equal(readViewportHintFromDocument(), null);
    browserDocument.cookie = "unrelated=lg; bloqer-viewport=l%67";
    assert.equal(readViewportHintFromDocument(), "lg");
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("labor and equipment switch view on direct desktop entry and cross the 1024px breakpoint", () => {
  for (const section of ["mano-obra", "equipos"]) {
    const href = `/proyectos/project-id/${section}`;
    assert.equal(shouldRefreshForViewport(href, null, "lg"), true);
    assert.equal(shouldRefreshForViewport(href, null, "md"), false);
    assert.equal(shouldRefreshForViewport(href, "md", "lg"), true);
    assert.equal(shouldRefreshForViewport(href, "lg", "md"), true);
    assert.equal(shouldRefreshForViewport(href, "md", "sm"), false);
  }
});

test("dashboard switches at 768px while financial details use the 1024px breakpoint", () => {
  assert.equal(shouldRefreshForViewport("/dashboard", null, "md"), true);
  assert.equal(shouldRefreshForViewport("/dashboard", "sm", "md"), true);
  assert.equal(shouldRefreshForViewport("/dashboard", "md", "lg"), false);
  assert.equal(shouldRefreshForViewport("/dashboard", "md", "sm"), true);
  assert.equal(shouldRefreshForViewport("/finanzas/cuentas-por-cobrar/id/cobrar", null, "lg"), true);
  assert.equal(shouldRefreshForViewport("/proyectos/id/cuentas-por-pagar/id/pagar", "lg", "md"), true);
  assert.equal(shouldRefreshForViewport("/proyectos/id/documentos", null, "lg"), false);
  assert.equal(shouldRefreshForViewport("/proyectos/id/documentos", "sm", "lg"), true);
});
