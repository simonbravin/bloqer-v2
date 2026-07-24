import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { userDisplayNameFromMap } from "./resolve-user-display-names";

describe("userDisplayNameFromMap", () => {
  it("returns null when there is no actor id", () => {
    const map = new Map([["u1", "Ana"]]);
    assert.equal(userDisplayNameFromMap(map, null), null);
    assert.equal(userDisplayNameFromMap(map, undefined), null);
    assert.equal(userDisplayNameFromMap(map, ""), null);
  });

  it("returns the resolved label when present", () => {
    const map = new Map([["u1", "Ana Pérez"]]);
    assert.equal(userDisplayNameFromMap(map, "u1"), "Ana Pérez");
  });

  it("falls back to unknown when id exists but is missing from the map", () => {
    const map = new Map<string, string>();
    assert.equal(userDisplayNameFromMap(map, "missing"), "Usuario desconocido");
  });
});
