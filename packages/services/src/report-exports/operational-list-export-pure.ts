import { MAX_EXPORT_ROWS, MAX_PAGE_SIZE } from "../finance/pagination";
import { ServiceError } from "../types";

/** Lists and exports use the same accent-insensitive procurement search. */
export function normalizeOperationalListSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function matchesOperationalListStatus(status: string, selected?: string): boolean {
  return selected ? status === selected : status !== "CANCELLED";
}

export function assertOperationalExportLimit(total: number): void {
  if (total > MAX_EXPORT_ROWS) {
    throw new ServiceError(
      "CONFLICT",
      `La exportación supera ${MAX_EXPORT_ROWS} filas. Acotá los filtros para descargar el listado completo.`,
    );
  }
}

/** Never request MAX_EXPORT_ROWS as pageSize: list services cap pages at 100. */
export async function collectOperationalExportPages<T>(
  loadPage: (pagination: {
    page: number;
    pageSize: number;
  }) => Promise<{ data: T[]; total: number }>,
): Promise<T[]> {
  const rows: T[] = [];
  let expectedTotal: number | undefined;
  for (let page = 1; ; page++) {
    const result = await loadPage({ page, pageSize: MAX_PAGE_SIZE });
    assertOperationalExportLimit(result.total);
    if (expectedTotal === undefined) expectedTotal = result.total;
    if (result.total !== expectedTotal) {
      throw new ServiceError(
        "CONFLICT",
        "El listado cambió mientras se exportaba. Volvé a descargarlo.",
      );
    }
    rows.push(...result.data);
    assertOperationalExportLimit(rows.length);
    if (rows.length === expectedTotal) return rows;
    if (rows.length > expectedTotal || result.data.length === 0) {
      throw new ServiceError(
        "CONFLICT",
        "El listado cambió mientras se exportaba. Volvé a descargarlo.",
      );
    }
  }
}
