import type { ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  Building2,
  LineChart,
  Package,
  PieChart,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type TenantReportCard = {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  available: boolean;
};

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
  const cards: TenantReportCard[] = [
    {
      title: "Portafolio de proyectos",
      description: "Visión consolidada: presupuesto, comprometido, devengado, exposición y varianza por obra.",
      href: "/reportes/portafolio",
      icon: <PieChart className="h-5 w-5" />,
      available: canProjects,
    },
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
      title: "Inventario y consumos",
      description: "Stock actual y movimientos de materiales.",
      href: "/inventario",
      icon: <Package className="h-5 w-5" />,
      available: canInventory,
    },
    {
      title: "Gastos generales por proyecto",
      description: "Imputaciones de GG por período y obra.",
      href: "/reportes/gastos-generales-por-proyecto",
      icon: <Building2 className="h-5 w-5" />,
      available: canOverhead,
    },
    {
      title: "Compras multi-obra",
      description: "Principales proveedores y OC abiertas a nivel tenant.",
      href: "/reportes/compras-multi-obra",
      icon: <ShoppingCart className="h-5 w-5" />,
      available: canProcurement,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <Card
          key={card.title}
          className={card.available ? "transition-shadow hover:shadow-md" : "opacity-50"}
        >
          {card.available ? (
            <Link href={card.href} className="block h-full">
              <CardHeader className="space-y-2">
                <div className="flex items-center gap-2 text-primary">{card.icon}</div>
                <CardTitle className="text-base">{card.title}</CardTitle>
                <CardDescription className="text-sm">{card.description}</CardDescription>
              </CardHeader>
            </Link>
          ) : (
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">{card.icon}</div>
              <CardTitle className="text-base">{card.title}</CardTitle>
              <CardDescription className="text-sm">{card.description}</CardDescription>
              <span className="text-xs text-muted-foreground">Sin permisos o módulo deshabilitado</span>
            </CardHeader>
          )}
        </Card>
      ))}
    </div>
  );
}
