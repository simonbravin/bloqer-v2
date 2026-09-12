"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CompanyProcurementSettingsView } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SwitchField } from "@/components/ui/switch-field";
import { updateCompanyProcurementSettingsAction } from "@/app/(app)/configuracion/politicas/actions";

interface Props {
  companyId: string;
  companyName: string;
  settings: CompanyProcurementSettingsView;
  canEdit: boolean;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Company-level alert generation / AP channel (not personal email prefs).
 * Partial update via the shared procurement settings action.
 */
export function CompanyProcurementNotificationSettingsForm({
  companyId,
  companyName,
  settings,
  canEdit,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [apPaymentNotificationChannel, setApPaymentNotificationChannel] = useState(
    settings.apPaymentNotificationChannel,
  );
  const [deliveryAlertsEnabled, setDeliveryAlertsEnabled] = useState(
    settings.deliveryAlertsEnabled,
  );
  const [neededByAlertsEnabled, setNeededByAlertsEnabled] = useState(
    settings.neededByAlertsEnabled,
  );
  const [receiptToInvoiceAlertsEnabled, setReceiptToInvoiceAlertsEnabled] = useState(
    settings.receiptToInvoiceAlertsEnabled,
  );

  const togglesDisabled = !canEdit || pending;

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="text-base">Alertas y canal de avisos — {companyName}</CardTitle>
        <CardDescription>
          Define si la empresa genera alertas de compras y el canal CxP (campana vs campana+email).
          Cada persona elige categorías de correo en{" "}
          <Link
            href="/configuracion/notificaciones"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Configuración → Notificaciones
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <form
          className="space-y-8"
          action={(fd) => {
            if (!canEdit) return;
            startTransition(async () => {
              setError(null);
              setSuccess(false);
              const deliveryGraceRaw = Number(fd.get("deliveryOverdueGraceDays"));
              const neededByGraceRaw = Number(fd.get("neededByOverdueGraceDays"));
              const receiptToInvoiceRaw = Number(fd.get("receiptToInvoiceSlaDays"));
              const res = await updateCompanyProcurementSettingsAction(companyId, {
                deliveryOverdueGraceDays:
                  Number.isFinite(deliveryGraceRaw) && deliveryGraceRaw >= 0
                    ? deliveryGraceRaw
                    : 0,
                neededByOverdueGraceDays:
                  Number.isFinite(neededByGraceRaw) && neededByGraceRaw >= 0
                    ? neededByGraceRaw
                    : 0,
                receiptToInvoiceSlaDays:
                  Number.isFinite(receiptToInvoiceRaw) && receiptToInvoiceRaw >= 0
                    ? receiptToInvoiceRaw
                    : 5,
                deliveryAlertsEnabled,
                neededByAlertsEnabled,
                receiptToInvoiceAlertsEnabled,
                apPaymentNotificationChannel,
              });
              if ("error" in res) {
                setError(res.error);
                return;
              }
              setSuccess(true);
              router.refresh();
            });
          }}
        >
          {error ? (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {success ? (
            <p
              className="rounded-lg border border-emerald-500/30 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
              role="status"
            >
              Configuración guardada.
            </p>
          ) : null}

          <Section
            title="Alertas de vencimiento"
            description="Recordatorios diarios para recepción, fecha requerida y facturación ([D-097])."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="notif-deliveryOverdueGraceDays">Días de gracia entrega OC</Label>
                <Input
                  id="notif-deliveryOverdueGraceDays"
                  name="deliveryOverdueGraceDays"
                  type="number"
                  min={0}
                  max={60}
                  defaultValue={settings.deliveryOverdueGraceDays}
                  disabled={togglesDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Colchón antes de marcar como vencida una OC confirmada sin recibir. Default 0.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notif-neededByOverdueGraceDays">
                  Días de gracia fecha requerida SC
                </Label>
                <Input
                  id="notif-neededByOverdueGraceDays"
                  name="neededByOverdueGraceDays"
                  type="number"
                  min={0}
                  max={60}
                  defaultValue={settings.neededByOverdueGraceDays}
                  disabled={togglesDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Colchón antes de alertar SC con fecha requerida pasada y sin OC. Default 0.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notif-receiptToInvoiceSlaDays">Días recepción → factura</Label>
                <Input
                  id="notif-receiptToInvoiceSlaDays"
                  name="receiptToInvoiceSlaDays"
                  type="number"
                  min={0}
                  max={60}
                  defaultValue={settings.receiptToInvoiceSlaDays}
                  disabled={togglesDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Días desde primera recepción antes de alertar que falta registrar factura.
                  Default 5.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <SwitchField
                id="notif-deliveryAlertsEnabled"
                label="Alertar OC con entrega prevista vencida sin recibir"
                checked={deliveryAlertsEnabled}
                onCheckedChange={setDeliveryAlertsEnabled}
                disabled={togglesDisabled}
              />
              <SwitchField
                id="notif-neededByAlertsEnabled"
                label="Alertar SC con fecha requerida vencida y sin OC confirmada"
                checked={neededByAlertsEnabled}
                onCheckedChange={setNeededByAlertsEnabled}
                disabled={togglesDisabled}
              />
              <SwitchField
                id="notif-receiptToInvoiceAlertsEnabled"
                label="Alertar OC recibida sin factura del proveedor registrada"
                checked={receiptToInvoiceAlertsEnabled}
                onCheckedChange={setReceiptToInvoiceAlertsEnabled}
                disabled={togglesDisabled}
              />
            </div>
          </Section>

          <Separator />

          <Section
            title="Avisos de pago"
            description="Canal cuando hay CxP lista para pagar o se confirma un pago. El email personal sigue sujeto a Configuración → Notificaciones."
          >
            <div className="space-y-2 max-w-md">
              <Label htmlFor="notif-apPaymentNotificationChannel">
                Avisos de pago a proveedores
              </Label>
              <Select
                value={apPaymentNotificationChannel}
                onValueChange={(v) =>
                  setApPaymentNotificationChannel(v as "IN_APP" | "IN_APP_AND_EMAIL")
                }
                disabled={togglesDisabled}
              >
                <SelectTrigger id="notif-apPaymentNotificationChannel">
                  <SelectValue placeholder="Canal de avisos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_APP_AND_EMAIL">In-app + email</SelectItem>
                  <SelectItem value="IN_APP">Solo in-app</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                El email requiere Resend configurado; si no, queda solo la notificación en la
                plataforma. Aunque el canal permita email, cada usuario puede apagar la categoría
                CxP en sus preferencias.
              </p>
            </div>
          </Section>

          {canEdit ? (
            <div className="flex justify-end border-t pt-6">
              <Button type="submit" disabled={pending} className="min-w-40">
                {pending ? "Guardando…" : "Guardar avisos"}
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
