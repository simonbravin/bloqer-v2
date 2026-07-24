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
};

function finiteOrZero(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lump / global monto for qty display: only the explicit flag ([D-047] totalKind=lump).
 * Legacy rows without `isLumpSum` keep coef×qty (ambiguous); re-save as Monto global to flag them.
 * Do not treat unit-mode "1 × precio / und. ítem" as lump (coef=1 + null partidaQuantity).
 */
export function isLumpApuDisplay(line: Pick<ApuDisplayLine, "isLumpSum">): boolean {
  return line.isLumpSum === true;
}

export type ResourceQtyDisplay =
  | { kind: "resource"; qty: number }
  | { kind: "lump" };

/** Physical resource qty for UI; lump/legacy never shows coef×itemQty as resource need. */
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
