import { can } from "@bloqer/domain";
import { canViewCompanyAp } from "../ap/ap-access";
import { listCompanyPayables, type CompanyPayableListRow } from "../ap/payable.service";
import {
  listCompanySupplierInvoices,
  type CompanySupplierInvoiceListRow,
} from "../ap/supplier-invoice.service";
import { assertApTenantModule, assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import {
  getAccountMovementReport,
  type MovementReportRow,
} from "../treasury-reports/treasury-reports.service";
import { ServiceContext, ServiceError } from "../types";

export type FinancialActivityGrain = "CASH" | "OPERATIONS" | "OBLIGATIONS";

export type ListFinancialActivityFilters = {
  grain: FinancialActivityGrain;
  /** v1: COMPANY only for corporate hub routes. */
  scope: "COMPANY";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  /** Payables / invoices status passthrough */
  status?: string;
  /** When true and no status, excludes PAID/CANCELLED on OBLIGATIONS grain. */
  pendingOnly?: boolean;
  dueDateFrom?: string;
  dueDateTo?: string;
  issueDateFrom?: string;
  issueDateTo?: string;
  /** Movement passthrough */
  accountId?: string;
  type?: string;
  sourceType?: string;
  currency?: string;
  includeInternalTransfers?: boolean;
  corporateApPaymentsOnly?: boolean;
};

export type FinancialActivityResult =
  | { grain: "CASH"; data: MovementReportRow[]; total: number }
  | { grain: "OPERATIONS"; data: CompanySupplierInvoiceListRow[]; total: number }
  | { grain: "OBLIGATIONS"; data: CompanyPayableListRow[]; total: number };

/**
 * Compositor v1 — delegates to existing paginated services (no UNION cross-table).
 */
export async function listFinancialActivity(
  ctx: ServiceContext,
  filters: ListFinancialActivityFilters,
): Promise<FinancialActivityResult> {
  if (filters.scope !== "COMPANY") {
    throw new ServiceError("VALIDATION", "scope PROJECT no soportado en v1");
  }

  switch (filters.grain) {
    case "CASH": {
      await assertTreasuryTenantModule(ctx);
      if (!can(ctx.roles, "VIEW", "TREASURY")) {
        throw new ServiceError("FORBIDDEN", "Sin permisos para ver movimientos");
      }
      const { rows, total } = await getAccountMovementReport(
        {
          accountId: filters.accountId,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          type: filters.type,
          sourceType: filters.sourceType,
          currency: filters.currency,
          includeInternalTransfers: filters.includeInternalTransfers,
          corporateApPaymentsOnly: filters.corporateApPaymentsOnly,
          page: filters.page,
          pageSize: filters.pageSize,
        },
        ctx,
      );
      return { grain: "CASH", data: rows, total };
    }
    case "OPERATIONS": {
      await assertApTenantModule(ctx);
      if (!canViewCompanyAp(ctx.roles)) {
        throw new ServiceError("FORBIDDEN", "Sin permisos para ver facturas de proveedor a nivel empresa");
      }
      const { data, total } = await listCompanySupplierInvoices(ctx, {
        status: filters.status as "DRAFT" | "ISSUED" | "CANCELLED" | undefined,
        issueDateFrom: filters.issueDateFrom ?? filters.dateFrom,
        issueDateTo: filters.issueDateTo ?? filters.dateTo,
        page: filters.page,
        pageSize: filters.pageSize,
      });
      return { grain: "OPERATIONS", data, total };
    }
    case "OBLIGATIONS": {
      await assertApTenantModule(ctx);
      if (!canViewCompanyAp(ctx.roles)) {
        throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar a nivel empresa");
      }
      const { data, total } = await listCompanyPayables(ctx, {
        status: filters.status as
          | "OPEN"
          | "PARTIAL"
          | "PAID"
          | "OVERDUE"
          | "CANCELLED"
          | undefined,
        pendingOnly: filters.pendingOnly,
        dueDateFrom: filters.dueDateFrom ?? filters.dateFrom,
        dueDateTo: filters.dueDateTo ?? filters.dateTo,
        page: filters.page,
        pageSize: filters.pageSize,
      });
      return { grain: "OBLIGATIONS", data, total };
    }
    default:
      throw new ServiceError("VALIDATION", "grain inválido");
  }
}
