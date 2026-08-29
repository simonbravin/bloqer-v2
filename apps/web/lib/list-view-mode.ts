export type ListViewMode = "table" | "cards";

export function parseListViewParam(raw: string | null): ListViewMode | null {
  if (raw === "cards" || raw === "table") return raw;
  return null;
}

/**
 * URL wins (shared links / explicit toggle). Then the persisted choice for this
 * breakpoint. Otherwise: `defaultView` from `md` up, cards below `md`.
 */
export function resolveListViewMode(input: {
  urlView: string | null;
  stored: ListViewMode | null;
  isMdUp: boolean;
  defaultView?: ListViewMode;
}): ListViewMode {
  const fromUrl = parseListViewParam(input.urlView);
  if (fromUrl) return fromUrl;
  if (input.stored === "cards" || input.stored === "table") return input.stored;
  const desktopDefault = input.defaultView === "cards" ? "cards" : "table";
  return input.isMdUp ? desktopDefault : "cards";
}

export function listViewStorageId(pathname: string, isMdUp: boolean): string {
  return `bloqer:list-view:${pathname}:${isMdUp ? "md" : "sm"}`;
}

export function readStoredListView(pathname: string, isMdUp: boolean): ListViewMode | null {
  try {
    const stored = localStorage.getItem(listViewStorageId(pathname, isMdUp));
    return parseListViewParam(stored);
  } catch {
    return null;
  }
}

export const LIST_VIEW_CHANGE_EVENT = "bloqer:list-view-change";

export function persistListView(pathname: string, isMdUp: boolean, view: ListViewMode): void {
  try {
    localStorage.setItem(listViewStorageId(pathname, isMdUp), view);
    window.dispatchEvent(new Event(LIST_VIEW_CHANGE_EVENT));
  } catch {
    /* private mode */
  }
}
