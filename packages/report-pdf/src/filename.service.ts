/** ASCII-safe filename for Content-Disposition (no path segments). */
export function safeReportFilename(base: string, extension: string): string {
  const ext = extension.startsWith(".") ? extension.slice(1) : extension;
  const cleaned = base
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 100);
  const body = cleaned.length > 0 ? cleaned : "export";
  return `${body}.${ext}`;
}
