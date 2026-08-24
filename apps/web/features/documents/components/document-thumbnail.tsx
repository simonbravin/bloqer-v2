"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { documentDownloadHref } from "../lib/document-file-utils";

type Props = {
  documentId: string;
  alt?: string;
  className?: string;
};

/** Thumbnail via authenticated download; falls back to icon on HEIC / load error. */
export function DocumentThumbnail({ documentId, alt = "", className }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted",
          className,
        )}
      >
        <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- authenticated download thumbnail
    <img
      src={documentDownloadHref(documentId, "inline")}
      alt={alt}
      className={cn("h-14 w-14 shrink-0 rounded-md object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}
