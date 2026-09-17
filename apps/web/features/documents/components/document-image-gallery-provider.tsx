"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { toDocumentGalleryItems } from "../lib/document-file-utils";
import { DocumentImageGallery } from "./document-image-gallery";

type GalleryContextValue = {
  /** Open the gallery at the given document id (no-op if not in gallery items). */
  openAt: (documentId: string) => void;
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

/** Stable fingerprint of fields that affect gallery membership / captions. */
function galleryDocsFingerprint(docs: DocLike[]): string {
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
  const fingerprint = galleryDocsFingerprint(docs);
  const items = useMemo(
    () => toDocumentGalleryItems(docs),
    // Fingerprint captures every field that affects gallery membership/order.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- docs read when fingerprint changes
    [fingerprint],
  );

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

  const openAt = useCallback(
    (documentId: string) => {
      if (!items.some((item) => item.id === documentId)) return;
      setActiveId(documentId);
      setOpen(true);
    },
    [items],
  );

  const canOpenInGallery = useCallback(
    (documentId: string) => items.some((item) => item.id === documentId),
    [items],
  );

  const onIndexChange = useCallback(
    (nextIndex: number) => {
      const item = items[nextIndex];
      if (!item) return;
      setActiveId(item.id);
    },
    [items],
  );

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setActiveId(null);
  }, []);

  const value = useMemo(
    () => ({ openAt, canOpenInGallery }),
    [openAt, canOpenInGallery],
  );

  // Keep gallery mounted while open so Radix can tear down scroll-lock if items empty out.
  const showGallery = items.length > 0 || open;

  return (
    <DocumentImageGalleryContext.Provider value={value}>
      {children}
      {showGallery ? (
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
