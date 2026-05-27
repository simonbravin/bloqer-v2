function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildCsvContent(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map((c) => escapeCell(String(c ?? ""))).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const content = buildCsvContent(headers, rows);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
