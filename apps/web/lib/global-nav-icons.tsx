import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  CalendarClock,
  FileSpreadsheet,
  FolderKanban,
  GitBranch,
  Landmark,
  LayoutDashboard,
  ListTree,
  Package,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { isInternalTransferMovimientosHref, navHrefPathname } from "@/lib/nav-link-active";

const GLOBAL_NAV_ICON_BY_HREF: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/proyectos": FolderKanban,
  "/directorio": Building2,
  "/inventario": Package,
  "/tesoreria": Landmark,
  "/tesoreria/cuentas": Wallet,
  "/tesoreria/transferencias": ArrowLeftRight,
  "/tesoreria/reportes": BarChart3,
  "/contabilidad": Calculator,
  "/contabilidad/cuentas": ListTree,
  "/contabilidad/asientos": BookOpen,
  "/contabilidad/reglas": GitBranch,
  "/finanzas": LayoutDashboard,
  "/finanzas/transacciones": ArrowLeftRight,
  "/finanzas/cuentas-por-cobrar": Receipt,
  "/finanzas/facturas-proveedor": Receipt,
  "/finanzas/gastos-generales": Briefcase,
  "/finanzas/cuentas-por-pagar": FileSpreadsheet,
  "/configuracion": Settings,
  "/configuracion/perfil": User,
  "/configuracion/equipo": Users,
  "/configuracion/permisos": Shield,
  "/configuracion/reportes": CalendarClock,
  "/configuracion/registro": ScrollText,
};

function resolveGlobalNavIcon(href: string): LucideIcon | undefined {
  const direct = GLOBAL_NAV_ICON_BY_HREF[href];
  if (direct) return direct;

  if (isInternalTransferMovimientosHref(href)) {
    return ArrowLeftRight;
  }

  const byPath = GLOBAL_NAV_ICON_BY_HREF[navHrefPathname(href)];
  if (byPath) return byPath;

  return undefined;
}

export function GlobalNavIcon({ href }: { href: string }) {
  const Icon = resolveGlobalNavIcon(href);
  if (!Icon) return null;
  return <Icon className="h-4 w-4 shrink-0" aria-hidden />;
}
