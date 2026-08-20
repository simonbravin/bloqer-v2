"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALLOWED_MIME_TYPES } from "@bloqer/validators";
import {
  formatUploadSize,
  isImageUploadFile,
  validateUploadFile,
} from "@/features/documents/lib/validate-upload-file";

const IMAGE_ACCEPT = "image/*";

export type PendingEvidenceQueuedFile = {
  clientId: string;
  file: File;
};

type Props = {
  files: PendingEvidenceQueuedFile[];
  onChange: (files: PendingEvidenceQueuedFile[]) => void;
  disabled?: boolean;
  title: string;
  description: string;
  emptyLabel: string;
  itemLabel?: string;
  fileInputTestId: string;
};

function PreviewThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImageUploadFile(file)) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    setFailed(false);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  if (!url || failed) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted">
        <FileText className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- local blob preview
    <img
      src={url}
      alt=""
      className="h-16 w-16 shrink-0 rounded-md object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export function PendingEvidencePicker({
  files,
  onChange,
  disabled = false,
  title,
  description,
  emptyLabel,
  itemLabel = "Archivo",
  fileInputTestId,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function appendFiles(list: FileList | File[] | null) {
    if (!list || disabled) return;
    const incoming = Array.from(list);
    const next = [...files];
    for (const file of incoming) {
      const err = validateUploadFile(file);
      if (err) {
        setError(err);
        continue;
      }
      next.push({ clientId: crypto.randomUUID(), file });
    }
    if (next.length !== files.length) setError(null);
    onChange(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  return (
    <section className="form-section space-y-3 p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        accept={ALLOWED_MIME_TYPES.join(",")}
        multiple
        data-testid={fileInputTestId}
        disabled={disabled}
        onChange={(e) => appendFiles(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="sr-only"
        accept={IMAGE_ACCEPT}
        capture="environment"
        disabled={disabled}
        onChange={(e) => appendFiles(e.target.files)}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 md:min-h-9 md:hidden"
          disabled={disabled}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera className="mr-2 h-4 w-4" aria-hidden />
          Tomar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 md:min-h-9"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="md:hidden">Elegir archivo</span>
          <span className="hidden md:inline">Seleccionar archivo</span>
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {files.length > 0 ? (
        <ul className="space-y-2">
          {files.map((item, i) => (
            <li
              key={item.clientId}
              className="flex items-center gap-3 rounded-md border bg-card p-2"
            >
              <PreviewThumb file={item.file} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {itemLabel} {i + 1}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.file.name} · {formatUploadSize(item.file.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 shrink-0 md:min-h-9 md:min-w-9"
                disabled={disabled}
                aria-label={`Quitar ${itemLabel.toLowerCase()} ${i + 1}`}
                onClick={() => onChange(files.filter((f) => f.clientId !== item.clientId))}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </section>
  );
}
