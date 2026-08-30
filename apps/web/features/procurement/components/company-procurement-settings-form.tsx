"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CompanyProcurementSettingsView } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
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
import { updateCompanyProcurementSettingsAction } from "@/app/(app)/configuracion/politicas/actions";

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
  const [allowAuthorizeAndCommit, setAllowAuthorizeAndCommit] = useState(
    settings.allowAuthorizeAndCommit ?? false,
  );
  const [autoConfirmOnApprove, setAutoConfirmOnApprove] = useState(
    settings.autoConfirmOnApprove ?? false,
  );
  const [autoDraftApInvoiceOnReceipt, setAutoDraftApInvoiceOnReceipt] = useState(
    settings.autoDraftApInvoiceOnReceipt ?? false,
  );
  const [allowEmergencyDirectPo, setAllowEmergencyDirectPo] = useState(settings.allowEmergencyDirectPo);
  const [poThreshold, setPoThreshold] = useState(settings.poApprovalThresholdArs ?? "");
  const [prThreshold, setPrThreshold] = useState(settings.purchaseRequestRequiredAboveArs ?? "");
  const [softPct, setSoftPct] = useState(settings.varianceSoftAlertPct);
  const [extraPct, setExtraPct] = useState(settings.varianceExtraApprovalPct);
  const [overReceiptPct, setOverReceiptPct] = useState(settings.overReceiptTolerancePct);
  const [invoiceMatchPct, setInvoiceMatchPct] = useState(settings.invoiceMatchTolerancePct);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Política de compras — {companyName}</CardTitle>
        <CardDescription>
          Umbrales de aprobación, cotizaciones, desvíos, alertas de vencimiento y canal de avisos
          de pago a proveedores.
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
              const soft = fd.get("varianceSoftAlertPct")?.toString() ?? "10";
              const slaRaw = Number(fd.get("approvalSlaHours"));
              const minQuotes = Number(fd.get("minQuotesRequired"));
              const maxQuotes = Number(fd.get("maxQuotesAllowed"));
              const deliveryGraceRaw = Number(fd.get("deliveryOverdueGraceDays"));
              const neededByGraceRaw = Number(fd.get("neededByOverdueGraceDays"));
              const receiptToInvoiceRaw = Number(fd.get("receiptToInvoiceSlaDays"));
              const res = await updateCompanyProcurementSettingsAction(companyId, {
                poApprovalThresholdArs: fd.get("poApprovalThresholdArs")?.toString() || null,
                purchaseRequestRequiredAboveArs:
                  fd.get("purchaseRequestRequiredAboveArs")?.toString() || null,
                minQuotesRequired: Number.isFinite(minQuotes) ? minQuotes : undefined,
                maxQuotesAllowed: Number.isFinite(maxQuotes) ? maxQuotes : undefined,
                allowDirectPo,
                allowSelfApproval,
                allowAuthorizeAndCommit,
                autoConfirmOnApprove,
                autoDraftApInvoiceOnReceipt,
                allowEmergencyDirectPo,
                varianceSoftAlertPct: soft,
                // Kept in sync with soft until Q-051 decides a distinct note tier ([BR-PUR-009]).
                varianceNoteRequiredPct: soft,
                varianceExtraApprovalPct: fd.get("varianceExtraApprovalPct")?.toString() ?? "25",
                overReceiptTolerancePct: fd.get("overReceiptTolerancePct")?.toString() ?? "0",
                invoiceMatchTolerancePct: fd.get("invoiceMatchTolerancePct")?.toString() ?? "0",
                approvalSlaHours: Number.isFinite(slaRaw) && slaRaw > 0 ? slaRaw : 72,
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p className="text-sm text-green-600 dark:text-green-500">Configuración guardada.</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="poApprovalThresholdArs">Umbral aprobación OC (ARS)</Label>
              <DecimalInput
                id="poApprovalThresholdArs"
                name="poApprovalThresholdArs"
                value={poThreshold}
                onValueChange={setPoThreshold}
                placeholder="3.000.000,00"
                disabled={!canEdit || pending}
              />
              <p className="text-xs text-muted-foreground">
                Montos iguales o superiores requieren aprobación de administración.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchaseRequestRequiredAboveArs">Umbral solicitud obligatoria (ARS)</Label>
              <DecimalInput
                id="purchaseRequestRequiredAboveArs"
                name="purchaseRequestRequiredAboveArs"
                value={prThreshold}
                onValueChange={setPrThreshold}
                placeholder="Opcional"
                disabled={!canEdit || pending}
              />
              <p className="text-xs text-muted-foreground">
                Sobre este monto la OC directa exige solicitud con cotizaciones, salvo emergencia
                documentada por OWNER/ADMIN ([BR-PUR-008]).
              </p>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="varianceSoftAlertPct">Nota / alerta por desvío desde (%)</Label>
              <DecimalInput
                id="varianceSoftAlertPct"
                name="varianceSoftAlertPct"
                value={softPct}
                onValueChange={setSoftPct}
                disabled={!canEdit || pending}
              />
              <p className="text-xs text-muted-foreground">
                Desde este % hasta el de aprobación extra se exige justificación en la línea
                ([BR-PUR-009]).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="varianceExtraApprovalPct">Aprobación administración desde (%)</Label>
              <DecimalInput
                id="varianceExtraApprovalPct"
                name="varianceExtraApprovalPct"
                value={extraPct}
                onValueChange={setExtraPct}
                disabled={!canEdit || pending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="overReceiptTolerancePct">Tolerancia sobrecantidad recepción (%)</Label>
              <DecimalInput
                id="overReceiptTolerancePct"
                name="overReceiptTolerancePct"
                value={overReceiptPct}
                onValueChange={setOverReceiptPct}
                disabled={!canEdit || pending}
              />
              <p className="text-xs text-muted-foreground">
                0–5%. Default 0 = no permitir recibir más que la OC ([BR-PUR-006]).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceMatchTolerancePct">Tolerancia matching factura (%)</Label>
              <DecimalInput
                id="invoiceMatchTolerancePct"
                name="invoiceMatchTolerancePct"
                value={invoiceMatchPct}
                onValueChange={setInvoiceMatchPct}
                disabled={!canEdit || pending}
              />
              <p className="text-xs text-muted-foreground">
                Aviso (no bloqueo) si factura supera recibido + tolerancia ([BR-PUR-012]).
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="approvalSlaHours">SLA recordatorio compras (horas)</Label>
            <Input
              id="approvalSlaHours"
              name="approvalSlaHours"
              type="number"
              min={1}
              max={720}
              defaultValue={settings.approvalSlaHours}
              disabled={!canEdit || pending}
            />
            <p className="text-xs text-muted-foreground">
              Horas sin avance en OC enviada o SC sin cotizar antes de avisar a OWNER/ADMIN
              ([BR-PUR-015]). Default 72.
            </p>
          </div>

          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <h4 className="text-sm font-medium">Alertas de vencimiento en compras</h4>
              <p className="text-xs text-muted-foreground">
                Recordatorios diarios para recepción, fecha requerida y facturación de OC recibidas
                ([D-097]). Se emiten a quien puede accionar (compras/depósito, aprobadores,
                administración) con CC a OWNER/ADMIN.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="deliveryOverdueGraceDays">
                  Días de gracia entrega OC
                </Label>
                <Input
                  id="deliveryOverdueGraceDays"
                  name="deliveryOverdueGraceDays"
                  type="number"
                  min={0}
                  max={60}
                  defaultValue={settings.deliveryOverdueGraceDays}
                  disabled={!canEdit || pending}
                />
                <p className="text-xs text-muted-foreground">
                  Colchón antes de marcar como vencida una OC confirmada sin recibir. Default 0.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="neededByOverdueGraceDays">
                  Días de gracia fecha requerida SC
                </Label>
                <Input
                  id="neededByOverdueGraceDays"
                  name="neededByOverdueGraceDays"
                  type="number"
                  min={0}
                  max={60}
                  defaultValue={settings.neededByOverdueGraceDays}
                  disabled={!canEdit || pending}
                />
                <p className="text-xs text-muted-foreground">
                  Colchón antes de alertar SC con fecha requerida pasada y sin OC. Default 0.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="receiptToInvoiceSlaDays">
                  Días recepción → factura
                </Label>
                <Input
                  id="receiptToInvoiceSlaDays"
                  name="receiptToInvoiceSlaDays"
                  type="number"
                  min={0}
                  max={60}
                  defaultValue={settings.receiptToInvoiceSlaDays}
                  disabled={!canEdit || pending}
                />
                <p className="text-xs text-muted-foreground">
                  Días desde primera recepción antes de alertar que falta registrar factura.
                  Default 5.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={deliveryAlertsEnabled}
                  onChange={(e) => setDeliveryAlertsEnabled(e.target.checked)}
                  disabled={!canEdit || pending}
                  className="rounded border"
                />
                Alertar OC con entrega prevista vencida sin recibir
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={neededByAlertsEnabled}
                  onChange={(e) => setNeededByAlertsEnabled(e.target.checked)}
                  disabled={!canEdit || pending}
                  className="rounded border"
                />
                Alertar SC con fecha requerida vencida y sin OC confirmada
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={receiptToInvoiceAlertsEnabled}
                  onChange={(e) => setReceiptToInvoiceAlertsEnabled(e.target.checked)}
                  disabled={!canEdit || pending}
                  className="rounded border"
                />
                Alertar OC recibida sin factura del proveedor registrada
              </label>
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

            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-medium">Atajos operativos</p>
              <p className="text-xs text-muted-foreground -mt-1">
                Acortan pasos del circuito OC sin cambiar estados ni reglas de dinero. Por defecto
                apagados.
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowAuthorizeAndCommit}
                  onChange={(e) => setAllowAuthorizeAndCommit(e.target.checked)}
                  disabled={!canEdit || pending}
                  className="rounded border"
                />
                Un paso: autorizar y comprometer
              </label>
              <p className="-mt-2 text-xs text-muted-foreground">
                Si está encendido, PM/Compras pueden autorizar y comprometer OC bajo umbral (sin
                desvío extra). OWNER/ADMIN también pueden usarlo en OC de alto nivel.
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoConfirmOnApprove}
                  onChange={(e) => setAutoConfirmOnApprove(e.target.checked)}
                  disabled={!canEdit || pending}
                  className="rounded border"
                />
                Al aprobar, confirmar al proveedor (bajo umbral)
              </label>
              <p className="-mt-2 text-xs text-muted-foreground">
                Si está encendido, aprobar una OC que no es de alto nivel la deja Confirmada =
                Comprometido. Alto nivel sigue Aprobar → Confirmar (o Autorizar y comprometer si
                sos Admin).
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoDraftApInvoiceOnReceipt}
                  onChange={(e) => setAutoDraftApInvoiceOnReceipt(e.target.checked)}
                  disabled={!canEdit || pending}
                  className="rounded border"
                />
                Al recibir, crear borrador de factura
              </label>
              <p className="-mt-2 text-xs text-muted-foreground">
                Si está encendido, al confirmar la recepción se crea un borrador de factura del
                proveedor (no abre deuda). Finanzas completa y emite para crear la CxP.
              </p>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowEmergencyDirectPo}
                onChange={(e) => setAllowEmergencyDirectPo(e.target.checked)}
                disabled={!canEdit || pending}
                className="rounded border"
              />
              Compra de emergencia sin solicitud (solo OWNER/ADMIN, sobre el umbral)
            </label>
            <p className="-mt-2 text-xs text-muted-foreground">
              Permite OC directa por encima del umbral de solicitud con motivo obligatorio, aunque
              la OC directa general esté deshabilitada.
            </p>
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
