import type { DashboardAccountingSummary } from "@bloqer/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import Link from "next/link";

export function DashboardAccountingCard({ summary }: { summary: DashboardAccountingSummary }) {
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">
          <Link href="/contabilidad" className="hover:underline">
            Contabilidad
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <KpiStatGrid title={null} columns={2}>
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
      </CardContent>
    </Card>
  );
}
