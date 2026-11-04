import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { resolveAppShellBreadcrumbs, resolvePlatformShellBreadcrumbs } from "./shell-breadcrumb";

const uuid = "11111111-1111-4111-8111-111111111111";

function routeFromFile(file: string): string {
  return "/" + file.replaceAll("\\", "/").split("/").slice(1, -1).filter((part) => !part.startsWith("(")).join("/");
}

function appPages(directory = "app"): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? appPages(path) : entry.name === "page.tsx" ? [path] : [];
  });
}

test("breadcrumb links for current application pages lead to an implemented page", () => {
  const files = appPages();
  const routes = files.map(routeFromFile);
  const patterns = routes.map((route) => new RegExp("^" + route.split("/").map((part) => part.startsWith("[") ? "[^/]+" : part).join("/") + "/?$"));
  const broken: string[] = [];
  for (const file of files.filter((path) => /\((app|platform)\)/.test(path))) {
    const route = routeFromFile(file);
    const pathname = route.replace(/\[[^\]]+\]/g, uuid);
    const items = pathname.startsWith("/platform")
      ? resolvePlatformShellBreadcrumbs(pathname)
      : resolveAppShellBreadcrumbs(pathname, { tenantName: "Organización" });
    for (const item of items) {
      if (item.href && !patterns.some((pattern) => pattern.test(item.href!))) broken.push(`${route} -> ${item.href}`);
    }
  }
  assert.deepEqual(broken, []);
});
