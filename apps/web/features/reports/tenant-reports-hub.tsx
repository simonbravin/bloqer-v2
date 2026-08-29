import {
  BarChart3,
  Building2,
  LineChart,
  Package,
  PieChart,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { ReportsHubSections, type ReportHubCard } from "./reports-hub-sections";

type Props = {
  canProjects: boolean;
  canAr: boolean;
  canAp: boolean;
  canTreasury: boolean;
  canInventory: boolean;
  canProcurement: boolean;
  canOverhead: boolean;
};

export function TenantReportsHub({
  canProjects,
  canAr,
  canAp,
  canTreasury,
  canInventory,
  canProcurement,
  canOverhead,
}: Props) {
  const financial: ReportHubCard[] = [
    {
      title: "Rentabilidad multi-obra",
      description: "Margen bruto por proyecto y consolidado total del tenant.",
      href: "/reportes/rentabilidad-multi-obra",
      icon: <LineChart className="h-5 w-5" />,
      available: canProjects,
    },
    {
      title: "Aging CxC",
      description: "Deuda abierta por cliente con buckets de vencimiento.",
      href: "/finanzas/cuentas-por-cobrar",
      icon: <Wallet className="h-5 w-5" />,
      available: canAr,
    },
    {
      title: "Aging CxP",
      description: "Obligaciones abiertas por proveedor con buckets de vencimiento.",
      href: "/finanzas/cuentas-por-pagar",
      icon: <Wallet className="h-5 w-5" />,
      available: canAp,
    },
    {
      title: "Flujo de caja consolidado",
      description: "Flujo de caja por período a nivel empresa.",
      href: "/tesoreria/flujo-caja",
      icon: <BarChart3 className="h-5 w-5" />,
      available: canTreasury,
    },
    {
      title: "Gastos generales por proyecto",
      description: "Imputaciones de GG por período y obra.",
      href: "/reportes/gastos-generales-por-proyecto",
      icon: <Building2 className="h-5 w-5" />,
      available: canOverhead,
    },
  ];

  const operational: ReportHubCard[] = [
    {
      title: "Portafolio de proyectos",
      description: "Visión consolidada: presupuesto, comprometido, devengado, exposición y varianza por obra.",
      href: "/reportes/portafolio",
      icon: <PieChart className="h-5 w-5" />,
      available: canProjects,
    },
    {
      title: "Compras multi-obra",
      description: "Principales proveedores y OC abiertas a nivel tenant.",
      href: "/reportes/compras-multi-obra",
      icon: <ShoppingCart className="h-5 w-5" />,
      available: canProcurement,
    },
    {
      title: "Inventario y consumos",
      description: "Stock actual y movimientos de materiales.",
      href: "/inventario",
      icon: <Package className="h-5 w-5" />,
      available: canInventory,
    },
  ];

  return (
    <ReportsHubSections
      sections={[
        {
          title: "Financieros",
          description: "Caja, cobros, pagos, GG y margen consolidado.",
          cards: financial,
        },
        {
          title: "Operativos",
          description: "Portafolio de obras, compras e inventario.",
          cards: operational,
        },
      ]}
    />
  );
}
