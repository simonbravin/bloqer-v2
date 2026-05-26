import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Building2,
  Calculator,
  FileSpreadsheet,
  FolderKanban,
  GitBranch,
  Landmark,
  LayoutDashboard,
  ListTree,
  Package,
  Receipt,
  Settings,
  Shield,
  User,
  Users,
  Wallet,
} from "lucide-react";

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
  "/finanzas/cuentas-por-cobrar-aging": Receipt,
  "/finanzas/cuentas-por-pagar-aging": FileSpreadsheet,
  "/configuracion": Settings,
  "/configuracion/perfil": User,
  "/configuracion/equipo": Users,
  "/configuracion/permisos": Shield,
};

export function GlobalNavIcon({ href }: { href: string }) {
  const Icon = GLOBAL_NAV_ICON_BY_HREF[href];
  if (!Icon) return null;
  return <Icon className="h-4 w-4 shrink-0" aria-hidden />;
}
