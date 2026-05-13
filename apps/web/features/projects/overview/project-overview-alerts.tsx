import Link from "next/link";
import type { ProjectOverviewAlert } from "@bloqer/services";
import { cn } from "@/lib/utils";

const severityStyles: Record<ProjectOverviewAlert["severity"], string> = {
  info: "border-border bg-muted/40",
  warning: "border-amber-500/40 bg-amber-500/5",
  critical: "border-destructive/50 bg-destructive/5",
};

export function ProjectOverviewAlerts({ alerts }: { alerts: ProjectOverviewAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">Avisos</h2>
      <ul className="space-y-2">
        {alerts.map((a, i) => (
          <li
            key={`${a.label}-${i}`}
            className={cn("rounded-xl border px-4 py-3 text-sm", severityStyles[a.severity])}
          >
            <p className="font-medium">{a.label}</p>
            <p className="mt-0.5 text-muted-foreground">{a.description}</p>
            {a.href ? (
              <Link href={a.href} className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
                Ir
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
