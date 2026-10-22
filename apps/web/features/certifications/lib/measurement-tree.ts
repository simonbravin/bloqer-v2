type Node = { id: string; parentId: string | null; code: string; name: string; isGroup: boolean };
export type MeasurementTreeEntry = Node & { depth: number; itemCount: number };
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim();

/** Matching groups include descendants; matching leaves retain their actual ancestors. */
export function buildMeasurementTree(
  nodes: Node[],
  query: string,
  collapsed: ReadonlySet<string>,
): MeasurementTreeEntry[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string | null, Node[]>();
  for (const node of nodes) {
    const parent = node.parentId && byId.has(node.parentId) ? node.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  for (const siblings of children.values())
    siblings.sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));
  const term = normalize(query);
  const visiting = new Set<string>();
  function visit(
    node: Node,
    depth: number,
    ancestorMatches: boolean,
  ): { entries: MeasurementTreeEntry[]; itemCount: number; matched: boolean } {
    if (visiting.has(node.id)) return { entries: [], itemCount: 0, matched: false };
    visiting.add(node.id);
    const matches =
      !term || ancestorMatches || normalize(`${node.code} ${node.name}`).includes(term);
    const nested = (children.get(node.id) ?? []).map((child) => visit(child, depth + 1, matches));
    visiting.delete(node.id);
    const matched = matches || nested.some((child) => child.matched);
    const itemCount =
      (node.isGroup ? 0 : 1) + nested.reduce((sum, child) => sum + child.itemCount, 0);
    if (!matched || (node.isGroup && itemCount === 0))
      return { entries: [], itemCount, matched: false };
    const entries: MeasurementTreeEntry[] = [{ ...node, depth, itemCount }];
    if (term || !collapsed.has(node.id)) entries.push(...nested.flatMap((child) => child.entries));
    return { entries, itemCount, matched: true };
  }
  return (children.get(null) ?? []).flatMap((root) => visit(root, 0, false).entries);
}
