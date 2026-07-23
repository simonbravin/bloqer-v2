import { isUuid } from "@bloqer/utils";
import { isProjectIdSegment } from "./project-route";

export type ShellBreadcrumbItem = {
  label: string;
  href?: string;
};

/** Static URL segment → Spanish label (canonical nav wording). */
const PATH_SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Inicio",
  proyectos: "Proyectos",
  nuevo: "Nuevo",
  nueva: "Nueva",
  editar: "Editar",
  finanzas: "Finanzas",
  transacciones: "Transacciones",
  "facturas-proveedor": "Facturas y gastos",
  "cuentas-por-cobrar": "Cuentas por cobrar",
  "cuentas-por-pagar": "Cuentas por pagar",
  "gastos-generales": "Imputación GG",
  "pagos-proveedor": "Pagos a proveedor",
  tesoreria: "Tesorería",
  cuentas: "Cuentas",
  transferencias: "Transferencias",
  reportes: "Reportes",
  "flujo-caja": "Flujo de caja",
  movimientos: "Movimientos",
  stock: "Stock",
  contabilidad: "Contabilidad",
  asientos: "Asientos",
  reglas: "Reglas",
  inventario: "Inventario",
  productos: "Productos",
  depositos: "Depósitos",
  directorio: "Directorio",
  configuracion: "Configuración",
  perfil: "Mi perfil",
  equipo: "Equipo",
  permisos: "Permisos",
  registro: "Registro",
  invitaciones: "Invitaciones",
  invitar: "Invitar",
  notificaciones: "Notificaciones",
  presupuestos: "Presupuesto",
  cronograma: "Cronograma",
  "control-costos": "EDT y costos",
  "libro-obra": "Libro de obra",
  certificaciones: "Certificaciones",
  documentos: "Documentos",
  "solicitudes-compra": "Solicitudes de compra",
  "ordenes-compra": "Órdenes de compra",
  subcontratos: "Subcontratos",
  facturas: "Facturas emitidas",
  cobranzas: "Cobranzas",
  pagos: "Pagos",
  recepciones: "Recepciones",
  consumos: "Consumos",
  cobrar: "Registrar cobro",
  pagar: "Registrar pago",
  anticipo: "Anticipo",
  "presupuesto-vs-real": "Presupuesto vs real",
  "ingresos-gastos": "Ingresos vs gastos",
  rentabilidad: "Rentabilidad",
  materiales: "Materiales",
  programados: "Envíos programados",
  caja: "Caja",
  users: "Usuarios",
  modules: "Módulos",
  settings: "Suscripción",
  invitations: "Invitaciones",
  tenants: "Organizaciones",
  platform: "Plataforma",
  vencimientos: "Vencimientos",
  new: "Nueva",
};

function humanizeSegment(segment: string): string {
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function labelForSegment(segment: string): string {
  return PATH_SEGMENT_LABELS[segment] ?? humanizeSegment(segment);
}

/** Last entity UUID in path (excludes project id under /proyectos). Used for tailLabel on edit routes. */
function indexOfTailEntityUuid(segments: string[]): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]!;
    const prev = segments[i - 1];
    if (isProjectIdSegment(seg) && prev === "proyectos") continue;
    if (isUuid(seg)) return i;
  }
  return -1;
}

export type AppBreadcrumbContext = {
  tenantName: string;
  projectName?: string | null;
  tailLabel?: string | null;
  segmentLabels?: Readonly<Record<string, string>>;
};

export function resolveAppShellBreadcrumbs(
  pathname: string,
  ctx: AppBreadcrumbContext,
): ShellBreadcrumbItem[] {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/dashboard") {
    return [{ label: ctx.tenantName, href: "/dashboard" }];
  }

  const segments = path.split("/").filter(Boolean);
  const tailEntityUuidIndex = ctx.tailLabel?.trim() ? indexOfTailEntityUuid(segments) : -1;
  const items: ShellBreadcrumbItem[] = [{ label: ctx.tenantName, href: "/dashboard" }];
  let acc = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const prev = segments[i - 1];
    const isLast = i === segments.length - 1;
    acc += `/${seg}`;

    if (seg === "dashboard") {
      items.push({ label: "Inicio", href: isLast ? undefined : acc });
      continue;
    }

    if (isProjectIdSegment(seg) && prev === "proyectos") {
      items.push({
        label: ctx.projectName?.trim() || "Proyecto",
        href: isLast ? undefined : acc,
      });
      continue;
    }

    if (isUuid(seg)) {
      const segmentLabel = ctx.segmentLabels?.[seg]?.trim();
      const trimmedTail = ctx.tailLabel?.trim();
      const label =
        segmentLabel ||
        (trimmedTail && (i === tailEntityUuidIndex || isLast) ? trimmedTail : "Detalle");
      items.push({ label, href: isLast ? undefined : acc });
      continue;
    }

    items.push({
      label: labelForSegment(seg),
      href: isLast ? undefined : acc,
    });
  }

  return items;
}

export type PlatformBreadcrumbContext = {
  tenantName?: string | null;
  tailLabel?: string | null;
  segmentLabels?: Readonly<Record<string, string>>;
};

export function resolvePlatformShellBreadcrumbs(
  pathname: string,
  ctx: PlatformBreadcrumbContext = {},
): ShellBreadcrumbItem[] {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/platform") {
    return [{ label: "Plataforma", href: "/platform" }];
  }

  const segments = path.split("/").filter(Boolean);
  const tailEntityUuidIndex = ctx.tailLabel?.trim() ? indexOfTailEntityUuid(segments) : -1;
  const items: ShellBreadcrumbItem[] = [{ label: "Plataforma", href: "/platform" }];
  let acc = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const prev = segments[i - 1];
    const isLast = i === segments.length - 1;
    acc += `/${seg}`;

    if (seg === "platform") continue;

    if (isUuid(seg) && prev === "tenants") {
      items.push({
        label: ctx.tenantName?.trim() || "Organización",
        href: isLast ? undefined : acc,
      });
      continue;
    }

    if (isUuid(seg)) {
      const segmentLabel = ctx.segmentLabels?.[seg]?.trim();
      const trimmedTail = ctx.tailLabel?.trim();
      const label =
        segmentLabel ||
        (trimmedTail && (i === tailEntityUuidIndex || isLast) ? trimmedTail : "Detalle");
      items.push({ label, href: isLast ? undefined : acc });
      continue;
    }

    items.push({
      label: labelForSegment(seg),
      href: isLast ? undefined : acc,
    });
  }

  return items;
}

/** Extract project id from pathname when inside project workspace. */
export function extractProjectIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/proyectos\/([^/]+)/);
  const id = m?.[1];
  if (!id || !isProjectIdSegment(id)) return null;
  return id;
}
