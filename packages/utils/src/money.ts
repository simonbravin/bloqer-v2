/** Business-scale decimals for operational money ([D-053] / MONEY_MODEL). */
export const MONEY_DECIMALS = 2;
/** Exchange rate scale (matches Prisma Decimal(18,6)). */
export const FX_DECIMALS = 6;
/** Inventory / computation quantities. */
export const QTY_DECIMALS = 4;
/** Tax / overhead / profit percentages. */
export const RATE_PCT_DECIMALS = 4;

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("INVALID_DECIMALS");
  }
}

/** Normalize input to a plain decimal string (no exponent). */
export function normalizeDecimalString(raw: string | number): string {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) throw new Error("INVALID_AMOUNT");
    // Avoid scientific notation for typical money magnitudes.
    const s = raw.toString();
    if (!/[eE]/.test(s)) return s;
    return expandScientific(s);
  }
  const s = raw.trim();
  if (!s) throw new Error("INVALID_AMOUNT");
  if (/[eE]/.test(s)) return expandScientific(s);
  if (!DECIMAL_RE.test(s)) throw new Error("INVALID_AMOUNT");
  return s;
}

function expandScientific(s: string): string {
  const m = s.match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!m) throw new Error("INVALID_AMOUNT");
  const sign = m[1] === "-" ? "-" : "";
  const intPart = m[2] ?? "0";
  const fracPart = m[3] ?? "";
  const exp = Number(m[4]);
  const digits = intPart + fracPart;
  const point = intPart.length + exp;
  if (point <= 0) {
    return `${sign}0.${"0".repeat(-point)}${digits}`.replace(/0+$/, "") || `${sign}0`;
  }
  if (point >= digits.length) {
    return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  }
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * Half-up round to `decimals` fractional digits. Returns a normalized string
 * always including exactly `decimals` places (e.g. `"100.00"`).
 */
export function roundToDecimals(raw: string | number, decimals: number): string {
  assertDecimals(decimals);
  let s = normalizeDecimalString(raw);
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);

  // Strip leading zeros but keep a single zero.
  s = s.replace(/^0+(?=\d)/, "");
  if (s.startsWith(".")) s = `0${s}`;
  if (s === "" || s === ".") s = "0";

  const [intRaw, fracRaw = ""] = s.split(".");
  const intPart = !intRaw || intRaw === "" ? "0" : intRaw;
  const padded = fracRaw.padEnd(decimals + 1, "0");
  const keep = padded.slice(0, decimals);
  const nextDigit = padded.charAt(decimals);

  let intBig = BigInt(intPart);
  let fracBig = BigInt(keep || "0");

  if (nextDigit >= "5") {
    const bump = BigInt(1);
    if (decimals === 0) {
      intBig += bump;
    } else {
      fracBig += bump;
      const limit = BigInt(10) ** BigInt(decimals);
      if (fracBig >= limit) {
        fracBig -= limit;
        intBig += BigInt(1);
      }
    }
  }

  const fracStr = decimals === 0 ? "" : fracBig.toString().padStart(decimals, "0");
  const body = decimals === 0 ? `${intBig}` : `${intBig}.${fracStr}`;
  if (negative && (intBig !== BigInt(0) || fracBig !== BigInt(0))) return `-${body}`;
  return body;
}

/** Round operational money to 2 dp (half-up). */
export function roundMoney(raw: string | number, decimals: number = MONEY_DECIMALS): string {
  return roundToDecimals(raw, decimals);
}

/** Alias — ARS reporting amounts use the same 2 dp rule. */
export function roundAmountArs(raw: string | number): string {
  return roundToDecimals(raw, MONEY_DECIMALS);
}

export function roundFxRate(raw: string | number): string {
  return roundToDecimals(raw, FX_DECIMALS);
}

export function roundQty(raw: string | number): string {
  return roundToDecimals(raw, QTY_DECIMALS);
}

export function roundRatePct(raw: string | number): string {
  return roundToDecimals(raw, RATE_PCT_DECIMALS);
}

/** Always exactly 2 fractional digits for DTO / display boundary. */
export function serializeMoney(raw: string | number): string {
  return roundToDecimals(raw, MONEY_DECIMALS);
}

