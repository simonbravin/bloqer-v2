"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DocumentGalleryItem } from "../lib/document-file-utils";
import { documentDownloadHref } from "../lib/document-file-utils";

export type DocumentImageGalleryProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: DocumentGalleryItem[];
  index: number;
  onIndexChange: (index: number) => void;
};

/**
 * Full-screen lightbox + carousel for stored document images (jpeg/png/webp).
 * Uses authenticated `/api/documents/.../download?disposition=inline` URLs.
 * Visual chrome reuses `.image-lightbox-*` from globals.css.
 */
export function DocumentImageGallery({
  open,
  onOpenChange,
  items,
  index,
  onIndexChange,
}: DocumentImageGalleryProps) {
  const [failed, setFailed] = useState(false);
  const count = items.length;
  const safeIndex = count > 0 ? Math.min(Math.max(index, 0), count - 1) : 0;
  const current = count > 0 ? items[safeIndex]! : null;
  const hasNav = count > 1;

  // If the list empties while open, close cleanly (keeps Radix scroll-lock teardown).
  useEffect(() => {
    if (open && count === 0) onOpenChange(false);
  }, [open, count, onOpenChange]);

  useEffect(() => {
    setFailed(false);
  }, [current?.id]);

  const goPrev = useCallback(() => {
    if (count < 2) return;
    onIndexChange((safeIndex - 1 + count) % count);
  }, [count, safeIndex, onIndexChange]);

  const goNext = useCallback(() => {
    if (count < 2) return;
    onIndexChange((safeIndex + 1) % count);
  }, [count, safeIndex, onIndexChange]);

  useEffect(() => {
    if (!open || !hasNav) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hasNav, goPrev, goNext]);

  // Stay mounted while open even if items briefly empty, so Dialog can close.
  if (!open && !current) return null;

  const src = current ? documentDownloadHref(current.id, "inline") : "";
  const downloadHref = current ? documentDownloadHref(current.id, "attachment") : "";
  const dialogOpen = open && current != null;

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="image-lightbox-overlay" />
        <DialogPrimitive.Content
          className="image-lightbox-panel data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          onClick={(event) => {
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {current?.fileName ?? "Imagen"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {hasNav
              ? `Imagen ${safeIndex + 1} de ${count}. Usá las flechas para cambiar. Cerrar con Escape.`
              : "Imagen ampliada. Cerrar con Escape o el botón X."}
          </DialogPrimitive.Description>

          <DialogPrimitive.Close
            className="image-lightbox-close"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden />
          </DialogPrimitive.Close>

          {hasNav ? (
            <>
              <button
                type="button"
                className="image-lightbox-nav image-lightbox-nav-prev"
                onClick={(event) => {
                  event.stopPropagation();
                  goPrev();
                }}
                aria-label="Imagen anterior"
              >
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </button>
              <button
                type="button"
                className="image-lightbox-nav image-lightbox-nav-next"
                onClick={(event) => {
                  event.stopPropagation();
                  goNext();
                }}
                aria-label="Imagen siguiente"
              >
                <ChevronRight className="h-6 w-6" aria-hidden />
              </button>
            </>
          ) : null}

          {current ? (
            <div className="image-lightbox-stage">
              {failed ? (
                <div
                  role="note"
                  className="image-lightbox-error rounded-lg border bg-background/95 px-6 py-8 text-center text-sm text-foreground shadow-lg"
                >
                  <p>
                    No se puede previsualizar esta imagen. Usá{" "}
                    <strong>Descargar</strong> para abrirla.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <a href={downloadHref}>
                      <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Descargar
                    </a>
                  </Button>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- authenticated gallery preview
                <img
                  key={current.id}
                  src={src}
                  alt={current.fileName}
                  className="image-lightbox-img"
                  onError={() => setFailed(true)}
                />
              )}

              <div className="image-lightbox-caption-row">
                <span className="min-w-0 truncate text-white/80" title={current.fileName}>
                  {current.fileName}
                </span>
                {hasNav ? (
                  <span className="shrink-0 tabular-nums text-white/70">
                    {safeIndex + 1} / {count}
                  </span>
                ) : null}
                <a
                  href={downloadHref}
                  className="image-lightbox-download shrink-0"
                  aria-label={`Descargar ${current.fileName}`}
                  title="Descargar"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Descargar
                </a>
              </div>
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
