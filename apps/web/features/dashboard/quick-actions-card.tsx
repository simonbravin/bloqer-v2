import Link from "next/link";
import type { DashboardFinanceSummary, DashboardQuickAction } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function QuickActionsCard({ actions }: { actions: DashboardQuickAction[] }) {
  if (actions.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Accesos rápidos</CardTitle>
        <CardDescription>Atajos según tus permisos y módulos activos.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2">
          {actions.map((a) => (
            <li key={a.href}>
              <Button asChild variant="outline" className="h-auto w-full flex-col items-start gap-1 whitespace-normal py-3">
                <Link href={a.href}>
                  <span className="font-medium">{a.label}</span>
                  {a.description ? <span className="text-xs font-normal text-muted-foreground">{a.description}</span> : null}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
