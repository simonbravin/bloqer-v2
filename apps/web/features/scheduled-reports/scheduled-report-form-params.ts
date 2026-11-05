type ReportScope = {
  scope: "TENANT" | "PROJECT";
  projectId?: string;
};

export function buildScheduledReportFormParams(
  selection: ReportScope,
  filters: { dateFrom: string; dateTo: string; currency: string; jobsiteProjectIds: string[] },
  initial?: ReportScope & { params?: Record<string, string> | null },
): Record<string, string> | undefined {
  const sameScope = initial?.scope === selection.scope &&
    (selection.scope === "TENANT" || initial.projectId === selection.projectId);
  const params = sameScope ? { ...initial.params } : {};
  const edited = {
    dateFrom: filters.dateFrom.trim(),
    dateTo: filters.dateTo.trim(),
    currency: filters.currency.trim(),
    jobsiteProjectIds: selection.scope === "TENANT" ? filters.jobsiteProjectIds.join(",") : "",
  };

  for (const [key, value] of Object.entries(edited)) {
    if (value) params[key] = value;
    else delete params[key];
  }
  return Object.keys(params).length > 0 ? params : undefined;
}
