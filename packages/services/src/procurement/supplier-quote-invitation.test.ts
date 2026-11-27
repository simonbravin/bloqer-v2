import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { supplierQuoteLinksEnabled } from "@bloqer/config";
import type { SupplierQuoteRequestSnapshot } from "@bloqer/validators";
import { assertQuoteInvitationOpen, newQuoteInvitationToken, quoteInvitationDigest, validateSupplierQuoteResponse } from "./supplier-quote-invitation-policy";

const snapshot: SupplierQuoteRequestSnapshot = { version: 1, companyName: "A", projectName: "Obra A", requestCode: "SC-001", supplierName: "Proveedor", lines: [
  { id: randomUUID(), description: "Material", quantity: "2.5", unit: "kg" },
  { id: randomUUID(), description: "Otro material", quantity: "1", unit: "u" },
] };
const response = () => ({ version: 1, currency: "ARS", pricesIncludeTax: false, iibbPerceptionRate: "0", leadTimeDays: 2, validUntil: "2050-01-01", notes: "", lines: snapshot.lines.map(line => ({ purchaseRequestLineId: line.id, offerKind: "QUOTED", unitPrice: "12.1234", taxRate: "21", discountPct: "0" })) });
test("supplier links are disabled unless explicitly true", () => {
  const previous = process.env.BLOQER_PROCUREMENT_SUPPLIER_LINKS_ENABLED;
  try {
    delete process.env.BLOQER_PROCUREMENT_SUPPLIER_LINKS_ENABLED; assert.equal(supplierQuoteLinksEnabled(), false);
    process.env.BLOQER_PROCUREMENT_SUPPLIER_LINKS_ENABLED = "false"; assert.equal(supplierQuoteLinksEnabled(), false);
    process.env.BLOQER_PROCUREMENT_SUPPLIER_LINKS_ENABLED = "true"; assert.equal(supplierQuoteLinksEnabled(), true);
  } finally { if (previous === undefined) delete process.env.BLOQER_PROCUREMENT_SUPPLIER_LINKS_ENABLED; else process.env.BLOQER_PROCUREMENT_SUPPLIER_LINKS_ENABLED = previous; }
});
test("tokens have 256 bits and the digest never stores the bearer", () => {
  const token = newQuoteInvitationToken(); assert.match(token, /^[a-f0-9]{64}$/); assert.notEqual(token, newQuoteInvitationToken());
  assert.match(quoteInvitationDigest(token), /^[a-f0-9]{64}$/); assert.notEqual(token, quoteInvitationDigest(token));
});
test("expiry is exclusive and revocation always denies access", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  assert.throws(() => assertQuoteInvitationOpen({ expiresAt: now, revokedAt: null }, now));
  assert.throws(() => assertQuoteInvitationOpen({ expiresAt: new Date(now.getTime() + 1), revokedAt: now }, now));
  assert.doesNotThrow(() => assertQuoteInvitationOpen({ expiresAt: new Date(now.getTime() + 1), revokedAt: null }, now));
});
test("accepts decimal prices and canonicalizes line order for retry idempotency", () => {
  const a = validateSupplierQuoteResponse(response(), snapshot);
  const reversed = response(); reversed.lines.reverse();
  assert.deepEqual(validateSupplierQuoteResponse(reversed, snapshot), a);
});
test("rejects foreign, duplicate, missing lines and injected scope fields", () => {
  const foreign = response(); foreign.lines[0]!.purchaseRequestLineId = randomUUID();
  const duplicate = response(); duplicate.lines[1] = duplicate.lines[0]!;
  const missing = response(); missing.lines.pop();
  for (const raw of [foreign, duplicate, missing, { ...response(), tenantId: randomUUID() }, { ...response(), companyId: randomUUID() }]) assert.throws(() => validateSupplierQuoteResponse(raw, snapshot));
});
test("requires explicit taxes and prevents zero from silently meaning a free offer", () => {
  const zero = response(); zero.lines.forEach(line => { line.unitPrice = "0"; });
  assert.throws(() => validateSupplierQuoteResponse(zero, snapshot));
  const partial = response(); partial.lines[1] = { ...partial.lines[1]!, offerKind: "NOT_QUOTED", unitPrice: "0" };
  assert.doesNotThrow(() => validateSupplierQuoteResponse(partial, snapshot));
  partial.lines[1]!.discountPct = "10"; assert.throws(() => validateSupplierQuoteResponse(partial, snapshot));
  const missingTax = response(); missingTax.lines[0]!.taxRate = ""; assert.throws(() => validateSupplierQuoteResponse(missingTax, snapshot));
});
