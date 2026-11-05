import { formatQtyFromString, formatRatePctDisplay } from "@/lib/format-money";
import { formatDateLong } from "@/lib/format";
import Link from "next/link";
import {
  JobsiteLogIssueSeverityBadge,
  JobsiteLogIssueStatusBadge,
  JobsiteLogIssueTypeBadge,
} from "./jobsite-log-issue-badge";
import type { JobsiteLogView } from "@bloqer/services";

type ProgressRow = JobsiteLogView["progress"][number] & { cumulativePct: string };

export function JobsiteLogDetailMobileSections({
  log,
  progressRows,
  stockMovementByMaterialId,
  canViewInventory,
}: {
  log: JobsiteLogView;
  progressRows: ProgressRow[];
  stockMovementByMaterialId: Map<string, { movementDate: Date }>;
  canViewInventory: boolean;
}) {
  return (
    <div className="space-y-4 md:hidden">
      {progressRows.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Avance de obra</h2>
          <ul className="space-y-2">
            {progressRows.map((p) => (
              <li key={p.id} className="rounded-lg border bg-card p-3">
                <p className="font-mono text-xs text-muted-foreground">
                  {p.wbsNode.code} — {p.wbsNode.name}
                </p>
                {p.description ? <p className="mt-1 text-sm">{p.description}</p> : null}
                <p className="mt-2 text-sm tabular-nums">
                  {formatQtyFromString(p.quantityCompleted)} {p.wbsNode.unit}
                  {p.physicalPct ? ` · ${formatRatePctDisplay(p.physicalPct)}%` : ""}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  Acumulado {formatRatePctDisplay(p.cumulativePct)} / 100
                </p>
                {p.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{p.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {log.labor.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Cuadrilla</h2>
          <ul className="space-y-2">
            {log.labor.map((lb) => (
              <li key={lb.id} className="rounded-lg border bg-card p-3 text-sm">
                <p className="font-medium">{[lb.contactName, lb.subcontractCode].filter(Boolean).join(" · ") || lb.crewDescription || "Cuadrilla"}</p>
                {lb.crewDescription && (lb.contactName || lb.subcontractCode) ? (
                  <p className="text-muted-foreground">{lb.crewDescription}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {lb.workersCount} {lb.workersCount === 1 ? "trabajador" : "trabajadores"}
                  {lb.hoursWorked ? ` · ${formatQtyFromString(lb.hoursWorked)} h` : ""}
                </p>
                {lb.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{lb.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {log.materials.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Materiales</h2>
          <ul className="space-y-2">
            {log.materials.map((m) => {
              const movement = stockMovementByMaterialId.get(m.id);
              const showConsumption = canViewInventory && m.productId && m.warehouseId && log.status !== "CANCELLED";
              return (
                <li key={m.id} className="rounded-lg border bg-card p-3 text-sm">
                  <p className="font-medium">{m.description}</p>
                  <p className="text-muted-foreground">
                    {m.productName ? `${m.productName} · ` : ""}{formatQtyFromString(m.quantity)}
                    {m.productUnit ? ` ${m.productUnit}` : ""}
                  </p>
                  {m.warehouseName ? (
                    <p className="text-xs text-muted-foreground">{m.warehouseName}</p>
                  ) : null}
                  {showConsumption ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {log.status === "APPROVED" ? (
                        movement ? (
                          <Link href={`/proyectos/${log.projectId}/consumos`} className="text-primary hover:underline">
                            Registrado · {formatDateLong(new Date(movement.movementDate))}
                          </Link>
                        ) : (
                          "Sin movimiento"
                        )
                      ) : (
                        "Consumo al aprobar"
                      )}
                    </p>
                  ) : null}
                  {m.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{m.notes}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {log.issues.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Incidencias</h2>
          <ul className="space-y-2">
            {log.issues.map((iss) => (
              <li key={iss.id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  <JobsiteLogIssueTypeBadge
                    type={iss.type}
                  />
                  <JobsiteLogIssueSeverityBadge
                    severity={iss.severity}
                  />
                </div>
                <p className="mt-2">{iss.description}</p>
                <JobsiteLogIssueStatusBadge status={iss.status} />
                {iss.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{iss.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
