"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Maximize2, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Dialog, DialogOverlay, DialogPortal, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ImageLightboxProps = {
  src: string;
  alt: string;
  caption?: string;
  /** Custom thumbnail (e.g. next/image). Defaults to a plain `<img>`. */
  children?: ReactNode;
  triggerClassName?: string;
  imgClassName?: string;
  hideHint?: boolean;
};

/**
 * Reusable click-to-enlarge. Visual chrome lives in `.image-lightbox-*` (`globals.css`).
 * Use anywhere a poster or map is too small inline.
 */
export function ImageLightbox({
  src,
  alt,
  caption,
  children,
  triggerClassName,
  imgClassName,
  hideHint = false,
}: ImageLightboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn("image-lightbox-trigger", triggerClassName)}
          aria-label={`Ampliar imagen: ${alt}`}
        >
          {children ?? (
            // Static / public assets (help maps). Keep intrinsic ratio.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={alt} className={cn("image-lightbox-thumb", imgClassName)} />
          )}
          {hideHint ? null : (
            <span className="image-lightbox-hint">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              Clic para ampliar
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="image-lightbox-overlay" />
        <DialogPrimitive.Content
          className="image-lightbox-panel"
          onOpenAutoFocus={(event) => {
            const close = event.currentTarget.querySelector<HTMLElement>("[data-lightbox-close]");
            if (close) {
              event.preventDefault();
              close.focus();
            }
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <DialogPrimitive.Title className="sr-only">{alt}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            className="image-lightbox-close"
            aria-label="Cerrar"
            data-lightbox-close=""
          >
            <X className="h-5 w-5" aria-hidden />
          </DialogPrimitive.Close>
          <div className="image-lightbox-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="image-lightbox-img" />
            {caption ? (
              <DialogPrimitive.Description className="image-lightbox-caption">
                {caption}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">
                Imagen ampliada. Cerrar con Escape o el botón X.
              </DialogPrimitive.Description>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
