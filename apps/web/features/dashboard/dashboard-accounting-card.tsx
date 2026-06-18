import Link from "next/link";
import type { DashboardAccountingSummary } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";

export function DashboardAccountingCard({ summary }: { summary: DashboardAccountingSummary }) {
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Contabilidad</CardTitle>
        <CardDescription>Asientos según tu empresa actual.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <KpiStatGrid title={null} columns={2} className="flex-1">
          <KpiStatCard
            iconKey="tr_draft_invoices"
            label="Borrador"
            value={String(summary.journalDraftCount)}
            tone={summary.journalDraftCount > 0 ? "warning" : "muted"}
          />
          <KpiStatCard
            iconKey="accounting"
            label="Contabilizados"
            value={String(summary.journalPostedCount)}
            tone={summary.journalPostedCount > 0 ? "success" : "muted"}
          />
        </KpiStatGrid>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/contabilidad">Abrir contabilidad</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
