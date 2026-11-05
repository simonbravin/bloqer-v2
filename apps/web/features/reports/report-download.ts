export type ReportDownloadFormat = "csv" | "xlsx" | "pdf";

type ReportQuery = Record<string, string | string[] | undefined>;

const MIME_TYPES: Record<ReportDownloadFormat, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export function reportDownloadHref(path: string, params: ReportQuery, format: ReportDownloadFormat) {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      if (value) query.append(key, value);
    }
  }
  query.set("format", format);
  return `${path}?${query}`;
}

export async function readReportDownload(response: Response, format: ReportDownloadFormat) {
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (response.status === 401 || (response.redirected && new URL(response.url).pathname === "/login")) {
    throw new Error("Volvé a iniciar sesión para exportar el reporte.");
  }
  if (!response.ok) {
    const body: unknown = contentType === "application/json" ? await response.json().catch(() => null) : null;
    const error = body && typeof body === "object" && "error" in body ? body.error : undefined;
    if (typeof error === "string" && error && error !== "export_failed") throw new Error(error);
    throw new Error("No se pudo generar la exportación.");
  }
  if (contentType !== MIME_TYPES[format]) throw new Error("La respuesta no contiene el archivo solicitado.");

  const disposition = response.headers.get("content-disposition") ?? "";
  return {
    blob: await response.blob(),
    filename: disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `reporte.${format}`,
  };
}
