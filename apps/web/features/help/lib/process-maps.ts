import { getHelpArticle } from "./catalog";
import type { HelpLevel } from "./types";

export type HelpProcessMapKind = "flow" | "lamina";

export type HelpProcessMap = {
  id: string;
  kind: HelpProcessMapKind;
  level: Extract<HelpLevel, "company" | "project">;
  title: string;
  summary: string;
  articleSlug: string;
  imageSrc: string;
  guideRef: string;
};

/** Visual process maps listed on /ayuda (plus the figure on each article). */
export const HELP_PROCESS_MAPS: readonly HelpProcessMap[] = [
  {
    id: "sueldo-si-no",
    kind: "flow",
    level: "company",
    title: "Pagar un sueldo",
    summary: "Empleado en Directorio → gasto → pagar ahora o CxP.",
    articleSlug: "pagar-un-sueldo",
    imageSrc: "/help/mapa-flujo-sueldo-si-no.png",
    guideRef: "§12.2.1",
  },
  {
    id: "gasto-empresa-si-no",
    kind: "flow",
    level: "company",
    title: "Costo de empresa",
    summary: "Alquiler y estructura: sin obra. Si es de partida, no es este camino.",
    articleSlug: "gasto-corporativo",
    imageSrc: "/help/mapa-flujo-gasto-empresa-si-no.png",
    guideRef: "§12.2 · §14",
  },
  {
    id: "compra-si-no",
    kind: "flow",
    level: "project",
    title: "Compra: si esto, entonces aquello",
    summary: "El caminito: qué sigue si sí y qué pasa si no.",
    articleSlug: "circuito-comprar-material-hasta-pagarlo",
    imageSrc: "/help/mapa-flujo-compras-si-no.png",
    guideRef: "§9",
  },
  {
    id: "costo-obra-si-no",
    kind: "flow",
    level: "project",
    title: "Costo de obra",
    summary: "Gasto directo con EDT. No es OC ni subcontrato.",
    articleSlug: "gasto-de-obra-sin-oc",
    imageSrc: "/help/mapa-flujo-costo-obra-si-no.png",
    guideRef: "§12.2",
  },
  {
    id: "subcontrato-si-no",
    kind: "flow",
    level: "project",
    title: "Subcontrato: si esto, entonces aquello",
    summary: "Certificar → aprobar → factura → CxP → pagar.",
    articleSlug: "certificar-y-pagar-subcontrato",
    imageSrc: "/help/mapa-flujo-subcontrato-si-no.png",
    guideRef: "§10",
  },
  {
    id: "certificar-cobrar-si-no",
    kind: "flow",
    level: "project",
    title: "Certificar y cobrar",
    summary: "Aprobar no cobra. Emitir factura → CxC → cobrar.",
    articleSlug: "facturar-una-certificacion",
    imageSrc: "/help/mapa-flujo-certificar-cobrar-si-no.png",
    guideRef: "§11 · §12.1",
  },
  {
    id: "puesta-en-marcha",
    kind: "lamina",
    level: "company",
    title: "Puesta en marcha",
    summary: "Directorio, tesorería, contabilidad y primera obra activa.",
    articleSlug: "crear-y-activar-una-obra",
    imageSrc: "/help/mapa-puesta-en-marcha.png",
    guideRef: "§0.1 · §5.1",
  },
  {
    id: "pago-corporativo",
    kind: "lamina",
    level: "company",
    title: "Pagar desde la empresa (lámina)",
    summary: "Sueldo, reintegro o gasto: factura → CxP → caja.",
    articleSlug: "pagar-un-sueldo",
    imageSrc: "/help/mapa-pago-corporativo.png",
    guideRef: "§12.2",
  },
  {
    id: "tesoreria-conciliacion",
    kind: "lamina",
    level: "company",
    title: "Tesorería y conciliación",
    summary: "Extracto por cuenta y empareje con el banco.",
    articleSlug: "conciliar-el-banco",
    imageSrc: "/help/mapa-tesoreria-conciliacion.png",
    guideRef: "§4.2",
  },
  {
    id: "cerrar-el-mes",
    kind: "lamina",
    level: "company",
    title: "Cerrar el mes",
    summary: "Contabilizar → conciliar → cerrar el período.",
    articleSlug: "cerrar-el-mes",
    imageSrc: "/help/mapa-cerrar-el-mes.png",
    guideRef: "§15.3",
  },
  {
    id: "presupuesto-edt",
    kind: "lamina",
    level: "project",
    title: "Presupuesto y EDT",
    summary: "Armar, enviar, aprobar o devolver. Insumos en el APU.",
    articleSlug: "aprobar-el-presupuesto",
    imageSrc: "/help/mapa-presupuesto-edt.png",
    guideRef: "§6",
  },
  {
    id: "compra-sc-oc",
    kind: "lamina",
    level: "project",
    title: "Circuito de compra (lámina)",
    summary: "SC → cotización → OC → recepción → factura → pago, con roles.",
    articleSlug: "circuito-comprar-material-hasta-pagarlo",
    imageSrc: "/help/mapa-circuito-compra-sc-oc.png",
    guideRef: "§9",
  },
  {
    id: "subcontrato",
    kind: "lamina",
    level: "project",
    title: "Subcontrato hasta el pago (lámina)",
    summary: "Certificar el paquete → factura AP → CxP → pagar.",
    articleSlug: "certificar-y-pagar-subcontrato",
    imageSrc: "/help/mapa-subcontrato.png",
    guideRef: "§10",
  },
  {
    id: "certificar-cobrar",
    kind: "lamina",
    level: "project",
    title: "Certificar, facturar y cobrar (lámina)",
    summary: "Avance al cliente → factura de venta → CxC → cobranza.",
    articleSlug: "facturar-una-certificacion",
    imageSrc: "/help/mapa-certificar-cobrar.png",
    guideRef: "§11 · §12.1",
  },
];

export function listHelpProcessMaps(
  level?: HelpProcessMap["level"],
  kind?: HelpProcessMapKind,
): HelpProcessMap[] {
  return HELP_PROCESS_MAPS.filter((m) => {
    if (level && m.level !== level) return false;
    if (kind && m.kind !== kind) return false;
    return getHelpArticle(m.articleSlug) != null;
  });
}

export const HELP_PROCESS_MAP_LEVEL_LABEL: Record<HelpProcessMap["level"], string> = {
  company: "Empresa",
  project: "Obra",
};

export const HELP_PROCESS_MAP_KIND_LABEL: Record<HelpProcessMapKind, string> = {
  flow: "Caminito",
  lamina: "Lámina",
};
