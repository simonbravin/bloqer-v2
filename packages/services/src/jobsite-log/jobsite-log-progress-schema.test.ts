import assert from "node:assert/strict";
import { test } from "node:test";
import { updateJobsiteLogSchema } from "@bloqer/validators";

test("updateJobsiteLogSchema accepts a form progress line (edit → save)", () => {
  const parsed = updateJobsiteLogSchema.safeParse({
    generalNotes: "Daniel vidal y su gente…",
    shift: "Jornada completa",
    weather: "Parcialmente nublado",
    progress: [
      {
        wbsNodeId: "11111111-1111-4111-8111-111111111111",
        description: "1.1 — Replanteo de Obra",
        quantityCompleted: "1.0000",
        physicalPct: "100.00",
        sortOrder: 0,
      },
    ],
    labor: [],
    materials: [],
    issues: [],
  });
  assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.issues[0]?.message);
  if (!parsed.success) return;
  assert.equal(parsed.data.progress.length, 1);
  assert.equal(parsed.data.progress[0]?.quantityCompleted, "1.0000");
  assert.equal(parsed.data.progress[0]?.physicalPct, "100.00");
  assert.equal(parsed.data.generalNotes, "<p>Daniel vidal y su gente…</p>");
});

test("updateJobsiteLogSchema omits generalNotes when the field is absent", () => {
  const parsed = updateJobsiteLogSchema.safeParse({
    title: "Solo título",
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.generalNotes, undefined);
});

test("updateJobsiteLogSchema rejects a progress line without quantity", () => {
  const parsed = updateJobsiteLogSchema.safeParse({
    progress: [
      {
        wbsNodeId: "11111111-1111-4111-8111-111111111111",
        physicalPct: "100.00",
      },
    ],
  });
  assert.equal(parsed.success, false);
});
