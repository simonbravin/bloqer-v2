/** Deep-link to EDT partida detail with optional cost-control filters. */
export function controlCostosItemHref(
  projectId: string,
  wbsNodeId: string,
  filters?: { budgetId?: string; dateFrom?: string; dateTo?: string },
): string {
  const sp = new URLSearchParams();
  if (filters?.budgetId) sp.set("budgetId", filters.budgetId);
  if (filters?.dateFrom) sp.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) sp.set("dateTo", filters.dateTo);
  const q = sp.toString();
  return `/proyectos/${projectId}/control-costos/${wbsNodeId}${q ? `?${q}` : ""}`;
}
