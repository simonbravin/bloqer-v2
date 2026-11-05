import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createJobsiteLogSchema,
  returnJobsiteLogSchema,
  updateJobsiteLogSchema,
} from "@bloqer/validators";

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

test("jobsite dates must be real calendar dates with no time component", () => {
  const base = {
    projectId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
  };
  for (const logDate of ["2026-02-29", "2026-04-31", "2026-05-03T00:00:00Z", ""]) {
    assert.equal(createJobsiteLogSchema.safeParse({ ...base, logDate }).success, false);
    assert.equal(updateJobsiteLogSchema.safeParse({ logDate }).success, false);
  }
  assert.equal(createJobsiteLogSchema.safeParse({ ...base, logDate: "2024-02-29" }).success, true);
});

test("return and descriptive child lines reject whitespace-only text", () => {
  assert.equal(returnJobsiteLogSchema.safeParse({ returnNotes: " \n " }).success, false);
  assert.deepEqual(returnJobsiteLogSchema.parse({ returnNotes: " Revisar cantidad " }), {
    returnNotes: "Revisar cantidad",
  });
  assert.equal(updateJobsiteLogSchema.safeParse({
    materials: [{ description: " ", quantity: "1" }],
  }).success, false);
  assert.equal(updateJobsiteLogSchema.safeParse({
    issues: [{ type: "OTHER", severity: "LOW", description: " " }],
  }).success, false);
});

test("quantities, hours and workers fit the storage precision before saving", () => {
  const wbsNodeId = "11111111-1111-4111-8111-111111111111";
  assert.equal(updateJobsiteLogSchema.safeParse({
    progress: [{ wbsNodeId, quantityCompleted: "99999999999999.9999" }],
    labor: [{ workersCount: 2_147_483_647, hoursWorked: "999999.99" }],
  }).success, true);
  assert.equal(updateJobsiteLogSchema.safeParse({
    progress: [{ wbsNodeId, quantityCompleted: "99999999999999.99995" }],
  }).success, false);
  assert.equal(updateJobsiteLogSchema.safeParse({
    labor: [{ workersCount: 1, hoursWorked: "999999.995" }],
  }).success, false);
  assert.equal(updateJobsiteLogSchema.safeParse({
    labor: [{ workersCount: 2_147_483_648 }],
  }).success, false);
});

test("material with inventory links needs a quantity positive at four decimals", () => {
  const productId = "11111111-1111-4111-8111-111111111111";
  const warehouseId = "22222222-2222-4222-8222-222222222222";
  const linkedMaterial = { productId, warehouseId, description: "Cemento" };
  for (const quantity of ["mal", "0", "0.00004"]) {
    assert.equal(updateJobsiteLogSchema.safeParse({
      materials: [{ ...linkedMaterial, quantity }],
    }).success, false);
  }
  assert.equal(updateJobsiteLogSchema.safeParse({
    materials: [{ ...linkedMaterial, quantity: "0.00005" }],
  }).success, true);
  assert.equal(updateJobsiteLogSchema.safeParse({
    materials: [{ description: "Sin vínculos", quantity: "0" }],
  }).success, true);
});
