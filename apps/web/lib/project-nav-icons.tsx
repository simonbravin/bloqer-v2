import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CalendarRange,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  HardHat,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

const PROJECT_NAV_ICON_BY_LABEL: Record<string, LucideIcon> = {
  Resumen: LayoutDashboard,
  Presupuesto: FileSpreadsheet,
  Cronograma: CalendarRange,
  "WBS y costos": FolderKanban,
  "Flujo de caja": TrendingUp,
  "Tablero de finanzas": Wallet,
  "Libro de obra": HardHat,
  Certificaciones: ClipboardList,
  Inventario: Package,
  Documentos: FileText,
  Compras: ShoppingCart,
  Subcontratos: Users,
  "Facturas proveedor": Receipt,
  "Cuentas por pagar": Banknote,
  Pagos: Wallet,
  Facturas: Receipt,
  "Cuentas por cobrar": TrendingUp,
  Cobranzas: Banknote,
  Configuración: Settings,
};

export function ProjectNavIcon({ label }: { label: string }) {
  const Icon = PROJECT_NAV_ICON_BY_LABEL[label];
  if (!Icon) return null;
  return <Icon className="h-4 w-4 shrink-0" aria-hidden />;
}
