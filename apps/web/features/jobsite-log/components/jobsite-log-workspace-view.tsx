"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MonthCalendarGrid } from "@/components/ui/month-calendar-grid";
import { Button } from "@/components/ui/button";
import { mapJobsiteLogToCalendarEntry } from "../adapters/jobsite-log-view-types";

export type JobsiteLogListRow = {
  id: string;
  logDate: string | Date;
  status: string;
  title: string | null;
  workFront: string | null;
};

type ViewId = "table" | "calendar";

function parseView(raw: string | null): ViewId {
  return raw === "calendar" ? "calendar" : "table";
}

export function JobsiteLogWorkspaceView({
  projectId,
  logs,
  table,
}: {
  projectId: string;
  logs: JobsiteLogListRow[];
  table: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = useMemo(() => parseView(searchParams.get("view")), [searchParams]);

  const eventsByDay = useMemo(() => {
    const map = new Map<
      string,
      Array<{ id: string; data: JobsiteLogListRow; color: string; label: string }>
    >();
    for (const log of logs) {
      const entry = mapJobsiteLogToCalendarEntry(log);
      const key = entry.logDate;
      const list = map.get(key) ?? [];
      list.push({
        id: entry.id,
        data: log,
        color: entry.color,
        label: entry.label,
      });
      map.set(key, list);
    }
    return map;
  }, [logs]);

  function setView(next: ViewId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="flex gap-1 rounded-lg border p-1">
          <Button
            size="sm"
            variant={view === "table" ? "secondary" : "ghost"}
            type="button"
            onClick={() => setView("table")}
          >
            Tabla
          </Button>
          <Button
            size="sm"
            variant={view === "calendar" ? "secondary" : "ghost"}
            type="button"
            onClick={() => setView("calendar")}
          >
            Calendario
          </Button>
        </div>
      </div>

      {view === "table" ? (
        table
      ) : (
        <MonthCalendarGrid
          eventsByDay={eventsByDay}
          onEventClick={(log) =>
            router.push(`/proyectos/${projectId}/libro-obra/${log.id}`)
          }
        />
      )}
    </div>
  );
}
