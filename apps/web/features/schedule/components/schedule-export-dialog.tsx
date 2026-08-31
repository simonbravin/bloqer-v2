"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import {
  parseScheduleExportView,
  type ScheduleExportView,
} from "@bloqer/services/schedule-export-pure";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FilterParams = {
  budgetId?: string;
  status?: string;
  delayedOnly?: string;
  type?: string;
};

const CONTENT_OPTIONS: { id: ScheduleExportView; label: string }[] = [
  { id: "table", label: "Tabla" },
  { id: "gantt", label: "Gantt" },
  { id: "both", label: "Ambos" },
];

function lastDayOfMonth(year: number, month1to12: number): string {
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  return `${year}-${String(month1to12).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function monthRange(iso: string): { from: string; to: string } {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return { from: `${iso.slice(0, 7)}-01`, to: lastDayOfMonth(year, month) };
}

function quarterRange(iso: string): { from: string; to: string } {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const endMonth = startMonth + 2;
  return {
    from: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    to: lastDayOfMonth(year, endMonth),
  };
}

function yearRange(iso: string): { from: string; to: string } {
  const year = iso.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function orderedRange(from: string, to: string): { from: string; to: string } {
  return from <= to ? { from, to } : { from: to, to: from };
}

function buildQuery(filters: FilterParams, extra: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [key, raw] of Object.entries(filters)) {
    if (raw) q.set(key, raw);
  }
  for (const [key, raw] of Object.entries(extra)) {
    if (raw) q.set(key, raw);
  }
  return q.toString();
}

async function readExportError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      /* fall through */
    }
  } else {
    const text = (await response.text()).trim();
    if (text && !text.startsWith("<")) return text.slice(0, 180);
  }
  return `No se pudo generar la exportación (${response.status})`;
}

export function ScheduleExportDialog({
  projectId,
  filters,
  defaultView,
}: {
  projectId: string;
  filters: FilterParams;
  defaultView?: string;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<ScheduleExportView>(() =>
    parseScheduleExportView(defaultView),
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [downloading, setDownloading] = useState<"pdf" | "xlsx" | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setContent(parseScheduleExportView(defaultView));
    setFrom("");
    setTo("");
  }, [open, defaultView]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function applyPreset(kind: "all" | "month" | "quarter" | "year") {
    if (kind === "all") {
      setFrom("");
      setTo("");
      return;
    }
    const today = toIsoDateInTimeZone();
    const range =
      kind === "month" ? monthRange(today) : kind === "quarter" ? quarterRange(today) : yearRange(today);
    setFrom(range.from);
    setTo(range.to);
  }

  async function download(format: "pdf" | "xlsx") {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setDownloading(format);
    let objectUrl: string | null = null;
    try {
      const range = from && to ? orderedRange(from, to) : { from, to };
      const qs = buildQuery(filters, {
        format,
        view: content,
        from: range.from,
        to: range.to,
      });
      const href = `/api/reports/proyectos/${projectId}/cronograma?${qs}`;
      const response = await fetch(href, { credentials: "same-origin", signal: ac.signal });
      if (!response.ok) {
        throw new Error(await readExportError(response));
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "cronograma";
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      if (ac.signal.aborted) return;
      toast.error(error instanceof Error ? error.message : "No se pudo generar la exportación");
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (!ac.signal.aborted) setDownloading(null);
    }
  }

  const busy = downloading !== null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" aria-hidden />
          Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar cronograma</DialogTitle>
          <DialogDescription>
            Elegí tabla, Gantt o ambos, y un lapso opcional. Sin fechas, el eje usa el rango de los
            ítems filtrados. Con Desde/Hasta entran ítems que se solapan con ese período y sus
            capítulos padre.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label id="schedule-export-content">Contenido</Label>
            <div
              className="flex flex-wrap gap-1 rounded-lg border p-1"
              role="group"
              aria-labelledby="schedule-export-content"
            >
              {CONTENT_OPTIONS.map((opt) => (
                <Button
                  key={opt.id}
                  type="button"
                  size="sm"
                  variant={content === opt.id ? "secondary" : "ghost"}
                  aria-pressed={content === opt.id}
                  className={cn("flex-1", content !== opt.id && "text-muted-foreground")}
                  onClick={() => setContent(opt.id)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-export-from">Desde</Label>
              <Input
                id="schedule-export-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-export-to">Hasta</Label>
              <Input
                id="schedule-export-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Atajos de lapso">
            <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("all")}>
              Todo
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("month")}>
              Este mes
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("quarter")}>
              Este trimestre
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("year")}>
              Este año
            </Button>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={busy}
            onClick={() => void download("xlsx")}
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            {downloading === "xlsx" ? "Generando…" : "Excel"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={busy}
            onClick={() => void download("pdf")}
          >
            <FileText className="h-4 w-4" aria-hidden />
            {downloading === "pdf" ? "Generando…" : "PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
