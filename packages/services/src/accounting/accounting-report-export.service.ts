import { ServiceContext, ServiceError } from "../types";
import { buildCsv } from "../report-exports/csv-export.service";
import { safeReportFilename } from "../report-exports/filename.service";
import type { ReportCsvPayload, ReportXlsxPayload } from "../report-exports/report-export.types";
import { buildXlsxSheet } from "../report-exports/xlsx-export.service";
import {
  getAccountLedgerReport,
  getIncomeStatement,
  getStatementOfFinancialPosition,
  getTrialBalanceReport,
  listPostedJournalBookForExport,
  type AccountingReportDateRange,
} from "./accounting-reports.service";

const MAX_JOURNAL_EXPORT = 5000;

function requireRange(input: AccountingReportDateRange): AccountingReportDateRange {
  return input;
}

export async function exportTrialBalanceCsv(
  input: AccountingReportDateRange,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getTrialBalanceReport(ctx, requireRange(input));
  const headers = ["Codigo", "Cuenta", "Tipo", "Moneda", "Debe", "Haber", "Saldo"];
  const rows = report.rows.map((r) => [
    r.accountCode,
    r.accountName,
    r.accountType,
    r.currency,
    r.debit,
    r.credit,
    r.balance,
  ]);
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename(`contabilidad_sumas_y_saldos_${report.dateFrom}_${report.dateTo}`, "csv"),
  };
}

export async function exportTrialBalanceXlsx(
  input: AccountingReportDateRange,
  ctx: ServiceContext,
): Promise<ReportXlsxPayload> {
  const report = await getTrialBalanceReport(ctx, requireRange(input));
  const headers = ["Codigo", "Cuenta", "Tipo", "Moneda", "Debe", "Haber", "Saldo"];
  const rows = report.rows.map((r) => [
    r.accountCode,
    r.accountName,
    r.accountType,
    r.currency,
    r.debit,
    r.credit,
    r.balance,
  ]);
  return {
    buffer: buildXlsxSheet(headers, rows, {
      sheetName: "Sumas y saldos",
      preamble: [
        ["Sumas y saldos"],
        [`Periodo`, `${report.dateFrom} — ${report.dateTo}`],
        ["Solo asientos contabilizados (POSTED). Saldo natural."],
      ],
    }),
    filename: safeReportFilename(`contabilidad_sumas_y_saldos_${report.dateFrom}_${report.dateTo}`, "xlsx"),
  };
}

export async function exportJournalBookCsv(
  input: AccountingReportDateRange,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const book = await listPostedJournalBookForExport(ctx, input, MAX_JOURNAL_EXPORT);
  if (book.total > MAX_JOURNAL_EXPORT) {
    throw new ServiceError(
      "VALIDATION",
      `El export supera ${MAX_JOURNAL_EXPORT} asientos. Acotá el rango de fechas.`,
    );
  }
  const headers = [
    "Fecha",
    "AsientoId",
    "Referencia",
    "Descripcion",
    "Origen",
    "CuentaCodigo",
    "CuentaNombre",
    "LineaDescripcion",
    "Debe",
    "Haber",
    "Moneda",
  ];
  const rows: string[][] = [];
  for (const e of book.data) {
    for (const l of e.lines) {
      rows.push([
        e.entryDate,
        e.id,
        e.reference ?? "",
        e.description,
        e.sourceType,
        l.accountCode,
        l.accountName,
        l.description ?? "",
        l.debit,
        l.credit,
        l.currency,
      ]);
    }
  }
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename(`contabilidad_libro_diario_${book.dateFrom}_${book.dateTo}`, "csv"),
  };
}

export async function exportJournalBookXlsx(
  input: AccountingReportDateRange,
  ctx: ServiceContext,
): Promise<ReportXlsxPayload> {
  const book = await listPostedJournalBookForExport(ctx, input, MAX_JOURNAL_EXPORT);
  if (book.total > MAX_JOURNAL_EXPORT) {
    throw new ServiceError(
      "VALIDATION",
      `El export supera ${MAX_JOURNAL_EXPORT} asientos. Acotá el rango de fechas.`,
    );
  }
  const headers = [
    "Fecha",
    "AsientoId",
    "Referencia",
    "Descripcion",
    "Origen",
    "CuentaCodigo",
    "CuentaNombre",
    "LineaDescripcion",
    "Debe",
    "Haber",
    "Moneda",
  ];
  const rows: string[][] = [];
  for (const e of book.data) {
    for (const l of e.lines) {
      rows.push([
        e.entryDate,
        e.id,
        e.reference ?? "",
        e.description,
        e.sourceType,
        l.accountCode,
        l.accountName,
        l.description ?? "",
        l.debit,
        l.credit,
        l.currency,
      ]);
    }
  }
  return {
    buffer: buildXlsxSheet(headers, rows, {
      sheetName: "Libro diario",
      preamble: [
        ["Libro diario"],
        [`Periodo`, `${book.dateFrom} — ${book.dateTo}`],
        ["Solo asientos contabilizados (POSTED)."],
      ],
    }),
    filename: safeReportFilename(`contabilidad_libro_diario_${book.dateFrom}_${book.dateTo}`, "xlsx"),
  };
}

export async function exportAccountLedgerCsv(
  input: AccountingReportDateRange & { accountId: string },
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getAccountLedgerReport(ctx, { ...input, limit: 5000 });
  const headers = [
    "Fecha",
    "AsientoId",
    "Referencia",
    "Descripcion",
    "LineaDescripcion",
    "Debe",
    "Haber",
    "Saldo",
    "Moneda",
  ];
  const rows = report.rows.map((r) => [
    r.entryDate,
    r.isOpening ? "" : r.entryId,
    r.isOpening ? "SALDO_INICIAL" : (r.entryReference ?? ""),
    r.entryDescription,
    r.lineDescription ?? "",
    r.isOpening ? "" : r.debit,
    r.isOpening ? "" : r.credit,
    r.runningBalance,
    r.currency,
  ]);
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename(
      `contabilidad_mayor_${report.accountCode}_${report.dateFrom}_${report.dateTo}`,
      "csv",
    ),
  };
}

