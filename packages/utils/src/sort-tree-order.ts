/** Depth-first tree order by parentId + sortOrder (orphans appended at end). */
export function sortTreeOrder<T extends { id: string; parentId?: string | null; sortOrder: number }>(
  nodes: T[],
  tieBreak: (a: T, b: T) => number = () => 0,
): T[] {
  if (nodes.length === 0) return [];

  const idSet = new Set(nodes.map((n) => n.id));
  const children = new Map<string | null, T[]>();

  for (const n of nodes) {
    const rawParent = n.parentId ?? null;
    const parentKey = rawParent && idSet.has(rawParent) ? rawParent : null;
    const list = children.get(parentKey) ?? [];
    list.push(n);
    children.set(parentKey, list);
  }

  for (const list of children.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || tieBreak(a, b));
  }

  const out: T[] = [];
  const walk = (parentId: string | null) => {
    for (const n of children.get(parentId) ?? []) {
      out.push(n);
      walk(n.id);
    }
  };
  walk(null);

  const seen = new Set(out.map((n) => n.id));
  for (const n of nodes) {
    if (!seen.has(n.id)) out.push(n);
  }
  return out;
}
