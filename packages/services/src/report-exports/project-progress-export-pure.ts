import type { ProjectProgressReport } from "../reports/project-progress.types";
import type { XlsxSheetInput } from "./xlsx-export.service";

const PENDING_LABELS: Record<string, string> = {
  PHYSICAL_MISSING: "Sin medición",
  PHYSICAL_REMAINING: "Por ejecutar",
  CERTIFICATION_PENDING: "Por certificar",
  CERTIFICATION_APPROVAL: "Certificados por aprobar",
  INVOICE_PENDING: "Por facturar",
  SCHEDULE_DELAYED: "Tareas atrasadas",
  SCHEDULE_BLOCKED: "Tareas bloqueadas",
  RECEIVABLE_OVERDUE: "Cobros vencidos",
  JOBSITE_PENDING: "Libro por aprobar",
  COST_UNALLOCATED: "Sin imputación EDT",
  COST_OVERRUN: "Costo excedido",
};

/** Tables share the already-authorized report DTO; no financial calculations here. */
export function buildProjectProgressExportSheets(report: ProjectProgressReport): XlsxSheetInput[] {
  const meta = [
    ["Proyecto", report.projectName],
    ["Alcance vigente", report.budgetName],
    ["Moneda", report.currency],
    ["Movimientos desde", report.dateFrom],
    ["Acumulado hasta", report.dateTo],
    ["Método físico", "Costo directo presupuestado de partidas hoja; cobertura explícita"],
    ["Método plan", "Fechas del plan vigente, ponderadas por el mismo costo"],
    [
      "Criterio temporal",
      "Fecha de ejecución/documento con estado actual; sin línea base histórica congelada",
    ],
    ["Última medición aprobada", report.sourceDates.jobsite ?? "Sin evidencia al corte"],
    ["Último certificado", report.sourceDates.certifications ?? "Sin evidencia al corte"],
    ["Última factura", report.sourceDates.invoices ?? "Sin evidencia al corte"],
    ["Última cobranza", report.sourceDates.collections ?? "Sin evidencia al corte"],
    ["Último registro de costo", report.sourceDates.costs ?? "Sin evidencia al corte"],
  ];
  const summary: string[][] = [
    ["Físico validado", report.physical.pct ?? "", "% del alcance físico ponderado"],
    [
      "Aporte físico observado",
      report.physical.observedPct ?? "",
      "% sobre TODO el alcance; no renormalizado",
    ],
    [
      "Cobertura física ponderada",
      report.physical.coveragePct ?? "",
      "% del costo directo con medición válida",
    ],
    [
      "Partidas con medición válida",
      String(report.physical.coveredCount),
      `de ${report.physical.totalCount}`,
    ],
    ["Partidas sin medición", String(report.physical.missingCount), "partidas"],
    ["Partidas con anomalías", String(report.physical.invalidCount), "partidas"],
    ["Partidas sin peso de costo", String(report.physical.zeroCostCount), "partidas"],
    [
      "Datos legacy ambiguos",
      report.physical.hasLegacy ? "Sí" : "No",
      "Porcentajes anteriores a junio de 2026",
    ],
    ["Plan vigente comparable", report.plan.pct ?? "", "% del mismo alcance y ponderación"],
    ["Cobertura del plan", report.plan.coveragePct ?? "", "% con vínculo y fechas inequívocos"],
    [
      "Tareas atrasadas",
      String(report.schedule.delayedTasks),
      "Situación actual · proyecto completo",
    ],
    [
      "Tareas bloqueadas",
      String(report.schedule.blockedTasks),
      "Situación actual · proyecto completo",
    ],
  ];
  const moneyFields = [
    ["Venta presupuestada", "budgetSale"],
    ["Costo presupuestado", "budgetCost"],
    ["Certificado acumulado", "certified"],
    ["Facturado acumulado", "invoiced"],
    ["Cobrado acumulado", "collected"],
    ["Saldo por cobrar", "receivableBalance"],
    ["Saldo vencido", "overdueBalance"],
    ["Costo devengado", "costAccrued"],
    ["Exposición de costo", "costExposure"],
    ["Pagado", "costPaid"],
  ] as const;
  for (const [label, key] of moneyFields) {
    const value = report.financial[key];
    if (value !== null) summary.push([label, value, report.currency]);
  }
  for (const [label, key, base] of [
    ["Certificado sobre venta", "certifiedPct", "% de venta presupuestada"],
    ["Devengado sobre presupuesto", "costAccruedPct", "% de presupuesto de costo"],
    ["Exposición sobre presupuesto", "costExposurePct", "% de presupuesto de costo"],
    ["Pagado sobre presupuesto", "costPaidPct", "% de presupuesto de costo"],
    ["Cobrado sobre facturado", "collectionPct", "% de facturación emitida"],
  ] as const) {
    const value = report.financial[key];
    if (value !== null) summary.push([label, value, base]);
  }
  for (const [label, key] of [
    ["Certificado anterior al período", "certified"],
    ["Facturado anterior al período", "invoiced"],
    ["Cobrado anterior al período", "collected"],
    ["Devengado anterior al período", "costAccrued"],
    ["Exposición anterior al período", "costExposure"],
    ["Pagado anterior al período", "costPaid"],
  ] as const) {
    const value = report.opening[key];
    if (value !== null) summary.push([label, value, report.currency]);
  }
  const showCost = report.financial.budgetCost !== null || report.financial.costAccrued !== null;
  const showCert = report.financial.certified !== null;
  const rowHeaders = [
    "EDT",
    "Partida",
    "Presupuesto",
    "Unidad",
    "Cantidad contractual",
    "Físico (%)",
    "Cantidad ejecutada",
    "Por ejecutar",
    "Plan vigente (%)",
  ];
  if (showCert)
    rowHeaders.push(
      "Cantidad certificada",
      "Importe certificado",
      "Ejecución por certificar",
      "Importe sugerido por certificar",
    );
  if (showCost) rowHeaders.push("Costo presupuestado", "Devengado", "Exposición", "Pagado");
  rowHeaders.push("Observaciones", "Acceso a evidencia");
  const detailRows = report.rows.map((r) => {
    const cells = [
      r.wbsCode,
      r.wbsName,
      r.budgetName,
      r.unit,
      r.budgetQty,
      r.physicalPct ?? "",
      r.physicalQty ?? "",
      r.physicalRemainingQty ?? "",
      r.planPct ?? "",
    ];
    if (showCert)
      cells.push(
        r.certifiedQty ?? "",
        r.certifiedAmount ?? "",
        r.pendingCertifyQty ?? "",
        r.pendingCertifyAmount ?? "",
      );
    if (showCost)
      cells.push(r.budgetCost ?? "", r.costAccrued ?? "", r.costExposure ?? "", r.costPaid ?? "");
    return [...cells, r.issues.join(" · "), r.href];
  });
  const seriesHeaders = [
    "Período",
    "Físico validado (%)",
    "Aporte físico observado (%)",
    "Cobertura física (%)",
    "Plan vigente comparable (%)",
    "Plan observado parcial (%)",
  ];
  if (showCert) seriesHeaders.push("Certificado acumulado");
  if (report.financial.invoiced !== null)
    seriesHeaders.push("Facturado acumulado", "Cobrado acumulado");
  if (showCost)
    seriesHeaders.push("Devengado acumulado", "Exposición acumulada", "Pagado acumulado");
  const seriesRows = report.series.map((p) => {
    const cells = [
      p.periodKey,
      p.physicalPct ?? "",
      p.physicalObservedPct ?? "",
      p.physicalCoveragePct ?? "",
      p.planPct ?? "",
      p.planObservedPct ?? "",
    ];
    if (showCert) cells.push(p.certified ?? "");
    if (report.financial.invoiced !== null) cells.push(p.invoiced ?? "", p.collected ?? "");
    if (showCost) cells.push(p.costAccrued ?? "", p.costExposure ?? "", p.costPaid ?? "");
    return cells;
  });
  return [
    {
      sheetName: "Resumen",
      headers: ["Indicador", "Valor", "Base o unidad"],
      rows: summary,
      preamble: meta,
      colWidths: [37, 25, 65],
    },
    {
      sheetName: "Partidas",
      headers: rowHeaders,
      rows: detailRows,
      preamble: meta,
      freeze: { xSplit: 2, ySplit: meta.length + 2 },
    },
    { sheetName: "Evolución", headers: seriesHeaders, rows: seriesRows, preamble: meta },
    {
      sheetName: "Pendientes",
      headers: ["Tipo", "Pendiente", "Detalle", "Fecha", "Importe", "Cantidad", "Unidad", "Acceso"],
      rows: report.pending.map((p) => [
        PENDING_LABELS[p.kind] ?? "Pendiente",
        p.title,
        p.detail,
        p.date ?? "",
        p.amount ?? "",
        p.qty ?? "",
        p.unit ?? "",
        p.href,
      ]),
      preamble: meta,
    },
    {
      sheetName: "Criterios y avisos",
      headers: ["Tipo", "Descripción"],
      rows: [
        [
          "Criterio",
          "Las celdas vacías no significan cero: falta base, medición, permiso o moneda comparable.",
        ],
        [
          "Criterio",
          "Los acumulados incluyen lo anterior al período. El plan y el alcance son los vigentes al consultar.",
        ],
        [
          "Criterio",
          "Exposición = devengado + compromiso abierto; no es estimación del costo para terminar.",
        ],
        ...report.notes.map((n) => ["Criterio", n]),
        ...report.warnings.map((w) => ["Aviso", w]),
        ...report.sectionsExcluded.map((s) => ["Sección no disponible", s]),
      ],
      preamble: meta,
      colWidths: [25, 110],
    },
  ];
}
