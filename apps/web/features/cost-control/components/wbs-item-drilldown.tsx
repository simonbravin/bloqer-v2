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

type Props = { detail: WbsItemCostDetail };

export function WbsItemDrilldown({ detail }: Props) {
  return (
    <div className="space-y-6">
      {/* Budget item */}
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
          Este ítem WBS no tiene análisis de costo en el presupuesto.
        </div>
      )}

      {/* Certifications */}
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

      {/* Purchase orders */}
      {detail.purchaseOrderLines.length > 0 && (
        <Section title="Órdenes de compra">
          <SimpleTable
            headers={["OC N°", "Estado", "Descripción", "Cant.", "PU", "Total", "Recibido"]}
            rows={detail.purchaseOrderLines.map((pol) => [
              String(pol.poNumber),
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

      {/* Subcontracts */}
      {detail.subcontractLines.length > 0 && (
        <Section title="Subcontratos">
          <SimpleTable
            headers={["Código", "Estado", "Descripción", "Cant.", "PU", "Total", "Certif."]}
            rows={detail.subcontractLines.map((sl) => [
              `SC-${String(sl.subcontractNumber).padStart(3, "0")}`,
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

      {/* Subcontract certifications */}
      {detail.subcontractCertLines.length > 0 && (
        <Section title="Certificaciones de subcontratos">
          <SimpleTable
            headers={["N°", "Estado", "Fecha", "Cantidad período", "Importe"]}
            rows={detail.subcontractCertLines.map((scl) => [
              String(scl.certNumber),
              scl.certStatus,
              fmtDate(scl.certificationDate),
              scl.currentQty,
              fmt(scl.lineTotal),
            ])}
          />
        </Section>
      )}

      {/* Stock movements */}
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

      {/* Jobsite progress */}
      {detail.jobsiteProgress.length > 0 && (
        <Section title="Avance físico (partes de obra)">
          <SimpleTable
            headers={["Fecha", "Estado", "Cant. completada", "% físico"]}
            rows={detail.jobsiteProgress.map((p) => [
              fmtDate(p.logDate),
              p.logStatus,
              p.quantityCompleted,
              p.physicalPct ? `${p.physicalPct}%` : "—",
            ])}
          />
        </Section>
      )}

      {detail.certificationLines.length === 0 && detail.purchaseOrderLines.length === 0 &&
       detail.subcontractLines.length === 0 && detail.stockMovements.length === 0 &&
       detail.jobsiteProgress.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay documentos asociados a este ítem WBS.</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3"><p className="text-sm font-semibold">{title}</p></div>
      <div className="p-4">{children}</div>
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

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <TableScroll className="border-0">
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
