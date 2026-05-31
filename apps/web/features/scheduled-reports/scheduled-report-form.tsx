"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ScheduledReportKey } from "@bloqer/validators";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createScheduledReportAction,
  updateScheduledReportAction,
} from "@/app/(app)/configuracion/scheduled-report-actions";

const TIMEZONE_OPTIONS = [
  "America/Argentina/Buenos_Aires",
  "America/Argentina/Cordoba",
  "America/Argentina/Mendoza",
  "America/Argentina/Salta",
  "America/Argentina/Tucuman",
  "America/Argentina/Ushuaia",
  "UTC",
] as const;

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

function buildReportParams(
  dateFrom: string,
  dateTo: string,
  currency: string,
): Record<string, string> | undefined {
  const params: Record<string, string> = {};
  const from = dateFrom.trim();
  const to = dateTo.trim();
  const cur = currency.trim();
  if (from) params.dateFrom = from;
  if (to) params.dateTo = to;
  if (cur) params.currency = cur;
  return Object.keys(params).length > 0 ? params : undefined;
}

function isNextRedirectError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("NEXT_REDIRECT");
}

export type ScheduledReportFormMember = {
  userId: string;
  email: string;
  name: string | null;
};

export type ScheduledReportFormProject = {
  id: string;
  code: string;
  name: string;
};

export type ScheduledReportCatalogOption = {
  reportKey: ScheduledReportKey;
  labelEs: string;
};

export type ScheduledReportFormInitial = {
  id?: string;
  name: string;
  scope: "TENANT" | "PROJECT";
  projectId?: string;
  format: "CSV" | "PDF";
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay: string;
  timezone: string;
  reportKeys: ScheduledReportKey[];
  recipientUserIds: string[];
  params?: Record<string, string> | null;
};

export type ScheduledReportFormProps = {
  mode: "create" | "edit";
  defaultTimezone: string;
  tenantCatalog: ScheduledReportCatalogOption[];
  projectCatalog: ScheduledReportCatalogOption[];
  members: ScheduledReportFormMember[];
  projects: ScheduledReportFormProject[];
  initial?: ScheduledReportFormInitial;
  lockScope?: "TENANT" | "PROJECT";
  lockProjectId?: string;
};

