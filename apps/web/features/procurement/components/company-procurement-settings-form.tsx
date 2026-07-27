"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { updateCompanyProcurementSettingsAction } from "@/app/(app)/configuracion/compras/actions";

interface Props {
  companyId: string;
  companyName: string;
  settings: CompanyProcurementSettingsView;
  canEdit: boolean;
}

export function CompanyProcurementSettingsForm({
  companyId,
  companyName,
  settings,
  canEdit,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [allowDirectPo, setAllowDirectPo] = useState(settings.allowDirectPo);
  const [allowSelfApproval, setAllowSelfApproval] = useState(settings.allowSelfApproval);
  const [allowEmergencyDirectPo, setAllowEmergencyDirectPo] = useState(settings.allowEmergencyDirectPo);
  const [apPaymentNotificationChannel, setApPaymentNotificationChannel] = useState(
    settings.apPaymentNotificationChannel,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Política de compras — {companyName}</CardTitle>
        <CardDescription>
          Umbrales de aprobación, cotizaciones, desvíos y canal de avisos de pago a proveedores.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          action={(fd) => {
            if (!canEdit) return;
            startTransition(async () => {
              setError(null);
              setSuccess(false);
              const res = await updateCompanyProcurementSettingsAction(companyId, {
                poApprovalThresholdArs: fd.get("poApprovalThresholdArs")?.toString() || null,
                purchaseRequestRequiredAboveArs:
                  fd.get("purchaseRequestRequiredAboveArs")?.toString() || null,
                minQuotesRequired: Number(fd.get("minQuotesRequired")),
                maxQuotesAllowed: Number(fd.get("maxQuotesAllowed")),
                allowDirectPo,
                allowSelfApproval,
                allowEmergencyDirectPo,
                varianceSoftAlertPct: fd.get("varianceSoftAlertPct")?.toString() ?? "10",
                varianceNoteRequiredPct: fd.get("varianceNoteRequiredPct")?.toString() ?? "25",
                varianceExtraApprovalPct: fd.get("varianceExtraApprovalPct")?.toString() ?? "25",
                overReceiptTolerancePct: fd.get("overReceiptTolerancePct")?.toString() ?? "0",
                invoiceMatchTolerancePct: fd.get("invoiceMatchTolerancePct")?.toString() ?? "0",
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p className="text-sm text-green-600 dark:text-green-500">Configuración guardada.</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="poApprovalThresholdArs">Umbral aprobación OC (ARS)</Label>
              <Input
                id="poApprovalThresholdArs"
                name="poApprovalThresholdArs"
                defaultValue={settings.poApprovalThresholdArs ?? ""}
                placeholder="3000000"
                disabled={!canEdit || pending}
              />
              <p className="text-xs text-muted-foreground">
                Montos iguales o superiores requieren aprobación de administración.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchaseRequestRequiredAboveArs">Umbral solicitud obligatoria (ARS)</Label>
              <Input
                id="purchaseRequestRequiredAboveArs"
                name="purchaseRequestRequiredAboveArs"
                defaultValue={settings.purchaseRequestRequiredAboveArs ?? ""}
                placeholder="Opcional"
                disabled={!canEdit || pending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="minQuotesRequired">Cotizaciones mínimas</Label>
              <Input
                id="minQuotesRequired"
                name="minQuotesRequired"
                type="number"
                min={1}
                max={10}
                defaultValue={settings.minQuotesRequired}
                disabled={!canEdit || pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxQuotesAllowed">Cotizaciones máximas</Label>
              <Input
                id="maxQuotesAllowed"
                name="maxQuotesAllowed"
                type="number"
                min={1}
                max={20}
                defaultValue={settings.maxQuotesAllowed}
                disabled={!canEdit || pending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="varianceSoftAlertPct">Alerta suave (%)</Label>
              <Input
                id="varianceSoftAlertPct"
                name="varianceSoftAlertPct"
                defaultValue={settings.varianceSoftAlertPct}
                disabled={!canEdit || pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="varianceNoteRequiredPct">Nota obligatoria desde (%)</Label>
              <Input
                id="varianceNoteRequiredPct"
                name="varianceNoteRequiredPct"
                defaultValue={settings.varianceNoteRequiredPct}
                disabled={!canEdit || pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="varianceExtraApprovalPct">Aprobación extra desde (%)</Label>
              <Input
                id="varianceExtraApprovalPct"
                name="varianceExtraApprovalPct"
                defaultValue={settings.varianceExtraApprovalPct}
                disabled={!canEdit || pending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="overReceiptTolerancePct">Tolerancia sobrecantidad recepción (%)</Label>
              <Input
                id="overReceiptTolerancePct"
                name="overReceiptTolerancePct"
                defaultValue={settings.overReceiptTolerancePct}
                disabled={!canEdit || pending}
              />
              <p className="text-xs text-muted-foreground">
                0–5%. Default 0 = no permitir recibir más que la OC ([BR-PUR-006]).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceMatchTolerancePct">Tolerancia matching factura (%)</Label>
              <Input
                id="invoiceMatchTolerancePct"
                name="invoiceMatchTolerancePct"
                defaultValue={settings.invoiceMatchTolerancePct}
                disabled={!canEdit || pending}
              />
              <p className="text-xs text-muted-foreground">
                Aviso (no bloqueo) si factura supera recibido + tolerancia ([BR-PUR-012]).
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apPaymentNotificationChannel">Avisos de pago a proveedores</Label>
            <Select
              value={apPaymentNotificationChannel}
              onValueChange={(v) =>
                setApPaymentNotificationChannel(v as "IN_APP" | "IN_APP_AND_EMAIL")
              }
              disabled={!canEdit || pending}
            >
              <SelectTrigger id="apPaymentNotificationChannel">
                <SelectValue placeholder="Canal de avisos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_APP_AND_EMAIL">In-app + email</SelectItem>
                <SelectItem value="IN_APP">Solo in-app</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Cuando hay una CxP lista para pagar o se confirma un pago. El email requiere Resend
              configurado; si no, queda solo la notificación en la plataforma.
            </p>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowDirectPo}
                onChange={(e) => setAllowDirectPo(e.target.checked)}
                disabled={!canEdit || pending}
                className="rounded border"
              />
              Permitir OC directa (sin solicitud previa bajo umbral)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowSelfApproval}
                onChange={(e) => setAllowSelfApproval(e.target.checked)}
                disabled={!canEdit || pending}
                className="rounded border"
              />
              Permitir auto-aprobación solo bajo umbral y sin desvío extra
            </label>
            <p className="-mt-2 text-xs text-muted-foreground">
              Si la OC supera el umbral de administración o requiere aprobación extra por desvío,
              quien originó la compra no puede aprobarla aunque esta opción esté activa.
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowEmergencyDirectPo}
                onChange={(e) => setAllowEmergencyDirectPo(e.target.checked)}
                disabled={!canEdit || pending}
                className="rounded border"
              />
              Compra de emergencia sin solicitud (solo administración)
            </label>
          </div>

          {canEdit && (
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar política"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