/** Multiply two decimal strings exactly (BigInt), return unrounded product string. */
export function multiplyDecimal(a: string | number, b: string | number): string {
  const as = normalizeDecimalString(a);
  const bs = normalizeDecimalString(b);
  const aNeg = as.startsWith("-");
  const bNeg = bs.startsWith("-");
  const aAbs = aNeg ? as.slice(1) : as;
  const bAbs = bNeg ? bs.slice(1) : bs;

  const [aInt, aFrac = ""] = aAbs.split(".");
  const [bInt, bFrac = ""] = bAbs.split(".");
  const aScale = aFrac.length;
  const bScale = bFrac.length;
  const aDigits = BigInt(aInt + aFrac);
  const bDigits = BigInt(bInt + bFrac);
  const product = aDigits * bDigits;
  const scale = aScale + bScale;
  const sign = aNeg !== bNeg ? "-" : "";

  if (product === BigInt(0)) return "0";

  if (scale === 0) return `${sign}${product.toString()}`;

  const digits = product.toString().padStart(scale + 1, "0");
  const split = digits.length - scale;
  const intPart = digits.slice(0, split).replace(/^0+(?=\d)/, "") || "0";
  const fracPart = digits.slice(split);
  return `${sign}${intPart}.${fracPart}`;
}

/** Add two decimal strings exactly (unrounded). */
export function addDecimal(a: string | number, b: string | number): string {
  const as = normalizeDecimalString(a);
  const bs = normalizeDecimalString(b);
  const aNeg = as.startsWith("-");
  const bNeg = bs.startsWith("-");
  const aAbs = aNeg ? as.slice(1) : as;
  const bAbs = bNeg ? bs.slice(1) : bs;
  const [, aFrac = ""] = aAbs.split(".");
  const [, bFrac = ""] = bAbs.split(".");
  const scale = Math.max(aFrac.length, bFrac.length);
  const aScaled = toScaledBigInt(as, scale);
  const bScaled = toScaledBigInt(bs, scale);
  return fromScaledBigInt(aScaled + bScaled, scale);
}

function toScaledBigInt(raw: string, scale: number): bigint {
  const neg = raw.startsWith("-");
  const abs = neg ? raw.slice(1) : raw;
  const [intPart, fracPart = ""] = abs.split(".");
  const frac = fracPart.padEnd(scale, "0").slice(0, scale);
  const digits = BigInt((intPart || "0") + frac);
  return neg ? -digits : digits;
}

function fromScaledBigInt(value: bigint, scale: number): string {
  const neg = value < BigInt(0);
  let abs = neg ? -value : value;
  if (scale === 0) return `${neg ? "-" : ""}${abs.toString()}`;
  const digits = abs.toString().padStart(scale + 1, "0");
  const split = digits.length - scale;
  const intPart = digits.slice(0, split).replace(/^0+(?=\d)/, "") || "0";
  const fracPart = digits.slice(split);
  return `${neg ? "-" : ""}${intPart}.${fracPart}`;
}

/** Divide `numerator / denominator` with half-up to `decimals` (default money 2).
 * Single half-up from remainder — do not pre-round an extra guard digit.
 */
export function divideDecimal(
  numerator: string | number,
  denominator: string | number,
  decimals: number = MONEY_DECIMALS,
): string {
  assertDecimals(decimals);
  const n = normalizeDecimalString(numerator);
  const d = normalizeDecimalString(denominator);
  if (/^-?0+(\.0+)?$/.test(d)) throw new Error("DIVISION_BY_ZERO");

  const nNeg = n.startsWith("-");
  const dNeg = d.startsWith("-");
  const nAbs = nNeg ? n.slice(1) : n;
  const dAbs = dNeg ? d.slice(1) : d;
  const [, nFrac = ""] = nAbs.split(".");
  const [, dFrac = ""] = dAbs.split(".");
  const nScale = nFrac.length;
  const dScale = dFrac.length;
  const nDigits = BigInt(nAbs.replace(".", "") || "0");
  const dDigits = BigInt(dAbs.replace(".", "") || "0");
  const pow = (e: number) => BigInt(10) ** BigInt(Math.max(e, 0));

  // quot = floor(n/d * 10^decimals); half-up from remainder once.
  const num = nDigits * pow(dScale + decimals);
  const den = dDigits * pow(nScale);
  let quot = num / den;
  const rem = num % den;
  if (rem * BigInt(2) >= den) quot += BigInt(1);

  const sign = nNeg !== dNeg ? "-" : "";
  const body = fromScaledBigInt(quot, decimals);
  if (sign && body !== "0" && !/^0+(\.0+)?$/.test(body) && !body.startsWith("-")) {
    return `${sign}${body}`;
  }
  return body;
}
