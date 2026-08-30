/**
 * Pure placement / reorder helpers for ScheduleItem tree (D-103).
 * Height in Gantt = parentId + sortOrder — independent of WBS links.
 */

export type ScheduleTreeNode = {
  id: string;
  parentId: string | null;
  sortOrder: number;
  status?: string;
  /** Optional WBS node ids linked to this item (any link). */
  wbsNodeIds?: string[];
};

export type SchedulePlacement = {
  parentId: string | null;
  /** Insert immediately after this sibling (same parent). Null = append at end. */
  afterItemId: string | null;
  sortOrder: number;
};

export function activeSiblings(
  items: ScheduleTreeNode[],
  parentId: string | null,
  excludeId?: string,
): ScheduleTreeNode[] {
  return items
    .filter(
      (i) =>
        (i.parentId ?? null) === parentId &&
        i.status !== "CANCELLED" &&
        i.id !== excludeId,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function nextSiblingSortOrder(siblings: Array<{ sortOrder: number }>): number {
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((s) => s.sortOrder)) + 1;
}

/**
 * Resolve sortOrder when inserting after a sibling (or append).
 * Does not mutate; caller must shift siblings with sortOrder >= returned value.
 */
export function resolveInsertSortOrder(
  siblings: Array<{ id: string; sortOrder: number }>,
  afterItemId: string | null | undefined,
): number {
  if (!afterItemId) return nextSiblingSortOrder(siblings);
  const after = siblings.find((s) => s.id === afterItemId);
  if (!after) return nextSiblingSortOrder(siblings);
  return after.sortOrder + 1;
}

/**
 * If a leaf schedule item is already linked to this WBS, suggest placing
 * the new item as a sibling immediately below it (never as its child — D-103).
 */
export function suggestPlacementForWbs(
  items: ScheduleTreeNode[],
  wbsNodeId: string,
): SchedulePlacement | null {
  const linked = items.filter(
    (i) =>
      i.status !== "CANCELLED" &&
      (i.wbsNodeIds ?? []).includes(wbsNodeId),
  );
  if (linked.length === 0) return null;

  // Prefer a leaf (no active children) that has this WBS; stable order by sortOrder.
  const leaves = linked
    .filter(
      (i) => !items.some((c) => c.parentId === i.id && c.status !== "CANCELLED"),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const anchor =
    leaves[0] ??
    [...linked].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))[0]!;
  const parentId = anchor.parentId ?? null;
  const siblings = activeSiblings(items, parentId);
  const sortOrder = resolveInsertSortOrder(siblings, anchor.id);
  return { parentId, afterItemId: anchor.id, sortOrder };
}

export function wouldCreateCycle(
  items: ScheduleTreeNode[],
  itemId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === itemId) return true;
  const byId = new Map(items.map((i) => [i.id, i]));
  let current: ScheduleTreeNode | undefined = byId.get(newParentId);
  while (current) {
    if (current.id === itemId) return true;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

export type MoveAction =
  | { kind: "up" }
  | { kind: "down" }
  | { kind: "indent" }
  | { kind: "outdent" }
  | { kind: "place"; parentId: string | null; afterItemId: string | null };

export type MoveResult = {
  parentId: string | null;
  /** New ordered sibling ids under parentId (excluding cancelled), including moved item. */
  orderedSiblingIds: string[];
  /** True when indent will turn previous sibling (a leaf) into a container. */
  promotesLeafToContainer: boolean;
};

/**
 * Compute new sibling order for a move. Returns null if the move is a no-op / invalid.
 */
export function applyMoveSibling(
  items: ScheduleTreeNode[],
  itemId: string,
  action: MoveAction,
): MoveResult | null {
  const item = items.find((i) => i.id === itemId);
  if (!item || item.status === "CANCELLED") return null;

  if (action.kind === "place") {
    if (wouldCreateCycle(items, itemId, action.parentId)) return null;
    const siblings = activeSiblings(items, action.parentId, itemId);
    const parentId = action.parentId;
    const alreadyUnderParent = (item.parentId ?? null) === parentId;
    const parentHasOtherChildren =
      parentId != null &&
      items.some(
        (c) =>
          c.parentId === parentId &&
          c.status !== "CANCELLED" &&
          c.id !== itemId,
      );
    const promotesLeafToContainer =
      parentId != null && !alreadyUnderParent && !parentHasOtherChildren;

    if (action.afterItemId) {
      const afterIdx = siblings.findIndex((s) => s.id === action.afterItemId);
      if (afterIdx < 0) return null;
      const ordered = siblings.map((s) => s.id);
      ordered.splice(afterIdx + 1, 0, itemId);
      return {
        parentId,
        orderedSiblingIds: ordered,
        promotesLeafToContainer,
      };
    }
    const ordered = [...siblings.map((s) => s.id), itemId];
    return {
      parentId,
      orderedSiblingIds: ordered,
      promotesLeafToContainer,
    };
  }

  if (action.kind === "up" || action.kind === "down") {
    const parentId = item.parentId ?? null;
    const siblings = activeSiblings(items, parentId);
    const idx = siblings.findIndex((s) => s.id === itemId);
    if (idx < 0) return null;
    const swapWith = action.kind === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= siblings.length) return null;
    const ordered = siblings.map((s) => s.id);
    const tmp = ordered[idx]!;
    ordered[idx] = ordered[swapWith]!;
    ordered[swapWith] = tmp;
    return { parentId, orderedSiblingIds: ordered, promotesLeafToContainer: false };
  }

  if (action.kind === "indent") {
    const parentId = item.parentId ?? null;
    const siblings = activeSiblings(items, parentId);
    const idx = siblings.findIndex((s) => s.id === itemId);
    if (idx <= 0) return null;
    const newParent = siblings[idx - 1]!;
    if (wouldCreateCycle(items, itemId, newParent.id)) return null;
    const wasLeaf = !items.some(
      (c) => c.parentId === newParent.id && c.status !== "CANCELLED",
    );
    const newSiblings = activeSiblings(items, newParent.id, itemId);
    const ordered = [...newSiblings.map((s) => s.id), itemId];
    return {
      parentId: newParent.id,
      orderedSiblingIds: ordered,
      promotesLeafToContainer: wasLeaf,
    };
  }

  // outdent
  const parentId = item.parentId ?? null;
  if (parentId === null) return null;
  const parent = items.find((i) => i.id === parentId);
  if (!parent) return null;
  const grandParentId = parent.parentId ?? null;
  const uncleSiblings = activeSiblings(items, grandParentId, itemId);
  const parentIdx = uncleSiblings.findIndex((s) => s.id === parentId);
  const ordered = uncleSiblings.map((s) => s.id);
  const insertAt = parentIdx >= 0 ? parentIdx + 1 : ordered.length;
  ordered.splice(insertAt, 0, itemId);
  return {
    parentId: grandParentId,
    orderedSiblingIds: ordered,
    promotesLeafToContainer: false,
  };
}

/** Whether sync from jobsite should update this schedule item (D-103). */
export function shouldSyncProgressFromJobsite(type: string): boolean {
  return type !== "MILESTONE";
}
