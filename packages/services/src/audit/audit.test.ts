import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveAuditActionLabel,
  resolveAuditModuleForEntityType,
  entityTypesForAuditModule,
} from "@bloqer/domain";
import {
  decodeAuditLogCursor,
  encodeAuditLogCursor,
  extractAuditReference,
  formatAuditActorLabel,
  parseAuditReferenceFilter,
  parseAuditDateFrom,
  parseAuditDateToInclusive,
  isValidDateOnly,
  formatAuditLogExportFilterLine,
} from "./audit-display";
import { sanitizeAuditPayload } from "./audit-sanitize";
import { buildCsv } from "../report-exports/csv-export.service";
import {
  MAX_TENANT_AUDIT_LOG_EXPORT_ROWS,
  resolveTenantAuditLogExportFilters,
} from "./audit-read.service";
import { exportTenantAuditLogUrlFiltersSchema } from "@bloqer/validators";

describe("audit-catalog", () => {
  it("resolves module for purchase order entity type", () => {
    assert.equal(resolveAuditModuleForEntityType("PurchaseOrder"), "PROCUREMENT");
  });

  it("labels legacy and canonical purchase order actions", () => {
    assert.equal(resolveAuditActionLabel("PURCHASE_ORDER_ISSUED"), "Orden de compra emitida");
    assert.equal(resolveAuditActionLabel("purchase_order.issued"), "Orden de compra emitida");
  });

  it("lists entity types for AP module", () => {
    assert.ok(entityTypesForAuditModule("AP").includes("Payment"));
  });
});

describe("audit-display", () => {
  it("extracts document number from after payload", () => {
    assert.equal(extractAuditReference(null, { number: 142 }), "#142");
  });

  it("parses reference filter", () => {
    assert.equal(parseAuditReferenceFilter("#142"), 142);
    assert.equal(parseAuditReferenceFilter("abc"), null);
  });

  it("round-trips cursor encoding", () => {
    const createdAt = new Date("2026-01-15T10:00:00.000Z");
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const cursor = encodeAuditLogCursor(createdAt, id);
    const decoded = decodeAuditLogCursor(cursor);
    assert.equal(decoded?.id, id);
    assert.equal(decoded?.createdAt, createdAt.toISOString());
  });

  it("rejects invalid cursor payloads", () => {
    assert.equal(decodeAuditLogCursor("not-valid"), null);
    assert.equal(
      decodeAuditLogCursor(
        encodeAuditLogCursor(new Date(), "550e8400-e29b-41d4-a716-446655440000").slice(0, 8),
      ),
      null,
    );
  });

  it("formats actor labels", () => {
    assert.equal(formatAuditActorLabel(null, null, null), "Sistema");
    assert.equal(formatAuditActorLabel("uid", "Ana", "a@x.com"), "Ana");
    assert.equal(formatAuditActorLabel("uid", null, null), "Usuario desconocido");
  });

  it("parses inclusive UTC date range", () => {
    assert.equal(parseAuditDateFrom("2026-01-15").toISOString(), "2026-01-15T00:00:00.000Z");
    assert.equal(parseAuditDateToInclusive("2026-01-15").toISOString(), "2026-01-15T23:59:59.999Z");
    assert.equal(isValidDateOnly("2026-02-30"), false);
  });
});

describe("audit-sanitize", () => {
  it("strips secret keys and truncates strings", () => {
    const out = sanitizeAuditPayload({
      number: 1,
      apiKey: "secret",
      note: "x".repeat(500),
    }) as Record<string, unknown>;
    assert.equal(out.number, 1);
    assert.equal(out.apiKey, undefined);
    assert.ok(String(out.note).length <= 400);
  });
});

describe("audit-export", () => {
  it("caps export at 10_000 rows", () => {
    assert.equal(MAX_TENANT_AUDIT_LOG_EXPORT_ROWS, 10_000);
  });

  it("export URL schema omits pagination fields", () => {
    const parsed = exportTenantAuditLogUrlFiltersSchema.safeParse({
      module: "PROCUREMENT",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });
    assert.ok(parsed.success);
    assert.equal(parsed.data.module, "PROCUREMENT");
  });

  it("export URL schema ignores cursor query param", () => {
    const parsed = exportTenantAuditLogUrlFiltersSchema.safeParse({
      module: "AP",
      cursor: "invalid-cursor-should-be-stripped",
    });
    assert.ok(parsed.success);
    assert.equal("cursor" in parsed.data, false);
  });

  it("resolveTenantAuditLogExportFilters maps UTC date range", () => {
    const resolved = resolveTenantAuditLogExportFilters({
      dateFrom: "2026-01-15",
      dateTo: "2026-01-15",
    });
    assert.equal(resolved.dateFrom?.toISOString(), "2026-01-15T00:00:00.000Z");
    assert.equal(resolved.dateTo?.toISOString(), "2026-01-15T23:59:59.999Z");
  });

  it("extractAuditReference prefers after then before", () => {
    assert.equal(extractAuditReference({ number: 1 }, { number: 2 }), "#2");
    assert.equal(extractAuditReference({ number: 5 }, null), "#5");
  });

  it("buildCsv escapes formula injection in actor names", () => {
    const csv = buildCsv(["Usuario"], [["=cmd|calc"]]);
    assert.ok(csv.includes("'=cmd|calc"));
  });

  it("formatAuditLogExportFilterLine summarizes active filters", () => {
    const line = formatAuditLogExportFilterLine({
      module: "AP",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });
    assert.ok(line.includes("Cuentas a pagar"));
    assert.ok(line.includes("2026-01-01"));
  });
});
