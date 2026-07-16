import Link from "next/link";
import type { DashboardProjectSummary } from "@bloqer/services";
import { formatDashboardMoney } from "@bloqer/services/dashboard-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function ProjectProgressCard({ summary }: { summary: DashboardProjectSummary }) {
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Proyectos</CardTitle>
      </CardHeader>
      <CardContent>
        {summary.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay proyectos recientes.</p>
        ) : (
          <ul className="divide-y">
            {summary.projects.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <Link
                  href={p.href}
                  className="min-w-0 truncate text-sm font-medium text-foreground hover:underline"
                >
                  {p.name}
                </Link>
                <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
                  {p.budgetAmount != null && p.budgetCurrency
                    ? formatDashboardMoney(p.budgetAmount, p.budgetCurrency)
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" size="sm">
          <Link href="/proyectos">Ver todos</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
