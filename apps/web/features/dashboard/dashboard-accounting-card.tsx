import Link from "next/link";
import type { DashboardAccountingSummary } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardAccountingCard({ summary }: { summary: DashboardAccountingSummary }) {
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Contabilidad</CardTitle>
        <CardDescription>Asientos según tu empresa actual.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Borrador</p>
            <p className="text-xl font-semibold tabular-nums">{summary.journalDraftCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Contabilizados</p>
            <p className="text-xl font-semibold tabular-nums">{summary.journalPostedCount}</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/contabilidad">Abrir contabilidad</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
