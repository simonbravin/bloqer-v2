"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SwitchField } from "@/components/ui/switch-field";
import { updateTenantNotificationEmailPolicyAction } from "@/app/(app)/configuracion/politicas/actions";
import type { DigestSchedulePreview } from "../digest-schedule-preview";

export type TenantEmailPolicyFormProps = {
  leadershipDailyFlowEmailCc: boolean;
  digestEnabledDefault: boolean;
  digestHourLocal: number;
  schedulePreview: DigestSchedulePreview | null;
};

function formatHourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export function TenantNotificationEmailPolicyForm({
  leadershipDailyFlowEmailCc,
  digestEnabledDefault,
  digestHourLocal,
  schedulePreview,
}: TenantEmailPolicyFormProps) {
  const router = useRouter();
  const [cc, setCc] = useState(leadershipDailyFlowEmailCc);
  const [digestDefault, setDigestDefault] = useState(digestEnabledDefault);
  const [hour, setHour] = useState(String(digestHourLocal));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const compatibleHours = schedulePreview?.eligibleHours ?? [];
  const hourOptions = [...new Set([...compatibleHours, digestHourLocal])].sort((a, b) => a - b);

  useEffect(() => {
    setCc(leadershipDailyFlowEmailCc);
    setDigestDefault(digestEnabledDefault);
    setHour(String(digestHourLocal));
  }, [leadershipDailyFlowEmailCc, digestEnabledDefault, digestHourLocal]);

  function save() {
    setError(null);
    setMessage(null);
    const digestHourLocalNum = Number(hour);
    startTransition(async () => {
      const result = await updateTenantNotificationEmailPolicyAction({
        leadershipDailyFlowEmailCc: cc,
        digestEnabledDefault: digestDefault,
        ...(digestHourLocalNum !== digestHourLocal ? { digestHourLocal: digestHourLocalNum } : {}),
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMessage("Política de email guardada.");
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="text-base">CC del flujo diario y digest</CardTitle>
        <CardDescription>
          Por defecto Propietario y Administrador no reciben por correo el flujo diario de SC/OC
          (sí ven la campana). Cada persona afina categorías en{" "}
          <Link
            href="/configuracion/notificaciones"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Configuración → Notificaciones
          </Link>
          . Alertas de vencimiento y canal CxP están arriba en esta misma sección.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-3">
          <SwitchField
            id="leadership-cc"
            label="Copiar email del flujo diario a Propietario / Administrador"
            description="Restaura el CC por correo en compras, obra y alertas cotidianas. Los escalamientos (SLA, umbral alto) siguen llegando por email aunque esté apagado."
            checked={cc}
            disabled={pending}
            onCheckedChange={setCc}
          />
          <SwitchField
            id="digest-default"
            label="Digest diario activo por defecto"
            description="Un resumen matutino con colas estilo Pendientes y alertas críticas. Cada Propietario/Administrador puede apagarlo en sus notificaciones."
            checked={digestDefault}
            disabled={pending}
            onCheckedChange={setDigestDefault}
          />
        </div>

        <Separator />

        <div className="space-y-2 max-w-xs">
          <Label htmlFor="digest-hour">Hora mínima del resumen</Label>
          <Select value={hour} onValueChange={setHour} disabled={pending || !schedulePreview}>
            <SelectTrigger id="digest-hour" className="w-full">
              <SelectValue placeholder="Elegí una hora" />
            </SelectTrigger>
            <SelectContent>
              {hourOptions.map((h) => (
                <SelectItem key={h} value={String(h)} disabled={!compatibleHours.includes(h)}>
                  {formatHourLabel(h)}{compatibleHours.includes(h) ? "" : " (guardada; fuera de horario)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            La revisión automática ocurre una vez al día a las 10:05 UTC (07:05 en Argentina).
            Las horas disponibles habilitan el resumen para esa revisión; no programan otro envío.
            La hora de llegada puede variar.
          </p>
          {schedulePreview ? (
            <p className="text-xs text-muted-foreground">
              Próxima revisión prevista: {schedulePreview.reviewLabel} ({schedulePreview.timezone}).
            </p>
          ) : null}
          {!schedulePreview ? <p role="status" className="text-xs text-muted-foreground">No se pudo calcular el horario. Recargá la página antes de cambiarlo.</p> : null}
          {schedulePreview && !schedulePreview.eligibleHours.includes(Number(hour)) ? (
            <p className="text-xs text-amber-800 dark:text-amber-200" role="status">
              La hora guardada queda fuera de la próxima revisión y el resumen no saldría.
              {" "}Para incluirlo, elegí {schedulePreview.eligibleHours.map(formatHourLabel).join(", ")}.
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-sm text-green-600 dark:text-green-500">{message}</p>
        ) : null}

        <Button type="button" disabled={pending} onClick={save}>
          {pending ? "Guardando…" : "Guardar política de email"}
        </Button>
      </CardContent>
    </Card>
  );
}
