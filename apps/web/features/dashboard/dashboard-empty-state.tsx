import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type DashboardOnboardingStep = { title: string; body: string; href?: string };

export function DashboardEmptyState({ steps }: { steps: DashboardOnboardingStep[] }) {
  if (steps.length === 0) return null;

  return (
    <Card className="rounded-2xl border border-dashed bg-muted/20 shadow-sm">
      <CardHeader>
        <CardTitle>Empezá a operar</CardTitle>
        <CardDescription>
          Todavía no hay datos para mostrar en el tablero. Estos pasos te ayudan a dejar todo listo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-4 pl-5 text-sm">
          {steps.map((s) => (
            <li key={s.title} className="space-y-1">
              <p className="font-medium">{s.title}</p>
              <p className="text-muted-foreground">{s.body}</p>
              {s.href ? (
                <Link href={s.href} className="text-primary underline-offset-4 hover:underline">
                  Ir
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
