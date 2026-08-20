"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ALLOWED_MIME_TYPES } from "@bloqer/validators";
import {
  formatUploadSize,
  isImageUploadFile,
  validateUploadFile,
} from "../lib/validate-upload-file";

const IMAGE_ACCEPT = "image/*";

type Props = {
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  onValidationError: (message: string | null) => void;
  disabled?: boolean;
};

export function DocumentUploadZone({
  selectedFile,
  onFileSelect,
  onValidationError,
  disabled = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (!selectedFile || !isImageUploadFile(selectedFile)) {
      setPreviewUrl(null);
      setPreviewFailed(false);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    setPreviewFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  function acceptFile(file: File | undefined) {
    if (!file) {
      onFileSelect(null);
      return;
    }
    const err = validateUploadFile(file);
    if (err) {
      onValidationError(err);
      onFileSelect(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      return;
    }
    onValidationError(null);
    onFileSelect(file);
  }

  function clearFile() {
    onFileSelect(null);
    onValidationError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          acceptFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => {
          if (!disabled) fileInputRef.current?.click();
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-muted-foreground/50",
          disabled && "pointer-events-none opacity-50",
          selectedFile && !dragOver && "border-primary/40 shell-surface-inset",
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
        {selectedFile ? (
          <>
            <p className="text-sm font-medium break-all">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatUploadSize(selectedFile.size)} · Click o arrastrá para reemplazar
            </p>
          </>
        ) : (
          <>
            <p className="hidden text-sm font-medium md:block">Arrastrá un archivo acá</p>
            <p className="text-sm font-medium md:hidden">Foto o archivo</p>
            <p className="hidden text-xs text-muted-foreground md:block">o usá el botón para seleccionarlo</p>
            <p className="text-xs text-muted-foreground">
              PDF, imágenes, Word, Excel, CSV, texto · máx. 50 MB
            </p>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        accept={ALLOWED_MIME_TYPES.join(",")}
        disabled={disabled}
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="sr-only"
        accept={IMAGE_ACCEPT}
        capture="environment"
        disabled={disabled}
        onChange={(e) => acceptFile(e.target.files?.[0])}
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
            fileInputRef.current?.click();
          }}
        >
          <span className="md:hidden">Elegir archivo</span>
          <span className="hidden md:inline">Seleccionar archivo</span>
        </Button>
        {selectedFile ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 md:min-h-9"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              clearFile();
            }}
          >
            Quitar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
