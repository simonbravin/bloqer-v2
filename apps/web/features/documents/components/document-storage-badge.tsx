/** Visible when a document has metadata only (no real file in object storage). */
export function DocumentStorageBadge({ storageProvider }: { storageProvider: string }) {
  if (storageProvider !== "PLACEHOLDER") return null;
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      Archivo no almacenado
    </span>
  );
}
