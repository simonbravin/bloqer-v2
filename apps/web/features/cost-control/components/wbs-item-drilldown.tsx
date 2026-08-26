"use client";

import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { WbsItemCostDetail } from "@bloqer/services";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { budgetUnitLabel } from "@/lib/budget-units";
import { formatMoneyAmount, formatQtyFromString, formatRatePctFromString } from "@/lib/format-money";

function fmt(v: string) {
  return formatMoneyAmount(v);
}
function fmtQty(v: string) {
  return formatQtyFromString(v);
}
function fmtPct(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  return `${formatRatePctFromString(v)} %`;
}
function fmtDate(d: Date) {
  return formatDate(d);
}

type Props = { detail: WbsItemCostDetail; projectId: string };

export function WbsItemDrilldown({ detail, projectId }: Props) {
  const ps = detail.progressSummary;
  const unit = detail.budgetItem?.unit;

  return (
    <div className="space-y-6">
      <Section
        title="Avance de la partida"
        action={
          <div className="flex flex-wrap gap-3 text-xs">
            <Link href={`/proyectos/${projectId}/libro-obra`} className="text-primary hover:underline">
              Libro de obra
            </Link>
            <Link href={`/proyectos/${projectId}/certificaciones`} className="text-primary hover:underline">
              Certificaciones
            </Link>
            <Link
              href={`/proyectos/${projectId}/materiales?wbsNodeId=${encodeURIComponent(detail.wbsNodeId)}`}
              className="text-primary hover:underline"
            >
              Materiales
            </Link>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3 text-sm">
          <ProgressCol
            title="Físico (libro)"
            rows={[
              { label: "% acum.", value: fmtPct(ps.physicalPctAcum) },
              {
                label: "Qty acum.",
                value: unit
                  ? `${fmtQty(ps.physicalQtyAcum)} ${budgetUnitLabel(unit) || unit}`
                  : fmtQty(ps.physicalQtyAcum),
              },
              { label: "Restante", value: fmtPct(ps.physicalRemainingPct) },
            ]}
          />
          <ProgressCol
            title="Económico (certificación)"
            rows={[
              {
                label: "Certificado",
                value: unit
                  ? `${fmtQty(ps.certifiedQty)} ${budgetUnitLabel(unit) || unit}`
                  : fmtQty(ps.certifiedQty),
              },
              { label: "Importe", value: fmt(ps.certifiedAmount) },
              {
                label: "% venta",
                value: fmtPct(ps.economicPctOfSale),
              },
              {
                label: "Saldo qty",
                value: unit
                  ? `${fmtQty(ps.remainingCertQty)} ${budgetUnitLabel(unit) || unit}`
                  : fmtQty(ps.remainingCertQty),
              },
            ]}
          />
          <ProgressCol
            title="Costo (capas)"
            rows={[
              {
                label: "% comprometido",
                value: fmtPct(ps.committedPctOfCost),
              },
              {
                label: "% devengado",
                value: fmtPct(ps.accruedPctOfCost),
              },
              {
                label: "% exposición",
                value: fmtPct(ps.expectedExposurePctOfCost),
              },
            ]}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          El avance físico del libro y el económico de certificación son independientes.
        </p>
      </Section>

      {detail.budgetItem ? (
        <Section title="Análisis de presupuesto">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Kv label="Unidad"     value={budgetUnitLabel(detail.budgetItem.unit) || detail.budgetItem.unit} />
            <Kv label="Cantidad"   value={fmtQty(detail.budgetItem.quantity)} />
            <Kv label="PU costo"   value={fmt(detail.budgetItem.unitCostDirect)} />
            <Kv label="Total costo" value={fmt(detail.budgetItem.totalCostDirect)} />
            <Kv label="PU venta"   value={fmt(detail.budgetItem.unitSalePrice)} />
            <Kv label="Total venta" value={fmt(detail.budgetItem.totalSalePrice)} />
          </div>
        </Section>
      ) : (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-3 text-sm text-yellow-700 dark:text-yellow-400">
          Este ítem EDT no tiene análisis de costo en el presupuesto.
        </div>
      )}

      <Section
        title="Materiales APU"
        action={
          <Link
            href={`/proyectos/${projectId}/materiales?wbsNodeId=${encodeURIComponent(detail.wbsNodeId)}`}
            className="text-xs text-primary hover:underline"
          >
            Ver en Materiales
          </Link>
        }
      >
        {detail.materialCommitments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin insumos de material comprables en el APU de esta partida.
          </p>
        ) : (
          <SimpleTable
            headers={["Insumo", "Un.", "Necesidad", "Pedido", "Recibido", "Faltante"]}
            rows={detail.materialCommitments.map((m) => [
              m.description,
              budgetUnitLabel(m.unit) || m.unit,
              fmtQty(m.needQty),
              fmtQty(m.orderedQty),
              fmtQty(m.receivedQty),
              <span
                key={m.costAnalysisLineId}
                className={
                  !/^-?0+(\.0+)?$/.test(m.shortfallQty.trim())
                    ? "font-medium text-amber-700 dark:text-amber-400"
                    : undefined
                }
              >
                {fmtQty(m.shortfallQty)}
                {m.overCommitted ? " (sobre)" : ""}
              </span>,
            ])}
          />
        )}
      </Section>

      {detail.certificationLines.length > 0 && (
        <Section title="Certificaciones de cliente">
          <SimpleTable
            headers={["N°", "Estado", "Período", "Importe"]}
            rows={detail.certificationLines.map((cl) => [
              String(cl.certNumber),
              cl.certStatus,
              `${fmtDate(cl.periodStart)} – ${fmtDate(cl.periodEnd)}`,
              fmt(cl.periodAmount),
            ])}
          />
        </Section>
      )}

      {detail.purchaseOrderLines.length > 0 && (
        <Section title="Órdenes de compra">
          <SimpleTable
            headers={["OC N°", "Estado", "Descripción", "Cant.", "PU", "Total", "Recibido"]}
            rows={detail.purchaseOrderLines.map((pol, idx) => [
              <Link
                key={`${pol.poId}-${idx}`}
                href={`/proyectos/${projectId}/ordenes-compra/${pol.poId}`}
                className="text-primary hover:underline font-medium"
              >
                {String(pol.poNumber)}
              </Link>,
              pol.poStatus,
              pol.description,
              fmtQty(pol.quantity),
              fmt(pol.unitPrice),
              fmt(pol.lineTotal),
              fmtQty(pol.receivedQty),
            ])}
          />
        </Section>
      )}

      {detail.subcontractLines.length > 0 && (
        <Section title="Subcontratos">
          <SimpleTable
            headers={["Código", "Estado", "Descripción", "Cant.", "PU", "Total", "Certif."]}
            rows={detail.subcontractLines.map((sl) => [
              <Link
                key={sl.subcontractId}
                href={`/proyectos/${projectId}/subcontratos/${sl.subcontractId}`}
                className="text-primary hover:underline font-medium"
              >
                {`SC-${String(sl.subcontractNumber).padStart(3, "0")}`}
              </Link>,
              sl.subcontractStatus,
              sl.description,
              fmtQty(sl.quantity),
              fmt(sl.unitPrice),
              fmt(sl.lineTotal),
              fmtQty(sl.certifiedQuantity),
            ])}
          />
        </Section>
      )}

      {detail.subcontractCertLines.length > 0 && (
        <Section title="Certificaciones de subcontratos">
          <SimpleTable
            headers={["N°", "Estado", "Fecha", "Cantidad período", "Importe"]}
            rows={detail.subcontractCertLines.map((scl) => [
              <Link
                key={scl.certId}
                href={`/proyectos/${projectId}/subcontratos/${scl.subcontractId}/certificaciones/${scl.certId}`}
                className="text-primary hover:underline font-medium"
              >
                {String(scl.certNumber)}
              </Link>,
              scl.certStatus,
              fmtDate(scl.certificationDate),
              fmtQty(scl.currentQty),
              fmt(scl.lineTotal),
            ])}
          />
        </Section>
      )}

      {detail.supplierInvoices.length > 0 && (
        <Section title="Facturas de proveedor">
          <SimpleTable
            headers={["Factura", "Estado", "Fecha", "Total", "OC"]}
            rows={detail.supplierInvoices.map((inv) => [
              <Link
                key={inv.invoiceId}
                href={`/proyectos/${projectId}/facturas-proveedor/${inv.invoiceId}`}
                className="text-primary hover:underline font-medium"
              >
                {`FP-${String(inv.invoiceNumber).padStart(5, "0")}`}
              </Link>,
              inv.status,
              fmtDate(inv.issueDate),
              fmt(inv.totalAmount),
              inv.purchaseOrderId ? (
                <Link
                  key={`po-${inv.invoiceId}`}
                  href={`/proyectos/${projectId}/ordenes-compra/${inv.purchaseOrderId}`}
                  className="text-primary hover:underline"
                >
                  Ver OC
                </Link>
              ) : (
                "—"
              ),
            ])}
          />
        </Section>
      )}

      {detail.payments.length > 0 && (
        <Section title="Pagos">
          <SimpleTable
            headers={["Pago", "Fecha", "Monto", "Estado", "Factura"]}
            rows={detail.payments.map((p) => [
              <Link
                key={p.paymentId}
                href={`/proyectos/${projectId}/pagos/${p.paymentId}`}
                className="text-primary hover:underline font-medium"
              >
                Ver pago
              </Link>,
              fmtDate(p.paymentDate),
              fmt(p.amount),
              p.status,
              <Link
                key={`inv-${p.paymentId}`}
                href={`/proyectos/${projectId}/facturas-proveedor/${p.invoiceId}`}
                className="text-primary hover:underline"
              >
                {`FP-${String(p.invoiceNumber).padStart(5, "0")}`}
              </Link>,
            ])}
          />
        </Section>
      )}

      {detail.stockMovements.length > 0 && (
        <Section title="Consumos de inventario">
          <SimpleTable
            headers={["Fecha", "Cantidad", "Costo unit.", "Costo total"]}
            rows={detail.stockMovements.map((sm) => [
              fmtDate(sm.movementDate),
              fmtQty(sm.quantity),
              sm.unitCost ? fmt(sm.unitCost) : "—",
              sm.totalCost ? fmt(sm.totalCost) : "—",
            ])}
          />
        </Section>
      )}

      {detail.jobsiteProgress.length > 0 && (
        <Section title="Avance de libro de obra">
          <SimpleTable
            headers={["Fecha", "Estado", "Cant. completada", "% físico"]}
            rows={detail.jobsiteProgress.map((jp) => [
              fmtDate(jp.logDate),
              jp.logStatus,
              fmtQty(jp.quantityCompleted),
              jp.physicalPct != null ? `${formatRatePctFromString(jp.physicalPct)}%` : "—",
            ])}
          />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function ProgressCol({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">{r.label}</span>
            <span className="font-mono text-sm font-medium tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  return (
    <TableScroll>
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
