import {
  FISCAL_DOCUMENT_KIND_LABELS,
  isFiscalDocumentKind,
  type FiscalDocumentKindCode,
} from "@bloqer/domain";

export type FiscalListEmptyCopy = {
  title: string;
  description: string;
  showCancelledCta: boolean;
};

/**
 * Empty-state copy for invoice / NC / ND listados ([D-115]).
 * When `kind` is set, nouns match Tipo de documento instead of generic "facturas".
 */
export function fiscalDocumentListEmptyCopy(opts: {
  kind?: string | null;
  hasExtraFilters: boolean;
  /** DRAFT | ISSUED | CANCELLED | undefined (= activas) */
  status?: string;
  /** When false (e.g. AR listado sin chip Anuladas), no sugerir revisar anuladas. */
  cancelledTabAvailable?: boolean;
}): FiscalListEmptyCopy {
  const kind: FiscalDocumentKindCode | undefined = isFiscalDocumentKind(opts.kind)
    ? opts.kind
    : undefined;
  const singular =
    kind === "CREDIT_NOTE"
      ? "nota de crédito"
      : kind === "DEBIT_NOTE"
        ? "nota de débito"
        : "factura";
  const plural =
    kind === "CREDIT_NOTE"
      ? "notas de crédito"
      : kind === "DEBIT_NOTE"
        ? "notas de débito"
        : "facturas";
  const kindLabel = kind ? FISCAL_DOCUMENT_KIND_LABELS[kind] : null;
  const cancelledTab = opts.cancelledTabAvailable !== false;

  if (!opts.status) {
    return {
      title: opts.hasExtraFilters
        ? `No hay ${plural} activas con estos filtros`
        : kindLabel
          ? `No hay ${plural} activas`
          : "No hay facturas activas",
      description: opts.hasExtraFilters
        ? kindLabel
          ? cancelledTab
            ? `Probá otra búsqueda o quitá el filtro de tipo (${kindLabel}). También podés revisar Anuladas.`
            : `Probá otra búsqueda o quitá el filtro de tipo (${kindLabel}).`
          : cancelledTab
            ? "Probá otra búsqueda, clase o tipo. También podés revisar Anuladas."
            : "Probá otra búsqueda, clase o tipo de documento."
        : kindLabel
          ? cancelledTab
            ? `No hay ${plural} en estado activo. Probá Anuladas o quitá el filtro de tipo.`
            : `No hay ${plural}. Quitá el filtro de tipo o registrá una nueva.`
          : cancelledTab
            ? "Usá Anuladas para ver las anuladas, o registrá una nueva."
            : "Registrá la primera manualmente o desde una certificación aprobada.",
      showCancelledCta: cancelledTab,
    };
  }

  if (opts.status === "CANCELLED") {
    return {
      title: opts.hasExtraFilters
        ? `No hay ${plural} anuladas con estos filtros`
        : `No hay ${plural} anuladas`,
      description: opts.hasExtraFilters
        ? "Probá otra búsqueda, clase o tipo de documento."
        : `No hay ${singular} anulada.`,
      showCancelledCta: false,
    };
  }

  return {
    title: `No hay ${plural} con los filtros actuales`,
    description: kindLabel
      ? `Probá otro estado o quitá el filtro «${kindLabel}».`
      : "Probá otro estado, búsqueda, clase o tipo de documento.",
    showCancelledCta: false,
  };
}
