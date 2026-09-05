import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { BloqerAiToolRegistry } from "./registry";
import type { BloqerAiTool } from "./types";
import { buildAiExecutionContext } from "./context";

const sampleTool: BloqerAiTool = {
  name: "ping_read",
  description: "ping",
  risk: "READ",
  inputSchema: z.object({}).strict(),
  jsonSchema: { type: "object", properties: {}, additionalProperties: false },
  async execute() {
    return {
      data: { ok: true },
      provenance: { sourceType: "bloqer_data", asOf: new Date().toISOString() },
    };
  },
};

const writeTool: BloqerAiTool = {
  ...sampleTool,
  name: "ping_write",
  risk: "WRITE_CONFIRM",
};

describe("BloqerAiToolRegistry", () => {
  it("lists only allowed risks", () => {
    const reg = new BloqerAiToolRegistry();
    reg.register(sampleTool);
    reg.register(writeTool);
    assert.equal(reg.list({ risks: ["READ"] }).length, 1);
    assert.equal(reg.definitions({ risks: ["READ"] })[0]?.name, "ping_read");
  });

  it("rejects unknown tools", async () => {
    const reg = new BloqerAiToolRegistry();
    reg.register(sampleTool);
    const ctx = buildAiExecutionContext({
      service: {
        actorUserId: "00000000-0000-0000-0000-000000000001",
        tenantId: "00000000-0000-0000-0000-000000000002",
        companyId: null,
        roles: ["VIEWER"],
      },
    });
    const res = await reg.execute(ctx, {
      id: "1",
      name: "nope",
      argumentsJson: "{}",
    });
    assert.equal(res.isError, true);
  });
});
