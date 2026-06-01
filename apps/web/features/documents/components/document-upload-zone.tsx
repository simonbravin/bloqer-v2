"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ALLOWED_MIME_TYPES, resolveAllowedMimeType } from "@bloqer/validators";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

type Props = {
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  onValidationError: (message: string | null) => void;
  disabled?: boolean;
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File): string | null {
  if (file.size > MAX_SIZE_BYTES) {
    return "El archivo no puede superar 50 MB";
  }
  const mime = resolveAllowedMimeType(file.name, file.type);
  if (!mime) {
    return "Tipo de archivo no permitido. Formatos aceptados: PDF, imágenes, Word, Excel, CSV, texto.";
  }
  return null;
}

export function DocumentUploadZone({
  selectedFile,
  onFileSelect,
  onValidationError,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function acceptFile(file: File | undefined) {
    if (!file) {
      onFileSelect(null);
      return;
    }
    const err = validateFile(file);
    if (err) {
      onValidationError(err);
      onFileSelect(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    onValidationError(null);
    onFileSelect(file);
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
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
          if (!disabled) inputRef.current?.click();
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-muted-foreground/50",
          disabled && "pointer-events-none opacity-50",
          selectedFile && !dragOver && "border-primary/40 bg-muted/20",
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
        {selectedFile ? (
          <>
            <p className="text-sm font-medium">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {fmtSize(selectedFile.size)} · Click o arrastrá para reemplazar
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">Arrastrá un archivo acá</p>
            <p className="text-xs text-muted-foreground">o usá el botón para seleccionarlo</p>
            <p className="text-xs text-muted-foreground">
              PDF, imágenes, Word, Excel, CSV, texto · máx. 50 MB
            </p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={ALLOWED_MIME_TYPES.join(",")}
        disabled={disabled}
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        Seleccionar archivo
      </Button>
    </div>
  );
}
