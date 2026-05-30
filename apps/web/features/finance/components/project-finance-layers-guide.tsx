import { Badge } from "@/components/ui/badge";

const LAYERS = [
  {
    key: "cash",
    label: "Caja ejecutada",
    description:
      "Cobranzas y pagos confirmados imputados a la obra. Mueve la misma caja bancaria de la empresa.",
  },
  {
    key: "obligations",
    label: "Deuda comercial",
    description: "Saldos abiertos de cuentas por cobrar y por pagar. No mueven caja hasta cobrar o pagar.",
  },
  {
    key: "accrued",
    label: "Costo devengado",
    description:
      "Certificaciones, control de costos y facturas registradas. Puede existir antes del pago o cobro.",
  },
] as const;

export function ProjectFinanceLayersGuide({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {LAYERS.map((layer) => (
          <span key={layer.key} className="inline-flex items-center gap-1.5">
            <FinanceLayerBadge layer={layer.key} />
            {layer.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3 space-y-3">
      <p className="text-sm font-medium text-foreground">Tres capas financieras del proyecto</p>
      <ul className="grid gap-3 sm:grid-cols-3 text-sm">
        {LAYERS.map((layer) => (
          <li key={layer.key} className="space-y-1">
            <FinanceLayerBadge layer={layer.key} />
            <p className="font-medium text-foreground">{layer.label}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{layer.description}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground border-t border-border/60 pt-2">
        Los saldos bancarios reales son únicos a nivel empresa. El proyecto muestra imputación analítica,
        no una cuenta bancaria separada.
      </p>
    </div>
  );
}

export function FinanceLayerBadge({ layer }: { layer: (typeof LAYERS)[number]["key"] }) {
  const meta = LAYERS.find((l) => l.key === layer)!;
  const variant =
    layer === "cash" ? "default" : layer === "obligations" ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="text-[10px] uppercase tracking-wide">
      {meta.label}
    </Badge>
  );
}
