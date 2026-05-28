import { parentCodeFrom } from "./wbs-code-rules";

/** Último segmento numérico de un código (p. ej. "11.10" → 10). */
function lastNumericSegment(code: string): number | null {
  const parts = code.split(".");
  const last = parts[parts.length - 1];
  if (!last || !/^\d+$/.test(last)) return null;
  return parseInt(last, 10);
}

/** Hermanos directos (mismo padre, un solo segmento más). Excluye al padre (p. ej. "11"). */
function directSiblingCodes(code: string, priorCodes: string[]): string[] {
  const parent = parentCodeFrom(code);
  if (parent === undefined) {
    return priorCodes.filter((c) => !c.includes("."));
  }
  const prefix = `${parent}.`;
  return priorCodes.filter((c) => {
    if (!c.startsWith(prefix)) return false;
    const suffix = c.slice(prefix.length);
    return suffix.length > 0 && !suffix.includes(".");
  });
}

/**
 * Corrige duplicados típicos de Excel: tras 11.9 viene 11.1 (valor numérico de 11.10).
 * Solo aplica si el segmento duplicado es menor que el máximo ya visto bajo el mismo padre.
 */
export function suggestSequentialDuplicateFix(
  canonical: string,
  priorCodesInOrder: string[],
): string | null {
  const dupSeg = lastNumericSegment(canonical);
  if (dupSeg === null) return null;

  const siblings = directSiblingCodes(canonical, priorCodesInOrder);
  if (siblings.length === 0) return null;

  const maxSeg = Math.max(
    ...siblings.map((c) => lastNumericSegment(c)).filter((n): n is number => n !== null),
    -1,
  );
  if (maxSeg <= dupSeg) return null;

  const parts = canonical.split(".");
  parts[parts.length - 1] = String(maxSeg + 1);
  return parts.join(".");
}
