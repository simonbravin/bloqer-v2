/**
 * Document folder tree rules ([D-113]).
 * Pure helpers — no I/O.
 */

export const DOCUMENT_FOLDER_KINDS = ["SYSTEM", "USER"] as const;
export type DocumentFolderKind = (typeof DOCUMENT_FOLDER_KINDS)[number];

export const DOCUMENT_FOLDER_SYSTEM_KEYS = [
  "JOBSITE_LOG",
  "PURCHASE_REQUEST",
  "PURCHASE_ORDER",
  "PROCUREMENT_QUOTE",
  "PURCHASE_RECEIPT",
  "SALES_INVOICE",
  "SUPPLIER_INVOICE",
  "CERTIFICATION",
  "SUBCONTRACT",
  "BUDGET",
  "PLANS",
  "GENERAL",
] as const;

export type DocumentFolderSystemKey = (typeof DOCUMENT_FOLDER_SYSTEM_KEYS)[number];

/** SYSTEM roots that accept library uploads, moves, and USER children. */
export const LIBRARY_DESTINATION_SYSTEM_KEYS = ["PLANS", "GENERAL"] as const;
export type LibraryDestinationSystemKey = (typeof LIBRARY_DESTINATION_SYSTEM_KEYS)[number];

/** Max depth including the SYSTEM root (root = 1). */
export const DOCUMENT_FOLDER_MAX_DEPTH = 5;

export const DOCUMENT_FOLDER_SYSTEM_SEED: ReadonlyArray<{
  systemKey: DocumentFolderSystemKey;
  name: string;
  sortOrder: number;
}> = [
  { systemKey: "GENERAL", name: "General", sortOrder: 10 },
  { systemKey: "PLANS", name: "Planos", sortOrder: 20 },
  { systemKey: "JOBSITE_LOG", name: "Libro de Obra", sortOrder: 30 },
  { systemKey: "PURCHASE_REQUEST", name: "Solicitudes de compra", sortOrder: 40 },
  { systemKey: "PROCUREMENT_QUOTE", name: "Cotizaciones", sortOrder: 50 },
  { systemKey: "PURCHASE_ORDER", name: "Órdenes de compra", sortOrder: 60 },
  { systemKey: "PURCHASE_RECEIPT", name: "Recepciones", sortOrder: 70 },
  { systemKey: "SUPPLIER_INVOICE", name: "Facturas de proveedor", sortOrder: 80 },
  { systemKey: "SALES_INVOICE", name: "Facturas de venta", sortOrder: 90 },
  { systemKey: "CERTIFICATION", name: "Certificaciones", sortOrder: 100 },
  { systemKey: "SUBCONTRACT", name: "Subcontratos", sortOrder: 110 },
  { systemKey: "BUDGET", name: "Presupuestos", sortOrder: 120 },
];

const LINKED_ENTITY_TO_SYSTEM_KEY: Record<string, DocumentFolderSystemKey> = {
  JOBSITE_LOG: "JOBSITE_LOG",
  PURCHASE_REQUEST: "PURCHASE_REQUEST",
  PURCHASE_ORDER: "PURCHASE_ORDER",
  PROCUREMENT_QUOTE: "PROCUREMENT_QUOTE",
  PURCHASE_RECEIPT: "PURCHASE_RECEIPT",
  SALES_INVOICE: "SALES_INVOICE",
  SUPPLIER_INVOICE: "SUPPLIER_INVOICE",
  CERTIFICATION: "CERTIFICATION",
  SUBCONTRACT: "SUBCONTRACT",
  SUBCONTRACT_CERTIFICATION: "SUBCONTRACT",
  BUDGET: "BUDGET",
  PROJECT: "GENERAL",
};

export function isDocumentFolderSystemKey(value: string | null | undefined): value is DocumentFolderSystemKey {
  return (
    typeof value === "string" &&
    (DOCUMENT_FOLDER_SYSTEM_KEYS as readonly string[]).includes(value)
  );
}

export function isLibraryDestinationSystemKey(
  value: string | null | undefined,
): value is LibraryDestinationSystemKey {
  return (
    typeof value === "string" &&
    (LIBRARY_DESTINATION_SYSTEM_KEYS as readonly string[]).includes(value)
  );
}

/**
 * Resolve SYSTEM folder for auto-filing.
 * Operational types map 1:1 (or SUBCONTRACT_CERTIFICATION → SUBCONTRACT).
 * PROJECT / unknown with project → GENERAL. Caller must skip when projectId is null.
 */
export function resolveSystemKeyForLinkedEntity(
  linkedEntityType: string | null | undefined,
): DocumentFolderSystemKey {
  if (!linkedEntityType) return "GENERAL";
  return LINKED_ENTITY_TO_SYSTEM_KEY[linkedEntityType] ?? "GENERAL";
}

export function isOperationalLinkedEntity(
  linkedEntityType: string | null | undefined,
): boolean {
  if (!linkedEntityType || linkedEntityType === "PROJECT") return false;
  return true;
}

export type FolderTreeNode = {
  id: string;
  parentId: string | null;
  kind: DocumentFolderKind | string;
  systemKey: string | null;
};

/**
 * Walk to the SYSTEM root ancestor. Returns null if the chain is broken.
 */
export function findSystemRootAncestor(
  folderId: string,
  byId: ReadonlyMap<string, FolderTreeNode>,
): FolderTreeNode | null {
  let current = byId.get(folderId) ?? null;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    if (current.kind === "SYSTEM") return current;
    if (!current.parentId) return null;
    current = byId.get(current.parentId) ?? null;
  }
  return null;
}

/**
 * Library upload/move destination: GENERAL, PLANS, or USER under those roots.
 */
export function isLibraryFolderDestination(
  folderId: string,
  byId: ReadonlyMap<string, FolderTreeNode>,
): boolean {
  const folder = byId.get(folderId);
  if (!folder) return false;
  if (folder.kind === "SYSTEM") {
    return isLibraryDestinationSystemKey(folder.systemKey);
  }
  if (folder.kind !== "USER") return false;
  const root = findSystemRootAncestor(folderId, byId);
  return root != null && isLibraryDestinationSystemKey(root.systemKey);
}

/**
 * USER children only under PLANS / GENERAL / USER under those.
 */
export function canCreateUserFolderUnder(
  parentId: string,
  byId: ReadonlyMap<string, FolderTreeNode>,
): boolean {
  return isLibraryFolderDestination(parentId, byId);
}

export function folderDepth(
  folderId: string,
  byId: ReadonlyMap<string, FolderTreeNode>,
): number {
  let depth = 0;
  let current = byId.get(folderId) ?? null;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) return Number.POSITIVE_INFINITY;
    seen.add(current.id);
    depth += 1;
    if (!current.parentId) break;
    current = byId.get(current.parentId) ?? null;
  }
  return depth;
}

/** True if `candidateParentId` is the folder itself or a descendant (cycle). */
export function wouldCreateFolderCycle(
  folderId: string,
  candidateParentId: string | null,
  byId: ReadonlyMap<string, FolderTreeNode>,
): boolean {
  if (!candidateParentId) return false;
  if (candidateParentId === folderId) return true;
  let current = byId.get(candidateParentId) ?? null;
  const seen = new Set<string>();
  while (current) {
    if (current.id === folderId) return true;
    if (seen.has(current.id)) return true;
    seen.add(current.id);
    if (!current.parentId) break;
    current = byId.get(current.parentId) ?? null;
  }
  return false;
}
