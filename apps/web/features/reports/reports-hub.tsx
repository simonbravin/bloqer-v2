import {
  BarChart3,
  FileCheck2,
  LineChart,
  Package,
  Percent,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { ReportsHubSections, type ReportHubCard } from "./reports-hub-sections";

type Props = {
  projectId: string;
  canAr: boolean;
  canAp: boolean;
  canCostReports: boolean;
  canCertReports: boolean;
  canProcurementReports: boolean;
  canSubcontractReports: boolean;
  canCashFlow: boolean;
  canProfitability: boolean;
  /** @deprecated Materials board uses canCostReports; kept optional for call-site compat. */
  canInventoryReports?: boolean;
};

export function ReportsHub({
  projectId,
  canAr,
  canAp,
  canCostReports,
  canCertReports,
  canProcurementReports,
  canSubcontractReports,
  canCashFlow,
  canProfitability,
}: Props) {
  const base = `/proyectos/${projectId}/reportes`;

  const financial: ReportHubCard[] = [
    {
      title: "Aging Cuentas por cobrar",
      description: "Deuda abierta por cliente con buckets de vencimiento y foco en riesgo de cobro.",
      href: `/proyectos/${projectId}/cuentas-por-cobrar`,
      icon: <Wallet className="h-5 w-5" />,
      available: canAr,
      badge: "AR Aging",
    },
    {
      title: "Aging Cuentas por pagar",
      description: "Obligaciones abiertas por proveedor con buckets de vencimiento y riesgo de pago.",
      href: `/proyectos/${projectId}/cuentas-por-pagar`,
      icon: <Wallet className="h-5 w-5" />,
      available: canAp,
      badge: "AP Aging",
    },
    {
      title: "Caja y proyección",
      description: "Flujo de caja real (R-005) y cobros/pagos esperados por vencimiento (R-006).",
      href: `${base}/caja`,
      icon: <Wallet className="h-5 w-5" />,
      available: canCashFlow,
    },
    {
      title: "Flujo de caja (detalle)",
      description: "Cobranzas y pagos confirmados con tablas de detalle.",
      href: `/proyectos/${projectId}/flujo-caja`,
      icon: <Wallet className="h-5 w-5" />,
      available: canCashFlow,
      badge: "Detalle",
    },
    {
      title: "Ingresos vs gastos",
      description: "Certificado, facturado, cobrado y costos por período con capas etiquetadas.",
      href: `${base}/ingresos-gastos`,
      icon: <LineChart className="h-5 w-5" />,
      available: canProfitability || canCashFlow,
    },
    {
      title: "Rentabilidad",
      description: "Margen bruto (R-003) por capa de costo; margen neto cuando aplique [Q-013].",
      href: `${base}/rentabilidad`,
      icon: <Percent className="h-5 w-5" />,
      available: canProfitability,
      badge: "R-003",
    },
  ];

  const operational: ReportHubCard[] = [
    {
      title: "EDT y costos",
      description:
        "Tablero de $ por partida: capas, filtro por tipo, composición APU y barras Presup/Devengado/Exposición.",
      href: `/proyectos/${projectId}/control-costos`,
      icon: <BarChart3 className="h-5 w-5" />,
      available: canCostReports,
      badge: "Incluye presupuesto vs real + gasto por tipo",
    },
    {
      title: "Certificaciones",
      description: "Evolución certificado / facturado / cobrado, curvas de avance y estado por partida.",
      href: `${base}/certificaciones`,
      icon: <FileCheck2 className="h-5 w-5" />,
      available: canCertReports,
    },
    {
      title: "Proveedores",
      description:
        "Tabla, líderes por pedidos y por monto, concentración y saldo CxP (R-AP-03).",
      href: `${base}/proveedores`,
      icon: <Truck className="h-5 w-5" />,
      available: canProcurementReports,
      badge: "R-AP-03",
    },
    {
      title: "Análisis de compras",
      description:
        "Varianza de OC vs APU y líneas sin imputación EDT. El control de $ por partida está en EDT y costos.",
      href: `${base}/compras-proveedores`,
      icon: <Package className="h-5 w-5" />,
      available: canProcurementReports,
    },
    {
      title: "Materiales",
      description:
        "Cantidades APU vs pedido/recibido/consumido. El control de $ por partida está en EDT y costos.",
      href: `/proyectos/${projectId}/materiales`,
      icon: <Package className="h-5 w-5" />,
      available: canCostReports,
    },
    {
      title: "Subcontratos",
      description: "Varianza SUB por partida, contratos activos y evolución certificado vs pagado.",
      href: `${base}/subcontratos`,
      icon: <Users className="h-5 w-5" />,
      available: canSubcontractReports,
    },
  ];

  return (
    <ReportsHubSections
      sections={[
        {
          title: "Financieros",
          description: "Caja, cobros, pagos y margen de la obra.",
          cards: financial,
        },
        {
          title: "Operativos",
          description: "Costos por partida, proveedores, compras, materiales y avance certificado.",
          cards: operational,
        },
      ]}
    />
  );
}