export function ScheduledReportForm(props: ScheduledReportFormProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const initialScope = props.lockScope ?? props.initial?.scope ?? "TENANT";
  const [scope, setScope] = React.useState<"TENANT" | "PROJECT">(initialScope);
  const [name, setName] = React.useState(props.initial?.name ?? "");
  const [projectId, setProjectId] = React.useState(
    props.lockProjectId ?? props.initial?.projectId ?? "",
  );
  const [format, setFormat] = React.useState<"CSV" | "PDF">(props.initial?.format ?? "PDF");
  const [frequency, setFrequency] = React.useState<"DAILY" | "WEEKLY" | "MONTHLY">(
    props.initial?.frequency ?? "DAILY",
  );
  const [dayOfWeek, setDayOfWeek] = React.useState(String(props.initial?.dayOfWeek ?? 1));
  const [dayOfMonth, setDayOfMonth] = React.useState(String(props.initial?.dayOfMonth ?? 1));
  const [timeOfDay, setTimeOfDay] = React.useState(
    props.initial?.timeOfDay?.slice(0, 5) ?? "08:00",
  );
  const [timezone, setTimezone] = React.useState(props.initial?.timezone ?? props.defaultTimezone);
  const [dateFrom, setDateFrom] = React.useState(props.initial?.params?.dateFrom ?? "");
  const [dateTo, setDateTo] = React.useState(props.initial?.params?.dateTo ?? "");
  const [currency, setCurrency] = React.useState(props.initial?.params?.currency ?? "");
  const [selectedKeys, setSelectedKeys] = React.useState<Set<ScheduledReportKey>>(
    () => new Set(props.initial?.reportKeys ?? []),
  );
  const [selectedRecipients, setSelectedRecipients] = React.useState<Set<string>>(
    () => new Set(props.initial?.recipientUserIds ?? []),
  );

  const catalog = scope === "TENANT" ? props.tenantCatalog : props.projectCatalog;
  const scopeLocked = Boolean(props.lockScope);

  React.useEffect(() => {
    if (scopeLocked) return;
    const allowed = new Set(catalog.map((o) => o.reportKey));
    setSelectedKeys((prev) => {
      const filtered = [...prev].filter((k) => allowed.has(k));
      if (filtered.length === prev.size && filtered.every((k) => prev.has(k))) return prev;
      return new Set(filtered);
    });
  }, [scope, scopeLocked, catalog]);

  function toggleKey(key: ScheduledReportKey, checked: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleRecipient(userId: string, checked: boolean) {
    setSelectedRecipients((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const items = [...selectedKeys].map((reportKey, index) => ({ reportKey, sortOrder: index }));
    const effectiveScope = props.lockScope ?? scope;
    const payload = {
      ...(props.initial?.id ? { id: props.initial.id } : {}),
      name: name.trim(),
      scope: effectiveScope,
      projectId:
        effectiveScope === "PROJECT" ? (props.lockProjectId ?? projectId) || undefined : undefined,
      format,
      frequency,
      dayOfWeek: frequency === "WEEKLY" ? Number(dayOfWeek) : undefined,
      dayOfMonth: frequency === "MONTHLY" ? Number(dayOfMonth) : undefined,
      timeOfDay: timeOfDay.slice(0, 5),
      timezone,
      params: buildReportParams(dateFrom, dateTo, currency),
      items,
      recipientUserIds: [...selectedRecipients],
    };

    try {
      if (props.mode === "create") {
        await createScheduledReportAction(payload);
      } else {
        await updateScheduledReportAction(payload);
      }
    } catch (err: unknown) {
      if (isNextRedirectError(err)) throw err;
      setError("No se pudo guardar. Revisá los datos e intentá de nuevo.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
          <CardDescription>Nombre y alcance del envío automático (sin ejecución en esta fase).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sr-name">Nombre</Label>
            <Input
              id="sr-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              placeholder="Ej. Resumen financiero semanal"
            />
          </div>

          {!scopeLocked ? (
            <div className="space-y-2">
              <Label>Alcance</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as "TENANT" | "PROJECT")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TENANT">Empresa general</SelectItem>
                  <SelectItem value="PROJECT">Proyecto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Alcance: {scope === "PROJECT" ? "Proyecto" : "Empresa general"}
            </p>
          )}

          {(props.lockScope ?? scope) === "PROJECT" ? (
            <div className="space-y-2">
              <Label>Proyecto</Label>
              {props.lockProjectId ? (
                <p className="text-sm">
                  {props.projects.find((p) => p.id === props.lockProjectId)?.code}{" "}
                  {props.projects.find((p) => p.id === props.lockProjectId)?.name}
                </p>
              ) : (
                <Select value={projectId} onValueChange={setProjectId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    {props.projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reportes incluidos</CardTitle>
          <CardDescription>Máximo 5. Solo claves habilitadas por módulos del tenant.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {catalog.length === 0 ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              No hay reportes disponibles para este alcance con los módulos actuales.
            </p>
          ) : (
            catalog.map((opt) => (
              <label
                key={opt.reportKey}
                htmlFor={`sr-key-${opt.reportKey}`}
                className="flex items-start gap-2 text-sm cursor-pointer"
              >
                <Checkbox
                  id={`sr-key-${opt.reportKey}`}
                  className="mt-0.5"
                  checked={selectedKeys.has(opt.reportKey)}
                  onCheckedChange={(v) => toggleKey(opt.reportKey, v === true)}
                />
                <span>{opt.labelEs}</span>
              </label>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros del reporte</CardTitle>
          <CardDescription>
            Opcionales. Se aplican al exportar en la fase de envío (mismos parámetros que las pantallas de reporte).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sr-date-from">Desde</Label>
            <Input
              id="sr-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sr-date-to">Hasta</Label>
            <Input
              id="sr-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="sr-currency">Moneda</Label>
            <Input
              id="sr-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={8}
              placeholder="Ej. ARS, USD"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Programación</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Frecuencia</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">Diaria</SelectItem>
                <SelectItem value="WEEKLY">Semanal</SelectItem>
                <SelectItem value="MONTHLY">Mensual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sr-time">Hora (HH:mm)</Label>
            <Input
              id="sr-time"
              type="time"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value.slice(0, 5))}
              required
            />
          </div>
          {frequency === "WEEKLY" ? (
            <div className="space-y-2">
              <Label>Día de la semana</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(WEEKDAY_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {frequency === "MONTHLY" ? (
            <div className="space-y-2">
              <Label>Día del mes (1–28)</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-2 sm:col-span-2">
            <Label>Zona horaria</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Formato</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as "CSV" | "PDF")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PDF">PDF</SelectItem>
                <SelectItem value="CSV">CSV</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Destinatarios</CardTitle>
          <CardDescription>Usuarios activos del equipo (sin correos externos en esta fase).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {props.members
            .filter((m) => m.userId)
            .map((m) => (
              <label
                key={m.userId}
                htmlFor={`sr-recipient-${m.userId}`}
                className="flex items-start gap-2 text-sm cursor-pointer"
              >
                <Checkbox
                  id={`sr-recipient-${m.userId}`}
                  className="mt-0.5"
                  checked={selectedRecipients.has(m.userId)}
                  onCheckedChange={(v) => toggleRecipient(m.userId, v === true)}
                />
                <span>
                  {m.name ?? m.email}
                  <span className="block text-xs text-muted-foreground">{m.email}</span>
                </span>
              </label>
            ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : props.mode === "create" ? "Crear envío programado" : "Guardar cambios"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
