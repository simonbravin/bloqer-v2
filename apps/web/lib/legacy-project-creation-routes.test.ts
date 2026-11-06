import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { redirect } from "next/navigation";
import { getRedirectStatusCodeFromError, getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import ts from "typescript";
import { can, type UserRole } from "@bloqer/domain";

type Session = {
  session: { user: { id: string } };
  tenantCtx: { tenantId: string; companyId: string; roles: UserRole[] } | null;
};

class ServiceError extends Error {
  constructor(readonly code: "FORBIDDEN" | "NOT_FOUND") {
    super(code);
  }
}

for (const [alias, list, query, forwarded] of [
  ["facturas-proveedor/nueva", "facturas-proveedor", "error=&description=Caño&quantity=2&unit=m&from=apu&ignored=1", "&description=Ca%C3%B1o&quantity=2&unit=m&from=apu"],
  ["consumos/nuevo", "consumos", "description=Caño&ignored=1", ""],
] as const) {
  test(`${alias} redirects before streaming and keeps the project and edit guards`, async () => {
    const tenantCtx = { tenantId: "tenant", companyId: "company", roles: ["OWNER"] as UserRole[] };
    const session = { user: { id: "user" } };
    let current: Session | null = { session, tenantCtx };
    let projectError: ServiceError | null = null;
    let platform = false;
    const dependencies: Record<string, unknown> = {
      "next/navigation": { redirect },
      "@bloqer/domain": { can },
      "@bloqer/services": {
        ServiceError,
        isPlatformSuperadmin: async () => platform,
        getProjectShellInfo: async (id: string, ctx: { actorUserId: string; tenantId: string; companyId: string }) => {
          assert.equal(id, "project");
          assert.equal(ctx.actorUserId, "user");
          assert.equal(ctx.tenantId, "tenant");
          assert.equal(ctx.companyId, "company");
          if (projectError) throw projectError;
        },
      },
      "@/lib/auth": { getCurrentUser: async () => current },
    };
    const source = new URL(`../app/(app)/proyectos/[id]/${alias}/route.ts`, import.meta.url);
    const code = ts.transpileModule(readFileSync(source, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {} as {
      GET: (request: { nextUrl: URL }, route: { params: Promise<{ id: string }> }) => Promise<never>;
    };
    runInNewContext(code, {
      exports,
      URLSearchParams,
      require(name: string) {
        assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
        return dependencies[name];
      },
    });
    const request = { nextUrl: new URL(`https://example.test/proyectos/project/${alias}?${query}`) };
    const params = { params: Promise.resolve({ id: "project" }) };
    const destination = `/proyectos/project/${list}`;
    const expectRedirect = (location: string) => assert.rejects(exports.GET(request, params), (error: unknown) =>
      isRedirectError(error) && getRedirectStatusCodeFromError(error) === 307 && getURLFromRedirectError(error) === location,
    );

    await expectRedirect(`${destination}?create=1${forwarded}`);
    current = { session, tenantCtx: { ...tenantCtx, roles: ["VIEWER"] } };
    await expectRedirect(destination);

    projectError = new ServiceError("FORBIDDEN");
    await expectRedirect("/dashboard");
    projectError = new ServiceError("NOT_FOUND");
    await expectRedirect(destination);

    current = { session, tenantCtx: null };
    await expectRedirect("/onboarding");
    platform = true;
    await expectRedirect("/login");
    current = null;
    await expectRedirect("/login");
  });
}
