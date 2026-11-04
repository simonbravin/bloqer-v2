import assert from "node:assert/strict";
import { test } from "node:test";
import { createProjectSchema, listProjectsSchema, updateProjectSchema } from "./project";

const validProject = {
  code: "OB-1", name: "Obra", type: "PRIVATE",
  clientContactId: "00000000-0000-0000-0000-000000000001",
};

test("missing and invalid client selections report an actionable Spanish field error", () => {
  for (const clientContactId of [undefined, "", "invalid", null]) {
    const result = createProjectSchema.safeParse({ code: "OB-1", name: "Obra", type: "PRIVATE", clientContactId });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues.find((issue) => issue.path[0] === "clientContactId")?.message, "Seleccioná un cliente válido");
    }
  }
});

test("project dates reject impossible values instead of silently dropping them", () => {
  for (const date of ["invalid", "2026-02-30", "2026-13-01", new Date("invalid"), 123]) {
    for (const field of ["startDate", "expectedEndDate"]) {
      for (const schema of [createProjectSchema, updateProjectSchema]) {
        const result = schema.safeParse({ ...validProject, [field]: date });
        assert.equal(result.success, false, `${field}: ${String(date)}`);
        if (!result.success) {
          assert.equal(result.error.issues.find((issue) => issue.path[0] === field)?.message, "Ingresá una fecha válida");
        }
      }
    }
  }
});

test("empty or null dates clear nullable values while omitted dates remain omitted", () => {
  for (const schema of [createProjectSchema, updateProjectSchema]) {
    const omitted = schema.parse(validProject);
    assert.equal(omitted.startDate, undefined);
    assert.equal(omitted.expectedEndDate, undefined);
    const cleared = schema.parse({ ...validProject, startDate: "", expectedEndDate: null });
    assert.equal(cleared.startDate, null);
    assert.equal(cleared.expectedEndDate, null);
    const dated = schema.parse({ ...validProject, startDate: "2026-02-28", expectedEndDate: "2026-02-28" });
    assert.equal(dated.startDate?.toISOString(), "2026-02-28T00:00:00.000Z");
  }
});

test("both project forms attach reversed date ranges to the end-date field", () => {
  for (const schema of [createProjectSchema, updateProjectSchema]) {
    const result = schema.safeParse({ ...validProject, startDate: "2026-03-01", expectedEndDate: "2026-02-28" });
    assert.equal(result.success, false);
    if (!result.success) assert.deepEqual(result.error.issues[0]?.path, ["expectedEndDate"]);
  }
});

test("project pagination rejects non-finite, fractional and unsafe offsets", () => {
  for (const page of [NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER]) {
    assert.equal(listProjectsSchema.safeParse({ page }).success, false, String(page));
  }
  assert.equal(listProjectsSchema.safeParse({ page: 1, pageSize: 101 }).success, false);
  assert.equal(listProjectsSchema.safeParse({ page: 2, pageSize: 100 }).success, true);
});
