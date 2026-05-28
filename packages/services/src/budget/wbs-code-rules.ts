import type { WbsNodeType } from "@bloqer/database";

/** Profundidad simple: capítulo → subcapítulo → ítem (1.1.1). */
export const WBS_MAX_CODE_SEGMENTS_SIMPLE = 3;

/** Profundidad multi-rubro: rubro → capítulo → subcapítulo → ítem (ARQ.1.1.1). */
export const WBS_MAX_CODE_SEGMENTS_MULTI = 4;

export type WbsImportProfile = "simple" | "multi_discipline";

const NUMERIC_CODE = /^\d+(\.\d+)*$/;
const DISCIPLINE_PREFIX = /^[A-Za-z]{2,8}$/;
const CELL_PREFIX_NUM = /^([A-Za-zÁÉÍÓÚ]{2,8})\s+(\d+(?:\.\d+)*)$/u;
const CELL_BANNER = /^[A-Za-zÁÉÍÓÚ]{2,8}$/u;

export function countCodeSegments(code: string): number {
  return code.split(".").filter((s) => s.length > 0).length;
}

/** Primer segmento alfabético (ARQ) vs numérico (1). */
export function isMultiStyleCode(code: string): boolean {
  const first = code.split(".")[0] ?? "";
  return DISCIPLINE_PREFIX.test(first);
}

export function maxCodeSegmentsForProfile(profile: WbsImportProfile): number {
  return profile === "multi_discipline" ? WBS_MAX_CODE_SEGMENTS_MULTI : WBS_MAX_CODE_SEGMENTS_SIMPLE;
}

export function maxCodeSegmentsForCode(code: string): number {
  return isMultiStyleCode(code) ? WBS_MAX_CODE_SEGMENTS_MULTI : WBS_MAX_CODE_SEGMENTS_SIMPLE;
}

export function isDisciplineRootCode(code: string): boolean {
  return DISCIPLINE_PREFIX.test(code);
}

export type ParsedCellA =
  | { kind: "empty" }
  | { kind: "banner"; discipline: string; name: string }
  | { kind: "numbered"; discipline: string | null; numeric: string; canonical: string };

export function parseCellA(colA: unknown, colB: unknown): ParsedCellA {
  if (colA == null || String(colA).trim() === "") return { kind: "empty" };

  let raw: string;
  if (typeof colA === "number" && Number.isFinite(colA)) {
    raw = Number.isInteger(colA) ? String(colA) : String(colA);
  } else {
    raw = String(colA).trim();
  }

  const bannerMatch = raw.match(CELL_BANNER);
  if (bannerMatch) {
    const discipline = bannerMatch[0]!.toUpperCase();
    const name = String(colB ?? "").trim() || discipline;
    return { kind: "banner", discipline, name };
  }

  const numMatch = raw.match(CELL_PREFIX_NUM);
  if (numMatch) {
    const discipline = numMatch[1]!.toUpperCase();
    const numeric = numMatch[2]!;
    if (!NUMERIC_CODE.test(numeric)) return { kind: "empty" };
    return {
      kind: "numbered",
      discipline,
      numeric,
      canonical: `${discipline}.${numeric}`,
    };
  }

  if (NUMERIC_CODE.test(raw)) {
    return { kind: "numbered", discipline: null, numeric: raw, canonical: raw };
  }

  return { kind: "empty" };
}

/** Detecta si el archivo usa varios rubros con numeración repetida (ARQ 1, EST 1, …). */
export function detectImportProfile(
  numbered: { discipline: string | null; numeric: string }[],
): WbsImportProfile {
  const prefixes = new Set<string>();
  const numericToPrefixes = new Map<string, Set<string>>();

  for (const row of numbered) {
    if (!row.discipline) continue;
    prefixes.add(row.discipline);
    if (!numericToPrefixes.has(row.numeric)) numericToPrefixes.set(row.numeric, new Set());
    numericToPrefixes.get(row.numeric)!.add(row.discipline);
  }

  if (prefixes.size >= 2) return "multi_discipline";

  for (const ps of numericToPrefixes.values()) {
    if (ps.size >= 2) return "multi_discipline";
  }

  return "simple";
}

