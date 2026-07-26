/**
 * Presentation helpers for APU lines in EDT detail / dialog ([D-059]).
 * Money for a line's partida contribution always uses stored totalCost × item qty.
 */

export type ApuDisplayLine = {
  coefficient: number;
  unitCost: number;
  totalCost: number;
  partidaQuantity: number | null;
  isLumpSum: boolean;
  /** Optional; unit `gl` still shows resource qty (1/N) — materials need is gated separately. */
  unit?: string | null;
};

function finiteOrZero(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/**
 * Legacy lump flag for qty display ([D-047] isLumpSum).
 * New globals use unit `gl` + resource qty (not this flag). UI shows "—" for lump kind.
 */
export function isLumpApuDisplay(line: Pick<ApuDisplayLine, "isLumpSum">): boolean {
  return line.isLumpSum === true;
}

export type ResourceQtyDisplay =
  | { kind: "resource"; qty: number }
  | { kind: "lump" };

/** Physical resource qty for UI; legacy lump never shows coef×itemQty as resource need. */
export function resourceQtyDisplay(line: ApuDisplayLine, itemQuantity: number): ResourceQtyDisplay {
  if (isLumpApuDisplay(line)) {
    return { kind: "lump" };
  }
  if (line.partidaQuantity != null && Number.isFinite(line.partidaQuantity)) {
    return { kind: "resource", qty: finiteOrZero(line.partidaQuantity) };
  }
  return {
    kind: "resource",
    qty: finiteOrZero(line.coefficient) * finiteOrZero(itemQuantity),
  };
}

/** Authoritative partida money for one APU line ([D-059] C1). */
export function linePartidaMoney(totalCost: number, itemQuantity: number): number {
  return finiteOrZero(totalCost) * finiteOrZero(itemQuantity);
}

export function lineUnitContribution(totalCost: number): number {
  return finiteOrZero(totalCost);
}
