/** In-app help center article model ([D-090]). Copy is es-AR; field names are English. */

export type HelpLevel = "company" | "project" | "both";

export type HelpModule =
  | "directorio"
  | "proyectos"
  | "presupuesto"
  | "cronograma"
  | "libro-obra"
  | "compras"
  | "materiales"
  | "subcontratos"
  | "certificaciones"
  | "finanzas"
  | "tesoreria"
  | "contabilidad"
  | "inventario"
  | "configuracion"
  | "general";

export type HelpIntent =
  | "cargar-contacto"
  | "cargar-proveedor"
  | "cargar-cliente"
  | "cargar-empleado"
  | "cargar-subcontratista"
  | "roles-contacto"
  | "crear-obra"
  | "equipo-obra"
  | "invitar-usuario"
  | "roles-permisos"
  | "politicas-compras"
  | "cuenta-tesoreria"
  | "transferencia"
  | "conciliacion"
  | "ajuste-caja"
  | "pago-bloqueado"
  | "presupuesto-edt-apu"
  | "aprobar-presupuesto"
  | "cronograma"
  | "libro-obra"
  | "documentos-obra"
  | "consumo-materiales"
  | "comprar-material"
  | "pedir-material"
  | "solicitud-compra"
  | "orden-compra"
  | "recepcion"
  | "factura-desde-oc"
  | "oc-directa"
  | "subcontrato"
  | "certificar-subcontrato"
  | "certificacion-cliente"
  | "facturar-certificacion"
  | "cobrar"
  | "ingreso-corporativo"
  | "ingreso-solo-caja"
  | "pagar-sueldo"
  | "reintegro"
  | "gasto-obra"
  | "gasto-corporativo"
  | "clase-documento"
  | "emitir-y-pagar"
  | "pagar-cxp"
  | "edt-costos"
  | "plan-cuentas"
  | "contabilizar"
  | "cerrar-mes"
  | "gastos-generales"
  | "errores-frecuentes"
  | "flujo-caja"
  | "movimientos-tesoreria"
  | "notificaciones"
  | "pendientes"
  | "reportes-contables"
  | "revertir-asiento"
  | "inventario"
  | "anticipo"
  | "configurar-empresa"
  | "afectaciones"
  | "dimensiones-avance"
  | "adenda-presupuesto"
  | "anular-documentos"
  | "rentabilidad"
  | "reportes-obra"
  | "presupuesto-vs-real"
  | "exportar-reportes"
  | "montos-decimales"
  | "registro-actividad"
  | "checklist-roles"
  | "limitaciones"
  | "puesta-marcha-contable"
  | "tablero-finanzas";

export type HelpHref =
  | { kind: "company"; path: string; label?: string }
  | { kind: "project"; suffix: string; label?: string };

export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  intents: HelpIntent[];
  modules: HelpModule[];
  level: HelpLevel;
  typicalRoles: string[];
  permissionHint?: string;
  where: { menu: string };
  hrefs: HelpHref[];
  steps: string[];
  effects?: string[];
  pitfalls?: string[];
  relatedSlugs: string[];
  keywords: string[];
  guideRef: string;
};

export const HELP_MODULE_LABELS: Record<HelpModule, string> = {
  directorio: "Directorio",
  proyectos: "Proyectos",
  presupuesto: "Presupuesto / EDT",
  cronograma: "Cronograma",
  "libro-obra": "Libro de obra",
  compras: "Compras",
  materiales: "Materiales",
  subcontratos: "Subcontratos",
  certificaciones: "Certificaciones",
  finanzas: "Finanzas",
  tesoreria: "Tesorería",
  contabilidad: "Contabilidad",
  inventario: "Inventario",
  configuracion: "Configuración",
  general: "General",
};

export const HELP_INTENT_LABELS: Partial<Record<HelpIntent, string>> = {
  "cargar-proveedor": "Cargar un proveedor",
  "cargar-cliente": "Cargar un cliente",
  "cargar-empleado": "Cargar un empleado",
  "pagar-sueldo": "Pagar sueldos",
  reintegro: "Reintegrar un gasto",
  "comprar-material": "Comprar material",
  "orden-compra": "Orden de compra / EDT",
  "pagar-cxp": "Pagar una cuenta por pagar",
  cobrar: "Cobrar",
  "crear-obra": "Crear una obra",
  "equipo-obra": "Equipo de obra",
  "certificacion-cliente": "Certificar al cliente",
  conciliacion: "Conciliar el banco",
  "edt-costos": "Ver EDT y costos",
  "errores-frecuentes": "Errores frecuentes",
  "flujo-caja": "Flujo de caja",
  "movimientos-tesoreria": "Movimientos de caja",
  contabilizar: "Contabilizar asientos",
  "cerrar-mes": "Cerrar el mes",
  "plan-cuentas": "Plan de cuentas",
  "gastos-generales": "Gastos generales",
  notificaciones: "Notificaciones",
  inventario: "Inventario",
  anticipo: "Anticipo / venta rápida",
  "reportes-contables": "Reportes contables",
  // Conceptual / niche intents stay on articles for search & related links,
  // but are omitted from filter chips to keep the UI scannable.
  "anular-documentos": "Anular / devolver / cancelar",
  rentabilidad: "Rentabilidad de obra",
  "reportes-obra": "Reportes de obra",
};
