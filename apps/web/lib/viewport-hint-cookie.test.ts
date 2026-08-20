import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isDesktopDashboardViewport,
  isScheduleFieldViewport,
  isMaterialsFieldViewport,
  parseViewportHint,
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
});

test("matchMedia maps 390/768/1440 onto sm/md/lg", () => {
  assert.equal(viewportHintFromMatchMedia(false, false), "sm");
  assert.equal(viewportHintFromMatchMedia(true, false), "md");
  assert.equal(viewportHintFromMatchMedia(true, true), "lg");
});
