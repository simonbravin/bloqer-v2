import Link from "next/link";
import type { DashboardQuickAction } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function QuickActionsCard({ actions }: { actions: DashboardQuickAction[] }) {
  if (actions.length === 0) return null;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold tracking-tight">Acciones rápidas</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2">
          {actions.map((a) => (
            <li key={a.href}>
              <Button
                asChild
                variant="outline"
                className="h-auto w-full flex-col items-start gap-1 whitespace-normal border-border/80 py-3 transition-all duration-150 hover:border-primary/30 hover:bg-muted/40 hover:shadow-sm"
              >
                <Link href={a.href}>
                  <span className="font-medium">{a.label}</span>
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
