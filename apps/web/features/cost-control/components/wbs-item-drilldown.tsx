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

function fmt(v: string) {
  return parseFloat(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: Date) {
  return formatDate(d);
}

type Props = { detail: WbsItemCostDetail; projectId: string };

export function WbsItemDrilldown({ detail, projectId }: Props) {
  return (
    <div className="space-y-6">
      {detail.budgetItem ? (
        <Section title="Análisis de presupuesto">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Kv label="Unidad"     value={detail.budgetItem.unit} />
            <Kv label="Cantidad"   value={detail.budgetItem.quantity} />
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
              pol.quantity,
              fmt(pol.unitPrice),
              fmt(pol.lineTotal),
              pol.receivedQty,
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
              sl.quantity,
              fmt(sl.unitPrice),
              fmt(sl.lineTotal),
              sl.certifiedQuantity,
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
              scl.currentQty,
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
              sm.quantity,
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
              jp.quantityCompleted,
              jp.physicalPct ?? "—",
            ])}
          />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
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
