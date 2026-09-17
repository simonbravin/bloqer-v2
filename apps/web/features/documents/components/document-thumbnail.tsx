"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { documentDownloadHref } from "../lib/document-file-utils";

type Props = {
  documentId: string;
  alt?: string;
  className?: string;
  /** When set, thumbnail is a button that opens the gallery (or other handler). */
  onClick?: () => void;
};

/** Thumbnail via authenticated download; falls back to icon on HEIC / load error. */
export function DocumentThumbnail({ documentId, alt = "", className, onClick }: Props) {
  const [failed, setFailed] = useState(false);
  const src = documentDownloadHref(documentId, "inline");
  const label = alt ? `Ver ${alt}` : "Ver imagen";

  useEffect(() => {
    setFailed(false);
  }, [documentId]);

  if (failed) {
    const fallback = (
      <div
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted",
          className,
        )}
      >
        <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
    );
    if (!onClick) return fallback;
    return (
      <button
        type="button"
        onClick={onClick}
        className="shrink-0 rounded-md p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={label}
      >
        {fallback}
      </button>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "h-14 w-14 shrink-0 cursor-zoom-in overflow-hidden rounded-md p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        aria-label={label}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated download thumbnail */}
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </button>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- authenticated download thumbnail
    <img
      src={src}
      alt={alt}
      className={cn("h-14 w-14 shrink-0 rounded-md object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}
