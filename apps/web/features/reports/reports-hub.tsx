import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, FileCheck2, Package, PieChart, TrendingUp, Users, Wallet } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ReportCard = {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  available: boolean;
  badge?: string;
};

type Props = {
  projectId: string;
  canCostReports: boolean;
  canCertReports: boolean;
  canProcurementReports: boolean;
  canSubcontractReports: boolean;
  canCashFlow: boolean;
};

export function ReportsHub({
  projectId,
  canCostReports,
  canCertReports,
  canProcurementReports,
  canSubcontractReports,
  canCashFlow,
}: Props) {
  const base = `/proyectos/${projectId}/reportes`;

  const cards: ReportCard[] = [
    {
      title: "Certificaciones",
      description: "Evolución certificado / facturado / cobrado, curvas de avance y estado por partida.",
      href: `${base}/certificaciones`,
      icon: <FileCheck2 className="h-5 w-5" />,
      available: canCertReports,
    },
    {
      title: "Compras y proveedores",
      description: "Material presupuestado vs OC/facturas, líneas sin WBS y resumen por proveedor.",
      href: `${base}/compras-proveedores`,
      icon: <Package className="h-5 w-5" />,
      available: canProcurementReports,
    },
    {
      title: "Subcontratos",
      description: "Varianza SUB por partida, contratos activos y evolución certificado vs pagado.",
      href: `${base}/subcontratos`,
      icon: <Users className="h-5 w-5" />,
      available: canSubcontractReports,
    },
    {
      title: "Presupuesto vs real",
      description: "Varianzas por partida WBS con capa de costo seleccionable y composición del presupuesto.",
      href: `${base}/presupuesto-vs-real`,
      icon: <TrendingUp className="h-5 w-5" />,
      available: canCostReports,
    },
    {
      title: "Control de costos (detalle)",
      description: "Vista completa por capas: comprometido, devengado, pagado, certificaciones y avance.",
      href: `/proyectos/${projectId}/control-costos`,
      icon: <BarChart3 className="h-5 w-5" />,
      available: canCostReports,
    },
    {
      title: "Composición presupuesto",
      description: "Mismo gráfico integrado en Presupuesto vs real; acceso directo al reporte.",
      href: `${base}/presupuesto-vs-real`,
      icon: <PieChart className="h-5 w-5" />,
      available: canCostReports,
      badge: "En presupuesto vs real",
    },
    {
      title: "Flujo de caja del proyecto",
      description: "Ingresos y egresos de caja por período.",
      href: `/proyectos/${projectId}/flujo-caja`,
      icon: <Wallet className="h-5 w-5" />,
      available: canCashFlow,
      badge: "Disponible",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
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
                {card.badge ? (
                  <span className="inline-block text-xs text-muted-foreground">{card.badge}</span>
                ) : null}
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