export async function exportStatementOfFinancialPositionCsv(
  input: { companyId?: string | null; asOfDate?: string },
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getStatementOfFinancialPosition(ctx, input);
  const headers = ["Moneda", "Seccion", "Codigo", "Cuenta", "Saldo", "Sintetica"];
  const rows: string[][] = [];
  for (const currency of report.currencies) {
    const block = report.byCurrency[currency]!;
    for (const r of block.assets) {
      rows.push([currency, "Activo", r.accountCode, r.accountName, r.balance, ""]);
    }
    for (const r of block.liabilities) {
      rows.push([currency, "Pasivo", r.accountCode, r.accountName, r.balance, ""]);
    }
    for (const r of block.equity) {
      rows.push([
        currency,
        "Patrimonio",
        r.accountCode,
        r.accountName,
        r.balance,
        r.synthetic ? "Si" : "",
      ]);
    }
    rows.push([currency, "Total activo", "", "", block.totalAssets, ""]);
    rows.push([currency, "Total pasivo", "", "", block.totalLiabilities, ""]);
    rows.push([currency, "Total patrimonio", "", "", block.totalEquity, ""]);
  }
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename(`contabilidad_situacion_patrimonial_${report.asOfDate}`, "csv"),
  };
}

export async function exportStatementOfFinancialPositionXlsx(
  input: { companyId?: string | null; asOfDate?: string },
  ctx: ServiceContext,
): Promise<ReportXlsxPayload> {
  const report = await getStatementOfFinancialPosition(ctx, input);
  const headers = ["Moneda", "Seccion", "Codigo", "Cuenta", "Saldo", "Sintetica"];
  const rows: string[][] = [];
  for (const currency of report.currencies) {
    const block = report.byCurrency[currency]!;
    for (const r of block.assets) {
      rows.push([currency, "Activo", r.accountCode, r.accountName, r.balance, ""]);
    }
    for (const r of block.liabilities) {
      rows.push([currency, "Pasivo", r.accountCode, r.accountName, r.balance, ""]);
    }
    for (const r of block.equity) {
      rows.push([
        currency,
        "Patrimonio",
        r.accountCode,
        r.accountName,
        r.balance,
        r.synthetic ? "Si" : "",
      ]);
    }
    rows.push([currency, "Total activo", "", "", block.totalAssets, ""]);
    rows.push([currency, "Total pasivo", "", "", block.totalLiabilities, ""]);
    rows.push([currency, "Total patrimonio", "", "", block.totalEquity, ""]);
  }
  return {
    buffer: buildXlsxSheet(headers, rows, {
      sheetName: "Situacion patrimonial",
      preamble: [
        ["Situación patrimonial"],
        ["Al", report.asOfDate],
        ["Incluye Resultado del ejercicio (no cerrado). No es estado oficial."],
      ],
    }),
    filename: safeReportFilename(`contabilidad_situacion_patrimonial_${report.asOfDate}`, "xlsx"),
  };
}

export async function exportIncomeStatementCsv(
  input: AccountingReportDateRange,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getIncomeStatement(ctx, input);
  const headers = ["Moneda", "Seccion", "Codigo", "Cuenta", "Saldo"];
  const rows: string[][] = [];
  for (const currency of report.currencies) {
    const block = report.byCurrency[currency]!;
    for (const r of block.income) {
      rows.push([currency, "Ingresos", r.accountCode, r.accountName, r.balance]);
    }
    for (const r of block.expenses) {
      rows.push([currency, "Gastos", r.accountCode, r.accountName, r.balance]);
    }
    rows.push([currency, "Total ingresos", "", "", block.totalIncome]);
    rows.push([currency, "Total gastos", "", "", block.totalExpenses]);
    rows.push([currency, "Resultado", "", "", block.netResult]);
  }
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename(
      `contabilidad_estado_resultados_${report.dateFrom}_${report.dateTo}`,
      "csv",
    ),
  };
}

export async function exportIncomeStatementXlsx(
  input: AccountingReportDateRange,
  ctx: ServiceContext,
): Promise<ReportXlsxPayload> {
  const report = await getIncomeStatement(ctx, input);
  const headers = ["Moneda", "Seccion", "Codigo", "Cuenta", "Saldo"];
  const rows: string[][] = [];
  for (const currency of report.currencies) {
    const block = report.byCurrency[currency]!;
    for (const r of block.income) {
      rows.push([currency, "Ingresos", r.accountCode, r.accountName, r.balance]);
    }
    for (const r of block.expenses) {
      rows.push([currency, "Gastos", r.accountCode, r.accountName, r.balance]);
    }
    rows.push([currency, "Total ingresos", "", "", block.totalIncome]);
    rows.push([currency, "Total gastos", "", "", block.totalExpenses]);
    rows.push([currency, "Resultado", "", "", block.netResult]);
  }
  return {
    buffer: buildXlsxSheet(headers, rows, {
      sheetName: "Estado de resultados",
      preamble: [
        ["Estado de resultados (gerencial)"],
        [`Periodo`, `${report.dateFrom} — ${report.dateTo}`],
        ["Solo asientos contabilizados (POSTED). No es estado oficial."],
      ],
    }),
    filename: safeReportFilename(
      `contabilidad_estado_resultados_${report.dateFrom}_${report.dateTo}`,
      "xlsx",
    ),
  };
}