export function inferNodeType(
  canonicalCode: string,
  unit: string | undefined,
  profile: WbsImportProfile,
): WbsNodeType {
  const segments = countCodeSegments(canonicalCode);
  const hasUnit = Boolean(unit?.trim());

  if (profile === "multi_discipline") {
    if (hasUnit) return "ITEM";
    if (segments >= 4) return "ITEM";
    return "GROUP";
  }

  if (hasUnit) return "ITEM";
  if (segments >= 3) return "ITEM";
  return "GROUP";
}

export function validateCanonicalCode(
  canonicalCode: string,
  type: WbsNodeType,
  unit: string | undefined,
  profile: WbsImportProfile,
): string | null {
  const segments = countCodeSegments(canonicalCode);
  const max = maxCodeSegmentsForProfile(profile);

  if (segments > max) {
    return `El código "${canonicalCode}" supera ${max} niveles`;
  }

  if (profile === "multi_discipline") {
    if (!isMultiStyleCode(canonicalCode)) {
      return `En presupuestos multi-rubro el código debe incluir prefijo (p. ej. ARQ.1.1)`;
    }
    if (type === "GROUP" && segments > 3) {
      return `El capítulo "${canonicalCode}" supera la profundidad de grupo`;
    }
    if (type === "ITEM" && segments < 2) {
      return `El ítem "${canonicalCode}" debe incluir capítulo (p. ej. ARQ.1.1)`;
    }
    if (type === "GROUP" && segments >= 4) {
      return `El código "${canonicalCode}" con 4 segmentos requiere unidad para ser ítem`;
    }
    return null;
  }

  if (isMultiStyleCode(canonicalCode)) {
    return `Código "${canonicalCode}" no es válido en modo simple`;
  }
  if (type === "ITEM" && segments < 2) {
    return `El ítem "${canonicalCode}" debe estar bajo un capítulo (p. ej. 1.1)`;
  }
  if (type === "GROUP" && segments > 2) {
    return `El código "${canonicalCode}" requiere unidad en columna C para ser ítem hoja`;
  }
  return null;
}

/** Reglas para addWbsNode (manual). */
export function validateManualNodeCode(
  code: string,
  type: WbsNodeType,
  parentCode: string | null,
): string | null {
  const max = parentCode ? maxCodeSegmentsForCode(parentCode) : maxCodeSegmentsForCode(code);
  const segments = countCodeSegments(code);

  if (segments > max) {
    return `El código "${code}" supera la profundidad máxima de ${max} niveles`;
  }

  const multi = isMultiStyleCode(code) || (parentCode != null && isMultiStyleCode(parentCode));

  if (multi) {
    if (type === "GROUP" && segments > 3) {
      return "Los capítulos solo pueden estar hasta el nivel subcapítulo (p. ej. ARQ.1.1)";
    }
    if (type === "ITEM" && segments < 2) {
      return "Los ítems deben tener al menos dos segmentos (p. ej. ARQ.1.1)";
    }
    if (parentCode) {
      const pSegs = countCodeSegments(parentCode);
      if (type === "GROUP" && pSegs >= 3) {
        return "Los subcapítulos solo se pueden crear bajo un capítulo o rubro";
      }
      if (type === "ITEM" && pSegs >= WBS_MAX_CODE_SEGMENTS_MULTI) {
        return "No se pueden agregar ítems a este nivel de profundidad";
      }
    }
    return null;
  }

  if (type === "GROUP" && segments > 2) {
    return "Los capítulos solo pueden estar en el nivel 1 o 2";
  }
  if (type === "ITEM" && segments < 2) {
    return "Los ítems deben tener al menos dos segmentos en el código (p. ej. 1.1)";
  }
  if (parentCode) {
    const pSegs = countCodeSegments(parentCode);
    if (type === "GROUP" && pSegs !== 1) {
      return "Los subcapítulos solo se pueden crear bajo un capítulo raíz";
    }
    if (type === "ITEM" && pSegs >= WBS_MAX_CODE_SEGMENTS_SIMPLE) {
      return "No se pueden agregar ítems a este nivel de profundidad";
    }
  }
  return null;
}

export function parentCodeFrom(canonicalCode: string): string | undefined {
  const idx = canonicalCode.lastIndexOf(".");
  if (idx === -1) return undefined;
  return canonicalCode.slice(0, idx);
}
