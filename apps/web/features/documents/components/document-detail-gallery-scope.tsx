"use client";

import { useMemo, type ReactNode } from "react";
import { DocumentImageGalleryProvider } from "./document-image-gallery-provider";

type Props = {
  documentId: string;
  originalFileName: string;
  mimeType: string;
  storageProvider: string;
  status: string;
  children: ReactNode;
};

/** Single-document gallery scope for detail page (Ver + inline preview). */
export function DocumentDetailGalleryScope({
  documentId,
  originalFileName,
  mimeType,
  storageProvider,
  status,
  children,
}: Props) {
  const docs = useMemo(
    () => [
      {
        id: documentId,
        originalFileName,
        mimeType,
        storageProvider,
        status,
      },
    ],
    [documentId, originalFileName, mimeType, storageProvider, status],
  );

  return (
    <DocumentImageGalleryProvider docs={docs}>{children}</DocumentImageGalleryProvider>
  );
}
