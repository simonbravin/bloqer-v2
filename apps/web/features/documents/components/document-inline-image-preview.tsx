"use client";

import { useState } from "react";
import { documentDownloadHref } from "../lib/document-file-utils";

type Props = {
  documentId: string;
  originalFileName: string;
};

/** In-page preview for jpeg/png/webp only (never PDF / HEIC). */
export function DocumentInlineImagePreview({ documentId, originalFileName }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="note"
        className="rounded-lg border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground"
      >
        No se puede previsualizar esta imagen. Usá <strong>Ver</strong> o{" "}
        <strong>Descargar</strong>.
      </div>
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
