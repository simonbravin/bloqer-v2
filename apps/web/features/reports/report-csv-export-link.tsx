import Link from "next/link";
import { Button } from "@/components/ui/button";

type SearchParamsLike = Record<string, string | string[] | undefined>;

/**
 * Preserves current report filters in the export URL (GET). Same auth as the page (session cookie).
 */
export function ReportCsvExportLink(props: { exportPath: string; params: SearchParamsLike }) {
  const q = new URLSearchParams();
  for (const [key, raw] of Object.entries(props.params)) {
    if (raw === undefined || raw === "") continue;
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (v) q.append(key, v);
      }
    } else {
      q.set(key, raw);
    }
  }
  const qs = q.toString();
  const href = qs ? `${props.exportPath}?${qs}` : props.exportPath;
  return (
    <Button type="button" variant="outline" size="sm" asChild>
      <Link href={href} prefetch={false}>
        Exportar CSV
      </Link>
    </Button>
  );
}
