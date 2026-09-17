"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { toDocumentGalleryItems } from "../lib/document-file-utils";
import { DocumentImageGallery } from "./document-image-gallery";

type GalleryContextValue = {
  /**
   * Open the gallery at the given document id.
   * @returns true if the gallery opened; false if the id is not in the set.
   */
  openAt: (documentId: string) => boolean;
  /** Whether this document id is part of the current gallery set. */
  canOpenInGallery: (documentId: string) => boolean;
};

const DocumentImageGalleryContext = createContext<GalleryContextValue | null>(null);

export function useDocumentImageGallery(): GalleryContextValue | null {
  return useContext(DocumentImageGalleryContext);
}

type DocLike = {
  id: string;
  originalFileName: string;
  mimeType: string;
  storageProvider: string;
  status: string;
};

function docsGalleryKey(docs: DocLike[]): string {
  return docs
    .map((d) =>
      [d.id, d.storageProvider, d.status, d.mimeType, d.originalFileName].join("\0"),
    )
    .join("\n");
}

export function DocumentImageGalleryProvider({
  docs,
  children,
}: {
  docs: DocLike[];
  children: ReactNode;
}) {
  const docsKey = docsGalleryKey(docs);
  const items = useMemo(
    () => toDocumentGalleryItems(docs),
    // Recalculate only when gallery-relevant fields change (stable reference otherwise).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- docs read when docsKey changes
    [docsKey],
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const [open, setOpen] = useState(false);
  /** Prefer id over raw index so list mutations don't show the wrong photo. */
  const [activeId, setActiveId] = useState<string | null>(null);

  const index = useMemo(() => {
    if (items.length === 0) return 0;
    if (!activeId) return 0;
    const i = items.findIndex((item) => item.id === activeId);
    return i >= 0 ? i : 0;
  }, [items, activeId]);

  useEffect(() => {
    if (items.length === 0) {
      setOpen(false);
      setActiveId(null);
      return;
    }
    if (!open) return;
    if (activeId && items.some((item) => item.id === activeId)) return;
    // Current photo was removed (archive/filter): fall back to first remaining.
    setActiveId(items[0]!.id);
  }, [items, open, activeId]);

  const openAt = useCallback((documentId: string) => {
    const currentItems = itemsRef.current;
    if (!currentItems.some((item) => item.id === documentId)) return false;
    setActiveId(documentId);
    setOpen(true);
    return true;
  }, []);

  const canOpenInGallery = useCallback((documentId: string) => {
    return itemsRef.current.some((item) => item.id === documentId);
  }, []);

  const onIndexChange = useCallback((nextIndex: number) => {
    const item = itemsRef.current[nextIndex];
    if (!item) return;
    setActiveId(item.id);
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setActiveId(null);
  }, []);

  const value = useMemo(
    () => ({ openAt, canOpenInGallery }),
    [openAt, canOpenInGallery],
  );

  return (
    <DocumentImageGalleryContext.Provider value={value}>
      {children}
      {/* Mount only while open — avoids idle Dialogs (esp. with mobile+desktop panels). */}
      {open ? (
        <DocumentImageGallery
          open={open}
          onOpenChange={onOpenChange}
          items={items}
          index={index}
          onIndexChange={onIndexChange}
        />
      ) : null}
    </DocumentImageGalleryContext.Provider>
  );
}
