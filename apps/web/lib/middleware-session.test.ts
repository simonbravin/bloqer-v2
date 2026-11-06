import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { NextRequest, NextResponse } from "next/server";
import ts from "typescript";
import * as callbackUrls from "./auth-callback-url";
import * as invitationCookie from "./invitation-accept-token-cookie";

const source = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type Middleware = (request: NextRequest & { auth: unknown }) => NextResponse;
const loaded: { default?: Middleware } = {};
const modules: Record<string, unknown> = {
  "@bloqer/auth/middleware": { auth: (handler: Middleware) => handler },
  "@/lib/auth-callback-url": callbackUrls,
  "@/lib/invitation-accept-token-cookie": invitationCookie,
  "next/server": { NextResponse },
};
runInNewContext(compiled, { exports: loaded, require: (id: string) => modules[id], URL, Headers, crypto, console });

function request(auth: unknown, path = "/proyectos"): NextResponse {
  const req = new NextRequest(`https://portal.example.invalid${path}`);
  return loaded.default!(Object.assign(req, { auth }));
}

test("a configuration error and an incomplete session cannot pass the private route guard", () => {
  for (const auth of [null, { message: "configuration error" }, { user: {} }, { user: { id: "" } }]) {
    const res = request(auth);
    assert.equal(res.status, 307);
    const redirect = new URL(res.headers.get("location")!);
    assert.equal(redirect.pathname, "/login");
    assert.equal(redirect.searchParams.get("callbackUrl"), "/proyectos");
  }
});

test("a user session and public login reach their destinations", () => {
  assert.equal(request({ user: { id: "synthetic-user" } }).headers.get("x-middleware-next"), "1");
  assert.equal(request(null, "/login").headers.get("x-middleware-next"), "1");
});
