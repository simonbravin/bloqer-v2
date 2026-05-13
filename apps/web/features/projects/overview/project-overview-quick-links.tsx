import Link from "next/link";
import type { ProjectOverviewQuickLink } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ProjectOverviewQuickLinks({ links }: { links: ProjectOverviewQuickLink[] }) {
  if (links.length === 0) return null;
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Accesos rápidos</CardTitle>
        <CardDescription>Enlaces útiles según tu rol y la configuración del tenant.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block rounded-lg border border-transparent bg-background/80 px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/50"
              >
                <span className="font-medium">{l.label}</span>
                {l.description ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{l.description}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
