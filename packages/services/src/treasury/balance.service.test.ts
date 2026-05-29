import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@bloqer/database";
import { resolveOpeningBase } from "./balance.service";

test("resolveOpeningBase uses field when no OPENING_BALANCE movement", () => {
  assert.equal(resolveOpeningBase(new Prisma.Decimal(100), false).toString(), "100");
});

test("resolveOpeningBase zeroes field when OPENING_BALANCE movement exists", () => {
  assert.equal(resolveOpeningBase(new Prisma.Decimal(100), true).toString(), "0");
});
