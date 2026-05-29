import Link from "next/link";
import { Button } from "@/components/ui/button";

type SearchParamsLike = Record<string, string | string[] | undefined>;

function buildQuery(params: SearchParamsLike, extra?: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === "") continue;
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (v) q.append(key, v);
      }
    } else {
      q.set(key, raw);
    }
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) q.set(k, v);
    }
  }
  return q.toString();
}

type Props = {
  exportPath: string;
  params: SearchParamsLike;
  /** When true, shows CSV + PDF. Use `pdfOnly` when the route only supports PDF. */
  pdf?: boolean;
  pdfOnly?: boolean;
};

export function ReportExportActions({ exportPath, params, pdf = false, pdfOnly = false }: Props) {
  const qs = buildQuery(params);
  const csvHref = qs ? `${exportPath}?${qs}` : exportPath;
  const pdfQs = buildQuery(params, { format: "pdf" });
  const pdfHref = `${exportPath}?${pdfQs}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!pdfOnly ? (
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={csvHref} prefetch={false}>
            Exportar CSV
          </Link>
        </Button>
      ) : null}
      {pdf || pdfOnly ? (
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={pdfHref} prefetch={false} target="_blank" rel="noopener noreferrer">
            Exportar PDF
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

/** @deprecated Use ReportExportActions */
export function ReportCsvExportLink(props: { exportPath: string; params: SearchParamsLike }) {
  return <ReportExportActions exportPath={props.exportPath} params={props.params} />;
}

/** @deprecated Use ReportExportActions with pdf */
export function ReportPdfExportLink(props: { exportPath: string; params: SearchParamsLike }) {
  return <ReportExportActions exportPath={props.exportPath} params={props.params} pdfOnly />;
}
