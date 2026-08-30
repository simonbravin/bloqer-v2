"use client";

import { useState, useTransition, type ReactNode } from "react";
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

  const togglesDisabled = !canEdit || pending;

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="text-base">Política de compras — {companyName}</CardTitle>
        <CardDescription>
          Umbrales de aprobación, cotizaciones, desvíos, alertas de vencimiento y canal de avisos
          de pago a proveedores.
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
            title="Umbrales y cotizaciones"
            description="Montos en ARS y cantidad de cotizaciones exigidas antes de emitir OC."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="poApprovalThresholdArs">Umbral aprobación OC (ARS)</Label>
                <DecimalInput
                  id="poApprovalThresholdArs"
                  name="poApprovalThresholdArs"
                  value={poThreshold}
                  onValueChange={setPoThreshold}
                  placeholder="3.000.000,00"
                  disabled={togglesDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Montos iguales o superiores requieren aprobación de administración.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchaseRequestRequiredAboveArs">
                  Umbral solicitud obligatoria (ARS)
                </Label>
                <DecimalInput
                  id="purchaseRequestRequiredAboveArs"
                  name="purchaseRequestRequiredAboveArs"
                  value={prThreshold}
                  onValueChange={setPrThreshold}
                  placeholder="Opcional"
                  disabled={togglesDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Sobre este monto la OC directa exige solicitud con cotizaciones, salvo emergencia
                  documentada por OWNER/ADMIN ([BR-PUR-008]).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="minQuotesRequired">Cotizaciones mínimas</Label>
                <Input
                  id="minQuotesRequired"
                  name="minQuotesRequired"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={settings.minQuotesRequired}
                  disabled={togglesDisabled}
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
                  disabled={togglesDisabled}
                />
              </div>
            </div>
          </Section>

          <Separator />

          <Section
            title="Desvíos y tolerancias"
            description="Porcentajes que disparan justificación, aprobación extra o avisos de matching."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="varianceSoftAlertPct">Nota / alerta por desvío desde (%)</Label>
                <DecimalInput
                  id="varianceSoftAlertPct"
                  name="varianceSoftAlertPct"
                  value={softPct}
                  onValueChange={setSoftPct}
                  disabled={togglesDisabled}
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
                  disabled={togglesDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="overReceiptTolerancePct">Tolerancia sobre-recepción (%)</Label>
                <DecimalInput
                  id="overReceiptTolerancePct"
                  name="overReceiptTolerancePct"
                  value={overReceiptPct}
                  onValueChange={setOverReceiptPct}
                  disabled={togglesDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Máximo % por encima de la cantidad pedida al confirmar recepción.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoiceMatchTolerancePct">Tolerancia matching factura (%)</Label>
                <DecimalInput
                  id="invoiceMatchTolerancePct"
                  name="invoiceMatchTolerancePct"
                  value={invoiceMatchPct}
                  onValueChange={setInvoiceMatchPct}
                  disabled={togglesDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Aviso (no bloqueo) si factura supera recibido + tolerancia ([BR-PUR-012]).
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="approvalSlaHours">SLA recordatorio compras (horas)</Label>
                <Input
                  id="approvalSlaHours"
                  name="approvalSlaHours"
                  type="number"
                  min={1}
                  max={720}
                  defaultValue={settings.approvalSlaHours}
                  disabled={togglesDisabled}
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Horas sin avance en OC enviada o SC sin cotizar antes de avisar a OWNER/ADMIN
                  ([BR-PUR-015]). Default 72.
                </p>
              </div>
            </div>
          </Section>

          <Separator />

          <Section
            title="Alertas de vencimiento"
            description="Recordatorios diarios para recepción, fecha requerida y facturación ([D-097])."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="deliveryOverdueGraceDays">Días de gracia entrega OC</Label>
                <Input
                  id="deliveryOverdueGraceDays"
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
                <Label htmlFor="neededByOverdueGraceDays">Días de gracia fecha requerida SC</Label>
                <Input
                  id="neededByOverdueGraceDays"
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
                <Label htmlFor="receiptToInvoiceSlaDays">Días recepción → factura</Label>
                <Input
                  id="receiptToInvoiceSlaDays"
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
                id="deliveryAlertsEnabled"
                label="Alertar OC con entrega prevista vencida sin recibir"
                checked={deliveryAlertsEnabled}
                onCheckedChange={setDeliveryAlertsEnabled}
                disabled={togglesDisabled}
              />
              <SwitchField
                id="neededByAlertsEnabled"
                label="Alertar SC con fecha requerida vencida y sin OC confirmada"
                checked={neededByAlertsEnabled}
                onCheckedChange={setNeededByAlertsEnabled}
                disabled={togglesDisabled}
              />
              <SwitchField
                id="receiptToInvoiceAlertsEnabled"
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
            description="Canal cuando hay CxP lista para pagar o se confirma un pago."
          >
            <div className="space-y-2 max-w-md">
              <Label htmlFor="apPaymentNotificationChannel">Avisos de pago a proveedores</Label>
              <Select
                value={apPaymentNotificationChannel}
                onValueChange={(v) =>
                  setApPaymentNotificationChannel(v as "IN_APP" | "IN_APP_AND_EMAIL")
                }
                disabled={togglesDisabled}
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
                El email requiere Resend configurado; si no, queda solo la notificación en la
                plataforma.
              </p>
            </div>
          </Section>

          <Separator />

          <Section
            title="Reglas de emisión de OC"
            description="Quién puede saltear solicitud o auto-aprobar bajo umbral."
          >
            <div className="space-y-2">
              <SwitchField
                id="allowDirectPo"
                label="Permitir OC directa (sin solicitud previa bajo umbral)"
                checked={allowDirectPo}
                onCheckedChange={setAllowDirectPo}
                disabled={togglesDisabled}
              />
              <SwitchField
                id="allowSelfApproval"
                label="Permitir auto-aprobación solo bajo umbral y sin desvío extra"
                description="Si la OC supera el umbral de administración o requiere aprobación extra por desvío, quien originó la compra no puede aprobarla aunque esta opción esté activa."
                checked={allowSelfApproval}
                onCheckedChange={setAllowSelfApproval}
                disabled={togglesDisabled}
              />
              <SwitchField
                id="allowEmergencyDirectPo"
                label="Compra de emergencia sin solicitud (solo OWNER/ADMIN, sobre el umbral)"
                description="Permite OC directa por encima del umbral de solicitud con motivo obligatorio, aunque la OC directa general esté deshabilitada."
                checked={allowEmergencyDirectPo}
                onCheckedChange={setAllowEmergencyDirectPo}
                disabled={togglesDisabled}
              />
            </div>
          </Section>

          <Separator />

          <Section
            title="Atajos operativos"
            description="Acortan pasos del circuito OC sin cambiar estados ni reglas de dinero. Por defecto apagados."
          >
            <div className="space-y-2">
              <SwitchField
                id="allowAuthorizeAndCommit"
                label="Un paso: autorizar y comprometer"
                description="PM/Compras pueden autorizar y comprometer OC bajo umbral (sin desvío extra). OWNER/ADMIN también en OC de alto nivel."
                checked={allowAuthorizeAndCommit}
                onCheckedChange={setAllowAuthorizeAndCommit}
                disabled={togglesDisabled}
              />
              <SwitchField
                id="autoConfirmOnApprove"
                label="Al aprobar, confirmar al proveedor (bajo umbral)"
                description="Aprobar una OC que no es de alto nivel la deja Confirmada = Comprometido. Alto nivel sigue Aprobar → Confirmar (o Autorizar y comprometer si sos Admin)."
                checked={autoConfirmOnApprove}
                onCheckedChange={setAutoConfirmOnApprove}
                disabled={togglesDisabled}
              />
              <SwitchField
                id="autoDraftApInvoiceOnReceipt"
                label="Al recibir, crear borrador de factura"
                description="Al confirmar la recepción se crea un borrador de factura del proveedor (no abre deuda). Finanzas completa y emite para crear la CxP."
                checked={autoDraftApInvoiceOnReceipt}
                onCheckedChange={setAutoDraftApInvoiceOnReceipt}
                disabled={togglesDisabled}
              />
            </div>
          </Section>

          {canEdit ? (
            <div className="flex justify-end border-t pt-6">
              <Button type="submit" disabled={pending} className="min-w-40">
                {pending ? "Guardando…" : "Guardar política"}
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
