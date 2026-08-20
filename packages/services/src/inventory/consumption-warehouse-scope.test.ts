import assert from "node:assert/strict";
import { test } from "node:test";
import { consumptionWarehouseScopeConflict } from "./consumption-warehouse-scope";

test("allows shared product (null company) on a company warehouse", () => {
  assert.equal(
    consumptionWarehouseScopeConflict({
      warehouseCompanyId: "co-a",
      warehouseProjectId: null,
      productCompanyId: null,
      consumptionProjectId: "proj-1",
      projectCompanyId: "co-a",
    }),
    null,
  );
});

test("rejects product of another company", () => {
  assert.equal(
    consumptionWarehouseScopeConflict({
      warehouseCompanyId: "co-a",
      warehouseProjectId: null,
      productCompanyId: "co-b",
      consumptionProjectId: "proj-1",
      projectCompanyId: "co-a",
    }),
    "El producto no pertenece a la misma empresa que el depósito",
  );
});

test("rejects warehouse assigned to a different project", () => {
  assert.equal(
    consumptionWarehouseScopeConflict({
      warehouseCompanyId: "co-a",
      warehouseProjectId: "proj-other",
      productCompanyId: null,
      consumptionProjectId: "proj-1",
      projectCompanyId: "co-a",
    }),
    "El depósito está asignado a otra obra",
  );
});

test("rejects project-scoped warehouse when consumption has no project", () => {
  assert.equal(
    consumptionWarehouseScopeConflict({
      warehouseCompanyId: "co-a",
      warehouseProjectId: "proj-1",
      productCompanyId: null,
      consumptionProjectId: null,
      projectCompanyId: null,
    }),
    "El depósito está asignado a otra obra",
  );
});

test("rejects warehouse of another company than the project", () => {
  assert.equal(
    consumptionWarehouseScopeConflict({
      warehouseCompanyId: "co-a",
      warehouseProjectId: null,
      productCompanyId: null,
      consumptionProjectId: "proj-1",
      projectCompanyId: "co-b",
    }),
    "El depósito no pertenece a la misma empresa que la obra",
  );
});

test("allows company warehouse when project has no company yet", () => {
  assert.equal(
    consumptionWarehouseScopeConflict({
      warehouseCompanyId: "co-a",
      warehouseProjectId: null,
      productCompanyId: null,
      consumptionProjectId: "proj-1",
      projectCompanyId: null,
    }),
    null,
  );
});
