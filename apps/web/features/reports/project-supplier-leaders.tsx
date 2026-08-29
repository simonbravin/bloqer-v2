import type { ProjectSupplierLeaderRow } from "@bloqer/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyAmount } from "@/lib/format-money";

type Kind = "amount" | "orders" | "payable";

const KIND_META: Record<Kind, { title: string; helper: string; empty: string }> = {
  amount: {
    title: "Líderes por monto",
    helper: "Exposición esperada (devengado + OC abierta). No sumes OC + factura.",
    empty: "Sin gasto de proveedores en el período.",
  },
  orders: {
    title: "Líderes por pedidos",
    helper: "Cantidad de órdenes de compra confirmadas.",
    empty: "Sin OC confirmadas en el período.",
  },
  payable: {
    title: "Mayor saldo a pagar",
    helper: "Saldo abierto de CxP hoy (no recorta por fechas).",
    empty: "No hay CxP abiertas de proveedores.",
  },
};

function formatLeaderValue(kind: Kind, value: string) {
  if (kind === "orders") return value;
  return formatMoneyAmount(value);
}

export function ProjectSupplierLeaders({
  kind,
  rows,
}: {
  kind: Kind;
  rows: ProjectSupplierLeaderRow[];
}) {
  const meta = KIND_META[kind];
  const max = rows.reduce((m, r) => Math.max(m, Number(r.value) || 0), 0);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{meta.title}</CardTitle>
        <p className="text-xs text-muted-foreground">{meta.helper}</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{meta.empty}</p>
        ) : (
          <ol className="space-y-3">
            {rows.map((row, i) => {
              const width = max > 0 ? Math.max(6, (Number(row.value) / max) * 100) : 0;
              return (
                <li key={row.supplierContactId} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                      {row.supplierName}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums">
                      {formatLeaderValue(kind, row.value)}
                      {row.sharePct ? (
                        <span className="ml-1 text-muted-foreground">({row.sharePct}%)</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${width}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
