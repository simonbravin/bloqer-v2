"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  NOTIFICATION_EMAIL_CATEGORY_DESCRIPTION_ES,
  NOTIFICATION_EMAIL_CATEGORY_LABEL_ES,
  type NotificationEmailCategory,
} from "@bloqer/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SwitchField } from "@/components/ui/switch-field";
import {
  resetMyNotificationEmailPreferenceAction,
  upsertMyNotificationEmailPreferenceAction,
} from "@/app/(app)/configuracion/notificaciones/actions";
import Link from "next/link";

export type PreferenceSource = "user" | "tenant_policy" | "role_default";

export type PreferenceRow = {
  category: NotificationEmailCategory;
  emailEnabled: boolean;
  effectiveEnabled: boolean;
  isExplicit: boolean;
  defaultEnabled: boolean;
  source: PreferenceSource;
};

export type PreferenceFormProps = {
  preferences: PreferenceRow[];
  showLeadershipPolicyLink?: boolean;
};

const CATEGORY_SECTIONS: Array<{
  id: string;
  title: string;
  description: string;
  categories: NotificationEmailCategory[];
}> = [
  {
    id: "compras",
    title: "Compras",
    description: "Flujo diario de SC/OC y alertas de demora o vencimiento.",
    categories: ["PROCUREMENT_FLOW", "PROCUREMENT_ESCALATION"],
  },
  {
    id: "finanzas",
    title: "Finanzas",
    description: "Listo para pagar, cobranza y vencidos de CxP/CxC.",
    categories: ["AP_PAYMENT", "AR_COLLECTION", "AP_OVERDUE"],
  },
  {
    id: "obra",
    title: "Obra",
    description: "Partes de libro de obra enviados, devueltos o aprobados.",
    categories: ["JOBSITE_LOG"],
  },
  {
    id: "operativo",
    title: "Otras alertas",
    description: "Stock negativo, certificación sin factura y uploads colgados.",
    categories: ["OPERATIONAL_OTHER"],
  },
  {
    id: "digest",
    title: "Resumen diario",
    description: "Un mail matutino con colas estilo Pendientes (dirección).",
    categories: ["DAILY_DIGEST"],
  },
];

function sourceBadgeLabel(row: PreferenceRow): string {
  switch (row.source) {
    case "user":
      return "Preferencia guardada";
    case "tenant_policy":
      return row.effectiveEnabled
        ? "Política de la organización: activado"
        : "Política de la organización: desactivado";
    case "role_default":
    default:
      return `Según tu rol: ${row.defaultEnabled ? "activado" : "desactivado"}`;
  }
}

export function NotificationEmailPreferencesForm({
  preferences,
  showLeadershipPolicyLink = false,
}: PreferenceFormProps) {
  const [rows, setRows] = useState(preferences);
  const [error, setError] = useState<string | null>(null);
  const [inflight, setInflight] = useState<ReadonlySet<NotificationEmailCategory>>(
    () => new Set(),
  );
  const [, startTransition] = useTransition();
  const previousByCategory = useRef(
    new Map<NotificationEmailCategory, PreferenceRow>(),
  );
  const inflightRef = useRef(inflight);
  inflightRef.current = inflight;

  useEffect(() => {
    // Sync from server when RSC props change. Ignore while a toggle is in flight so a
    // stale preferences prop cannot overwrite a successful optimistic/server result.
    if (inflightRef.current.size > 0) return;
    setRows(preferences);
  }, [preferences]);

  const sections = useMemo(
    () =>
      CATEGORY_SECTIONS.map((section) => ({
        ...section,
        rows: section.categories
          .map((cat) => rows.find((r) => r.category === cat))
          .filter((r): r is PreferenceRow => Boolean(r)),
      })).filter((s) => s.rows.length > 0),
    [rows],
  );

  function markInflight(category: NotificationEmailCategory, on: boolean) {
    setInflight((prev) => {
      const next = new Set(prev);
      if (on) next.add(category);
      else next.delete(category);
      return next;
    });
  }

  function onToggle(category: NotificationEmailCategory, emailEnabled: boolean) {
    setError(null);
    const previous = rows.find((r) => r.category === category);
    if (previous) previousByCategory.current.set(category, previous);
    markInflight(category, true);
    setRows((prev) =>
      prev.map((r) =>
        r.category === category
          ? {
              ...r,
              emailEnabled,
              effectiveEnabled: emailEnabled,
              isExplicit: true,
              source: "user",
            }
          : r,
      ),
    );
    startTransition(async () => {
      const result = await upsertMyNotificationEmailPreferenceAction({ category, emailEnabled });
      if ("error" in result) {
        setError(result.error);
        const rollback = previousByCategory.current.get(category);
        if (rollback) {
          setRows((prev) =>
            prev.map((r) => (r.category === category ? rollback : r)),
          );
        }
        markInflight(category, false);
        return;
      }
      if (result.preference) {
        setRows((prev) =>
          prev.map((r) => (r.category === category ? { ...r, ...result.preference } : r)),
        );
      }
      markInflight(category, false);
    });
  }

  function onReset(category: NotificationEmailCategory) {
    setError(null);
    markInflight(category, true);
    startTransition(async () => {
      const result = await resetMyNotificationEmailPreferenceAction({ category });
      if ("error" in result) {
        setError(result.error);
        markInflight(category, false);
        return;
      }
      if (result.preference) {
        setRows((prev) =>
          prev.map((r) => (r.category === category ? { ...r, ...result.preference } : r)),
        );
      }
      markInflight(category, false);
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <p>
          Acá elegís <span className="font-medium text-foreground">qué correos querés recibir vos</span>.
          La campana del encabezado no se apaga. Invitaciones, verificar email y restablecer
          contraseña siempre se envían.
        </p>
        {showLeadershipPolicyLink ? (
          <p className="mt-2">
            Las políticas de la empresa (alertas, canal CxP, CC a dirección y digest) están en{" "}
            <Link
              href="/configuracion/politicas#notificaciones"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Políticas → Notificaciones
            </Link>
            .
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {sections.map((section) => (
        <Card key={section.id} className="overflow-hidden border-border/80 shadow-sm">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="text-base">{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            {section.rows.map((row) => {
              const busy = inflight.has(row.category);
              return (
                <div key={row.category} className="space-y-2">
                  <SwitchField
                    id={`email-cat-${row.category}`}
                    label={NOTIFICATION_EMAIL_CATEGORY_LABEL_ES[row.category]}
                    description={
                      <div className="space-y-2">
                        <p>{NOTIFICATION_EMAIL_CATEGORY_DESCRIPTION_ES[row.category]}</p>
                        <Badge variant="secondary" className="font-normal">
                          {sourceBadgeLabel(row)}
                        </Badge>
                      </div>
                    }
                    checked={row.effectiveEnabled}
                    disabled={busy}
                    onCheckedChange={(v) => onToggle(row.category, v)}
                  />
                  {row.isExplicit ? (
                    <div className="flex justify-end px-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground"
                        disabled={busy}
                        onClick={() => onReset(row.category)}
                      >
                        Restablecer default
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
