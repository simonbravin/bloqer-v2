import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@bloqer/database";
import { cashPositionAmounts, consolidateCashPositionArs } from "./cash-position-amounts";

const money = (amount: string) => new Prisma.Decimal(amount);

function movement(
  currency: string,
  amount: string,
  input: { type?: string; sourceType?: string; status?: string; amountArs?: string; fxRate?: string } = {},
) {
  return {
    currency,
    type: input.type ?? "INFLOW",
    status: input.status ?? "CONFIRMED",
    sourceType: input.sourceType ?? "MANUAL_ADJUSTMENT",
    _sum: { amount: money(amount), amountArs: input.amountArs == null ? null : money(input.amountArs) },
    _count: { _all: 1, amountArs: Number(input.amountArs != null), fxRate: Number(input.fxRate != null) },
    _min: { fxRate: input.fxRate == null ? null : money(input.fxRate) },
  };
}

test("historical ARS with mixed currency spelling keeps nominal opening and movements without a snapshot", () => {
  const position = cashPositionAmounts({ currency: " ars ", openingBalance: money("100") }, [
    movement("ARS", "10.03"),
    movement("ars ", "5", { type: "OUTFLOW", status: "RECONCILED" }),
  ]);
  assert.equal(position.balance.toFixed(2), "105.03");
  assert.equal(position.balanceArs?.toFixed(2), "105.03");
});

test("foreign snapshots reconcile across both transfer legs without double-counting opening", () => {
  const snapshot = { amountArs: "12601.23", fxRate: "1260.123456" };
  const source = cashPositionAmounts({ currency: "USD", openingBalance: money("10") }, [
    movement("USD", "10", { ...snapshot, sourceType: "OPENING_BALANCE" }),
    movement("USD", "10", { ...snapshot, type: "TRANSFER_OUT", status: "RECONCILED" }),
  ]);
  const destination = cashPositionAmounts({ currency: "USD", openingBalance: money("0") }, [
    movement("USD", "10", { ...snapshot, type: "TRANSFER_IN" }),
    movement("USD", "5", { status: "CANCELLED" }),
  ]);
  assert.equal(source.balance.toFixed(2), "0.00");
  assert.equal(source.balanceArs?.toFixed(2), "0.00");
  assert.equal(destination.balance.toFixed(2), "10.00");
  assert.equal(consolidateCashPositionArs([source, destination])?.toFixed(2), "12601.23");
});

test("foreign history without FX remains native and makes the full total unknown", () => {
  const withoutOpening = cashPositionAmounts({ currency: "USD", openingBalance: money("5") }, []);
  const withoutMovementFx = cashPositionAmounts({ currency: "EUR", openingBalance: money("0") }, [
    movement("EUR", "6", { amountArs: "6000" }),
  ]);
  assert.equal(withoutOpening.balance.toFixed(2), "5.00");
  assert.equal(withoutMovementFx.balance.toFixed(2), "6.00");
  assert.equal(withoutOpening.balanceArs, null);
  assert.equal(withoutMovementFx.balanceArs, null);
  assert.equal(consolidateCashPositionArs([{ balanceArs: money("1200") }, withoutMovementFx]), null);
});

test("negative foreign opening contributes as an outflow exactly once", () => {
  const position = cashPositionAmounts({ currency: "USD", openingBalance: money("-10") }, [
    movement("USD", "10", {
      type: "OUTFLOW", sourceType: "OPENING_BALANCE", amountArs: "12601.23", fxRate: "1260.123456",
    }),
  ]);
  assert.equal(position.balance.toFixed(2), "-10.00");
  assert.equal(position.balanceArs?.toFixed(2), "-12601.23");
});
