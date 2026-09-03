"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ALLOWED_MIME_TYPES } from "@bloqer/validators";
import {
  formatUploadSize,
  isImageUploadFile,
  uploadFormatsHint,
  validateUploadFile,
} from "../lib/validate-upload-file";

const IMAGE_ACCEPT = "image/*";

type BaseProps = {
  onValidationError: (message: string | null) => void;
  disabled?: boolean;
};

type SingleFileProps = BaseProps & {
  multiple?: false;
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  selectedFiles?: never;
  onFilesChange?: never;
  maxFiles?: never;
  maxTotalBytes?: never;
};

type MultiFileProps = BaseProps & {
  multiple: true;
  selectedFile?: never;
  onFileSelect?: never;
  selectedFiles: File[];
  onFilesChange: (files: File[]) => void;
  maxFiles?: number;
  maxTotalBytes?: number;
};

export type DocumentUploadZoneProps = SingleFileProps | MultiFileProps;

function fileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function DocumentUploadZone(props: DocumentUploadZoneProps) {
  const { onValidationError, disabled = false } = props;
  const multiple = props.multiple === true;
  const selectedFile = multiple ? null : props.selectedFile;
  const selectedFiles = multiple ? props.selectedFiles : [];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (multiple || !selectedFile || !isImageUploadFile(selectedFile)) {
      setPreviewUrl(null);
      setPreviewFailed(false);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    setPreviewFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [multiple, selectedFile]);

  function resetInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function openFilePicker() {
    if (!disabled) fileInputRef.current?.click();
  }

  function acceptIncoming(incoming: File[]) {
    if (incoming.length === 0) return;

    if (!multiple) {
      const file = incoming[0]!;
      const err = validateUploadFile(file);
      if (err) {
        onValidationError(err);
        props.onFileSelect(null);
        resetInputs();
        return;
      }
      onValidationError(null);
      props.onFileSelect(file);
      resetInputs();
      return;
    }

    const next = [...selectedFiles];
    const rejected: string[] = [];
    const existing = new Set(next.map(fileKey));
    let added = 0;

    for (const file of incoming) {
      if (existing.has(fileKey(file))) {
        rejected.push(`${file.name}: ya está en la lista`);
        continue;
      }
      const err = validateUploadFile(file);
      if (err) {
        rejected.push(`${file.name}: ${err}`);
        continue;
      }
      if (props.maxFiles != null && next.length >= props.maxFiles) {
        rejected.push(`${file.name}: máximo ${props.maxFiles} archivos`);
        continue;
      }
      const total = next.reduce((sum, f) => sum + f.size, 0) + file.size;
      if (props.maxTotalBytes != null && total > props.maxTotalBytes) {
        rejected.push(`${file.name}: el conjunto supera el tamaño máximo`);
        continue;
      }
      existing.add(fileKey(file));
      next.push(file);
      added += 1;
    }

    if (added > 0) props.onFilesChange(next);
    onValidationError(rejected.length > 0 ? rejected.join(". ") : null);
    resetInputs();
  }

  function clearSingle() {
    if (multiple) return;
    props.onFileSelect(null);
    onValidationError(null);
    resetInputs();
  }

  function removeAt(idx: number) {
    if (!multiple) return;
    props.onFilesChange(selectedFiles.filter((_, i) => i !== idx));
    onValidationError(null);
    resetInputs();
  }

  const hasSelection = multiple ? selectedFiles.length > 0 : Boolean(selectedFile);
  const formatsHint = uploadFormatsHint(
    multiple
      ? { maxTotalBytes: props.maxTotalBytes, maxFiles: props.maxFiles }
      : undefined,
  );

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Seleccionar archivo"
        aria-disabled={disabled || undefined}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openFilePicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          const next = e.relatedTarget;
          if (next instanceof Node && e.currentTarget.contains(next)) return;
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          const dropped = Array.from(e.dataTransfer.files ?? []);
          acceptIncoming(multiple ? dropped : dropped.slice(0, 1));
        }}
        onClick={() => openFilePicker()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-muted-foreground/50",
          disabled && "pointer-events-none opacity-50",
          hasSelection && !dragOver && "border-primary/40 shell-surface-inset",
        )}
      >
        {previewUrl && !previewFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote asset
          <img
            src={previewUrl}
            alt=""
            className="max-h-40 w-auto rounded-md object-contain"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
        )}
        {!multiple && selectedFile ? (
          <>
            <p className="text-sm font-medium break-all">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatUploadSize(selectedFile.size)} · Click o arrastrá para reemplazar
            </p>
          </>
        ) : multiple && selectedFiles.length > 0 ? (
          <>
            <p className="text-sm font-medium">
              {selectedFiles.length === 1
                ? "1 archivo seleccionado"
                : `${selectedFiles.length} archivos seleccionados`}
            </p>
            <p className="hidden text-xs text-muted-foreground md:block">
              Click o arrastrá para agregar más
            </p>
          </>
        ) : (
          <>
            <p className="hidden text-sm font-medium md:block">Arrastrá un archivo acá</p>
            <p className="text-sm font-medium md:hidden">Foto o archivo</p>
            <p className="hidden text-xs text-muted-foreground md:block">o usá el botón para seleccionarlo</p>
            <p className="text-xs text-muted-foreground">{formatsHint}</p>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        accept={ALLOWED_MIME_TYPES.join(",")}
        multiple={multiple}
        disabled={disabled}
        tabIndex={-1}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          acceptIncoming(multiple ? picked : picked.slice(0, 1));
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="sr-only"
        accept={IMAGE_ACCEPT}
        capture="environment"
        disabled={disabled}
        tabIndex={-1}
        onChange={(e) => acceptIncoming(Array.from(e.target.files ?? []).slice(0, 1))}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 md:min-h-9 md:hidden"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            cameraInputRef.current?.click();
          }}
        >
          <Camera className="mr-2 h-4 w-4" aria-hidden />
          Tomar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 md:min-h-9"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            openFilePicker();
          }}
        >
          <span className="md:hidden">Elegir archivo</span>
          <span className="hidden md:inline">Seleccionar archivo</span>
        </Button>
        {!multiple && selectedFile ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 md:min-h-9"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              clearSingle();
            }}
          >
            Quitar
          </Button>
        ) : null}
      </div>

      {multiple && selectedFiles.length > 0 ? (
        <ul className="space-y-2">
          {selectedFiles.map((file, idx) => (
            <li
              key={fileKey(file)}
              className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium break-all">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatUploadSize(file.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 md:min-h-9 sm:shrink-0"
                disabled={disabled}
                aria-label={`Quitar ${file.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(idx);
                }}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
