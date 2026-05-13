import Link from "next/link";
import type { DashboardInventorySummary } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function InventorySummaryCard({ summary }: { summary: DashboardInventorySummary }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Inventario</CardTitle>
        <CardDescription>Estado rápido del catálogo y stock.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Productos activos:</span>{" "}
            <span className="font-semibold tabular-nums">{summary.activeProductsCount}</span>
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Stock negativo</span>
            {summary.negativeStockCount > 0 ? (
              <Badge variant="destructive">{summary.negativeStockCount} ubicaciones</Badge>
            ) : (
              <Badge variant="secondary">Sin alertas</Badge>
            )}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/inventario">Abrir inventario</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
