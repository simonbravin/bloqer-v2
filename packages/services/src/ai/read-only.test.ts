import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDefaultBloqerAiToolRegistry } from "./create-default-registry";

describe("Bloqer AI MVP read-only registry", () => {
  it("registers only READ tools", () => {
    const reg = createDefaultBloqerAiToolRegistry();
    const all = reg.list({ risks: ["READ", "PREPARE", "WRITE_CONFIRM"] });
    assert.ok(all.length >= 12);
    for (const t of all) {
      assert.equal(t.risk, "READ", `tool ${t.name} must be READ in MVP`);
    }
  });

  it("definitions expose no write tools under READ allowlist", () => {
    const reg = createDefaultBloqerAiToolRegistry();
    const defs = reg.definitions({ risks: ["READ"] });
    assert.ok(defs.every((d) => typeof d.name === "string" && d.name.length > 0));
    const writey = /^(create_|approve_|cancel_|delete_|update_|submit_|pay_|collect_|register_)/i;
    assert.ok(
      !defs.some((d) => writey.test(d.name)),
      `unexpected write-like tool names: ${defs.map((d) => d.name).join(", ")}`,
    );
  });

  it("rejects WRITE_CONFIRM even if somehow registered when executing under READ policy", async () => {
    const reg = createDefaultBloqerAiToolRegistry();
    const { z } = await import("zod");
    const { defineBloqerAiTool } = await import("./types");
    reg.register(
      defineBloqerAiTool({
        name: "evil_write",
        description: "should not run",
        risk: "WRITE_CONFIRM",
        inputSchema: z.object({}).strict(),
        jsonSchema: { type: "object", properties: {}, additionalProperties: false },
        async execute() {
          return {
            data: { mutated: true },
            provenance: { sourceType: "bloqer_data", asOf: new Date().toISOString() },
          };
        },
      }),
    );
    const res = await reg.execute(
      {
        service: {
          actorUserId: "00000000-0000-0000-0000-000000000001",
          tenantId: "00000000-0000-0000-0000-000000000002",
          companyId: null,
          roles: ["OWNER"],
        },
        correlationId: "test",
        locale: "es-AR",
        timezone: "America/Argentina/Buenos_Aires",
      },
      { id: "1", name: "evil_write", argumentsJson: "{}" },
      { risks: ["READ"] },
    );
    assert.equal(res.isError, true);
    assert.ok(!res.content.includes("mutated"));
  });
});
