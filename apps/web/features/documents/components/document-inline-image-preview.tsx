"use client";

import { useEffect, useState } from "react";
import { documentDownloadHref } from "../lib/document-file-utils";
import { useDocumentImageGallery } from "./document-image-gallery-provider";

type Props = {
  documentId: string;
  originalFileName: string;
};

/** In-page preview for jpeg/png/webp only (never PDF / HEIC). Click opens gallery when available. */
export function DocumentInlineImagePreview({ documentId, originalFileName }: Props) {
  const [failed, setFailed] = useState(false);
  const gallery = useDocumentImageGallery();
  const canOpen = gallery?.canOpenInGallery(documentId) ?? false;

  useEffect(() => {
    setFailed(false);
  }, [documentId]);

  if (failed) {
    return (
      <div
        role="note"
        className="rounded-lg border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground"
      >
        No se puede previsualizar esta imagen. Usá el icono de <strong>ver</strong> o el de{" "}
        <strong>descargar</strong>.
      </div>
    );
  }

  if (canOpen && gallery) {
    return (
      <button
        type="button"
        onClick={() => gallery.openAt(documentId)}
        className="block w-full cursor-zoom-in overflow-hidden rounded-lg border bg-card p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Ampliar imagen: ${originalFileName}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated inline preview */}
        <img
          src={documentDownloadHref(documentId, "inline")}
          alt=""
          className="mx-auto max-h-[70vh] w-auto max-w-full object-contain"
          onError={() => setFailed(true)}
        />
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated inline preview */}
      <img
        src={documentDownloadHref(documentId, "inline")}
        alt={originalFileName}
        className="mx-auto max-h-[70vh] w-auto max-w-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
