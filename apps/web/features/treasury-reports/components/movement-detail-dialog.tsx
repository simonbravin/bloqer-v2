"use client";

import Link from "next/link";
import type { MovementReportRow } from "@bloqer/services";
import { formatDate } from "@/lib/format";
import { formatGroupedDecimal } from "@bloqer/utils";
import {
  formatMoneyAmount,
  formatSignedMoneyAmount,
  signedMoneyAmountToneClass,
} from "@/lib/format-money";
import { accountMovementStatusLabel } from "@/features/treasury/lib/account-movement-status-label";
import { DocumentClassBadge } from "@/features/finance/components/document-class-badge";
import { Button } from "@/components/ui/button";
import { DetailField, DetailFieldGrid } from "@/components/ui/detail-field-grid";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MOVEMENT_TYPE_LABELS } from "../lib/movement-type-labels";

export type MovementDetailDialogRow = Pick<
  MovementReportRow,
  | "description"
  | "movementDate"
  | "valueDate"
  | "accountName"
  | "type"
  | "classLabel"
  | "classFamily"
  | "status"
  | "sourceLabel"
  | "projectName"
  | "projectId"
  | "counterpartyName"
  | "documentRef"
  | "externalInvoiceRef"
  | "currency"
  | "fxRate"
  | "amountArs"
  | "signedAmount"
  | "runningBalance"
  | "detailHref"
>;

function safeDetailHref(url: string | null): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u.startsWith("/") || u.startsWith("//")) return null;
  return u;
}

export function MovementDetailDialog({
  row,
  canLinkProjects = false,
}: {
  row: MovementDetailDialogRow;
  canLinkProjects?: boolean;
}) {
  const href = safeDetailHref(row.detailHref);
  const typeLabel = MOVEMENT_TYPE_LABELS[row.type] ?? row.type;
  const projectLabel = row.projectName ?? (row.projectId ? "Obra" : "Empresa");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="block w-full min-w-0 truncate text-left underline decoration-muted-foreground/60 underline-offset-2 hover:text-foreground hover:decoration-foreground"
          title={row.description || "Ver detalle del movimiento"}
        >
          {row.description || "Sin descripción"}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalle del movimiento</DialogTitle>
          <DialogDescription>
            {typeLabel} · {formatDate(row.movementDate)}
          </DialogDescription>
        </DialogHeader>
        <DetailFieldGrid>
          <DetailField label="Descripción" fullWidth>
            <span className="whitespace-pre-wrap font-normal">{row.description || "—"}</span>
          </DetailField>
          <DetailField label="Cuenta">{row.accountName}</DetailField>
          <DetailField label="Fecha contable">{formatDate(row.movementDate)}</DetailField>
          <DetailField label="Fecha valor">{row.valueDate == null ? "Sin registrar" : formatDate(row.valueDate)}</DetailField>
          <DetailField label="Tipo">{typeLabel}</DetailField>
          <DetailField label="Clase">
            {row.classLabel ? (
              <DocumentClassBadge classLabel={row.classLabel} classFamily={row.classFamily} />
            ) : (
              "—"
            )}
          </DetailField>
          <DetailField label="Estado">{accountMovementStatusLabel(row.status)}</DetailField>
          <DetailField label="Origen">{row.sourceLabel || "—"}</DetailField>
          <DetailField label="Proyecto">
            {row.projectId && canLinkProjects ? (
              <Link
                href={`/proyectos/${row.projectId}`}
                className="underline underline-offset-2 hover:text-foreground"
              >
                {projectLabel}
              </Link>
            ) : (
              projectLabel
            )}
          </DetailField>
          {row.counterpartyName ? (
            <DetailField label="Contraparte">{row.counterpartyName}</DetailField>
          ) : null}
          {row.documentRef ? (
            <DetailField label="Factura">{row.documentRef}</DetailField>
          ) : null}
          {row.externalInvoiceRef ? (
            <DetailField label="Comprobante">{row.externalInvoiceRef}</DetailField>
          ) : null}
          <DetailField label="Importe">
            <span className={cn("tabular-nums font-mono", signedMoneyAmountToneClass(row.signedAmount))}>
              {row.currency} {formatSignedMoneyAmount(row.signedAmount)}
            </span>
          </DetailField>
          {row.currency !== "ARS" ? (
            <>
              <DetailField label={`Tipo de cambio · ARS por 1 ${row.currency}`}>
                {row.fxRate == null ? "No disponible" : formatGroupedDecimal(row.fxRate, 6)}
              </DetailField>
              <DetailField label="Equivalente histórico ARS">
                {row.amountArs == null ? "No disponible" : formatMoneyAmount(row.amountArs, "ARS")}
              </DetailField>
            </>
          ) : null}
          {row.runningBalance != null && row.runningBalance !== "" ? (
            <DetailField label="Saldo">{formatMoneyAmount(row.runningBalance, row.currency)}</DetailField>
          ) : null}
        </DetailFieldGrid>
        {href ? (
          <DialogFooter>
            <Button asChild>
              <Link href={href}>Ver documento origen</Link>
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
