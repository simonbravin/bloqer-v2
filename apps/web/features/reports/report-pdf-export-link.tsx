import Link from "next/link";
import { Button } from "@/components/ui/button";

type SearchParamsLike = Record<string, string | string[] | undefined>;

/**
 * PDF export: same filters as the page, forces format=pdf (GET). Auth via session cookie.
 */
export function ReportPdfExportLink(props: { exportPath: string; params: SearchParamsLike }) {
  const q = new URLSearchParams();
  for (const [key, raw] of Object.entries(props.params)) {
    if (key === "format") continue;
    if (raw === undefined || raw === "") continue;
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (v) q.append(key, v);
      }
    } else {
      q.set(key, raw);
    }
  }
  q.set("format", "pdf");
  const href = `${props.exportPath}?${q.toString()}`;
  return (
    <Button type="button" variant="outline" size="sm" asChild>
      <Link href={href} prefetch={false}>
        Exportar PDF
      </Link>
    </Button>
  );
}
