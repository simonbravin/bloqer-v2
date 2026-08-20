"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { JobsiteLogStatusBadge } from "./jobsite-log-status-badge";
import type { JobsiteLogStatus } from "@bloqer/database";
import type { JobsiteLogListRow } from "./jobsite-log-workspace-view";

export function JobsiteLogMobileCards({
  projectId,
  logs,
  emptyAction,
}: {
  projectId: string;
  logs: JobsiteLogListRow[];
  emptyAction?: ReactNode;
}) {
  if (logs.length === 0) {
    return (
      <ListEmptyState
        message="No hay partes de obra registrados en este proyecto."
        action={emptyAction}
      />
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {logs.map((log) => {
        const href = `/proyectos/${projectId}/libro-obra/${log.id}`;
        const meta = [log.weather, log.shift].filter(Boolean).join(" · ");
        return (
          <Link
            key={log.id}
            href={href}
            className="block rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium tabular-nums">{formatDate(log.logDate)}</p>
              <JobsiteLogStatusBadge status={log.status as JobsiteLogStatus} />
            </div>
            {log.title ? (
              <p className="mt-1 line-clamp-2 text-sm">{log.title}</p>
            ) : null}
            {meta ? (
              <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
            ) : null}
            {log.progressSummary ? (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{log.progressSummary}</p>
            ) : log.progressCount > 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {log.progressCount === 1 ? "1 partida de avance" : `${log.progressCount} partidas de avance`}
              </p>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
