import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfiguracionSubnavLinks } from "./configuracion-subnav";
import { buildGlobalNavSections } from "./global-workspace-nav";
import { isNavLinkActive } from "./nav-link-active";

const administration = ["/configuracion", "/configuracion/equipo", "/configuracion/permisos", "/configuracion/politicas"];

test("configuration navigation applies the same enabled role branch as its server reads", () => {
  for (const settings of [false, true]) for (const users of [false, true]) {
    const enabled = (module: string) => module === "TENANT_SETTINGS" ? settings : module === "USERS_PERMISSIONS" ? users : true;
    const global = buildGlobalNavSections(["OWNER"], enabled).flatMap((section) => section.items).map((item) => item.href);
    const subnav = buildConfiguracionSubnavLinks(["OWNER"], enabled).map((item) => item.href);
    for (const href of administration) {
      assert.equal(global.includes(href), settings || users, href);
      assert.equal(subnav.includes(href), settings || users, href);
    }
    for (const href of ["/configuracion/perfil", "/configuracion/notificaciones"]) {
      assert.ok(global.includes(href));
      assert.ok(subnav.includes(href));
    }
  }
});

test("personal profile access does not grant a project manager access to General or team settings", () => {
  const sections = buildGlobalNavSections(["PROJECT_MANAGER"], () => true);
  const global = sections.flatMap((section) => section.items).map((item) => item.href);
  const subnav = buildConfiguracionSubnavLinks(["PROJECT_MANAGER"]).map((item) => item.href);
  for (const href of administration) {
    assert.ok(!global.includes(href));
    assert.ok(!subnav.includes(href));
  }
  assert.ok(subnav.includes("/configuracion/perfil"));
  assert.ok(subnav.includes("/configuracion/notificaciones"));
});

test("the activity log is absent from both menus when AUDIT is disabled", () => {
  const enabled = (module: string) => module !== "AUDIT";
  assert.ok(!buildConfiguracionSubnavLinks(["OWNER"], enabled).some(({ href }) => href === "/configuracion/registro"));
  assert.ok(!buildGlobalNavSections(["OWNER"], enabled).flatMap(({ items }) => items)
    .some(({ href }) => href === "/configuracion/registro"));
});

test("enabled child modules cannot offer navigation into a disabled treasury or accounting parent", () => {
  const sections = buildGlobalNavSections(["OWNER"], (module) => module !== "TREASURY" && module !== "ACCOUNTING");
  assert.ok(!sections.some((section) => section.title === "Tesorería"));
  assert.ok(!sections.some((section) => section.title === "Contabilidad"));
  assert.ok(sections.some((section) => section.title === "Finanzas"));
});

test("corporate sales documents require company finance access and the AR module", () => {
  const hrefs = (roles: Parameters<typeof buildGlobalNavSections>[0], enabled = true) =>
    buildGlobalNavSections(roles, (module) => module !== "AR" || enabled)
      .flatMap(({ items }) => items).map(({ href }) => href);
  assert.ok(hrefs(["OWNER"]).includes("/finanzas/facturas"));
  assert.ok(!hrefs(["OWNER"], false).includes("/finanzas/facturas"));
  assert.ok(!hrefs(["PROJECT_MANAGER"]).includes("/finanzas/facturas"));
  assert.equal(isNavLinkActive("/finanzas/facturas-proveedor", null, "/finanzas/facturas"), false);
});

test("active account navigation includes its transfer flow and preserves exact summary matching", () => {
  assert.equal(isNavLinkActive("/tesoreria/transferencias", null, "/tesoreria/cuentas"), true);
  assert.equal(isNavLinkActive("/tesoreria/transferencias/nueva", null, "/tesoreria/cuentas"), true);
  assert.equal(isNavLinkActive("/tesoreria/cuentas/account", null, "/tesoreria/cuentas"), true);
  assert.equal(isNavLinkActive("/tesoreria/conciliacion", null, "/tesoreria/cuentas"), false);
  assert.equal(isNavLinkActive("/tesoreria/cuentas", null, "/tesoreria", { matchExact: true }), false);
});
