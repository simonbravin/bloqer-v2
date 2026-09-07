/**
 * Document-level Percepción de Ingresos Brutos ([D-112]).
 * Default 3% (Mendoza ops); free-form editable rate — not a province catalog.
 * Keep value in sync with `@bloqer/utils` DEFAULT_IIBB_PERCEPTION_RATE_PCT.
 */

export const DEFAULT_IIBB_PERCEPTION_RATE_PCT = "3";

export const IIBB_PERCEPTION_LABEL_ES = "Percepción IIBB";

export const IIBB_PERCEPTION_HINT_ES =
  "Se calcula sobre el neto (subtotal), antes de IVA. Default 3% (típico Mendoza); cambiá la alícuota si aplica otra jurisdicción o poné 0% si no hay percepción.";
