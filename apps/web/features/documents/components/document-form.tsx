"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Label }    from "@/components/ui/label";
import { Input }    from "@/components/ui/input";
import { Button }   from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ALLOWED_MIME_TYPES } from "@bloqer/validators";

const CATEGORY_OPTIONS = [
  { value: "CONTRACT",         label: "Contrato" },
  { value: "PLAN",             label: "Plano" },
  { value: "PERMIT",           label: "Permiso" },
  { value: "TECHNICAL",        label: "Técnico" },
  { value: "PHOTO",            label: "Foto / evidencia" },
  { value: "INVOICE",          label: "Factura" },
  { value: "RECEIPT",          label: "Remito" },
  { value: "CERTIFICATE",      label: "Certificado" },
  { value: "REPORT",           label: "Informe" },
  { value: "JOBSITE_EVIDENCE", label: "Evidencia obra" },
  { value: "OTHER",            label: "Otro" },
];

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

interface Props {
  /** Project UUID, or `null` for corporate supplier-invoice uploads (API + validators allow only that case). */
  projectId:         string | null;
  storageConfigured: boolean;
  linkedEntity?:
    | { type: "JOBSITE_LOG"; id: string }
    | { type: "CERTIFICATION"; id: string }
    | { type: "SUPPLIER_INVOICE"; id: string }
    | { type: "PURCHASE_ORDER"; id: string }
    | { type: "PURCHASE_RECEIPT"; id: string }
    | { type: "SUBCONTRACT"; id: string }
    | { type: "SUBCONTRACT_CERTIFICATION"; id: string; subcontractId: string }
    | { type: "BUDGET"; id: string };
  defaultCategory?:  string;
  /** If set, navigate here after successful upload instead of the document detail page. */
  afterUploadPath?:  string;
  cancelHref?:       string;
  submitLabel?:      string;
  placeholderWarning?: string;
}

export function DocumentForm({
  projectId,
  storageConfigured,
  linkedEntity,
  defaultCategory = "OTHER",
  afterUploadPath,
  cancelHref,
  submitLabel = "Subir documento",
  placeholderWarning,
}: Props) {
  const router    = useRouter();
  const [error, setError]     = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [category, setCategory] = useState(defaultCategory);
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setError(null);
    if (!file) { setSelectedFile(null); return; }

    if (file.size > MAX_SIZE_BYTES) {
      setError("El archivo no puede superar 50 MB");
      e.target.value = "";
      setSelectedFile(null);
      return;
    }

    const mime = file.type || "application/octet-stream";
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
      setError("Tipo de archivo no permitido. Formatos aceptados: PDF, imágenes, Word, Excel, CSV, texto.");
      e.target.value = "";
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedFile) {
      setError("Seleccioná un archivo");
      return;
    }

    setPending(true);

    try {
      // 1. Request upload intent from server
      const initiateRes = await fetch("/api/documents/initiate-upload", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          projectId: projectId ?? null,
          originalFileName: selectedFile.name,
          mimeType:         selectedFile.type || "application/octet-stream",
          sizeBytes:        selectedFile.size,
          category,
          description:      description || null,
          ...(linkedEntity
            ? { linkedEntityType: linkedEntity.type, linkedEntityId: linkedEntity.id }
            : {}),
        }),
      });

      const initiateData = await initiateRes.json() as {
        documentId?: string;
        uploadUrl?: string | null;
        storageConfigured?: boolean;
        error?: string;
      };

      if (!initiateRes.ok) {
        setError(initiateData.error ?? "Error al iniciar la subida");
        setPending(false);
        return;
      }

      const { documentId, uploadUrl } = initiateData;
      if (!documentId) {
        setError("Respuesta inesperada del servidor");
        setPending(false);
        return;
      }

      // 2. If storage is configured, PUT the file to R2
      if (uploadUrl) {
        const putRes = await fetch(uploadUrl, {
          method:  "PUT",
          headers: { "Content-Type": selectedFile.type || "application/octet-stream" },
          body:    selectedFile,
        });

        if (!putRes.ok) {
          setError("Error al subir el archivo al almacenamiento. Intentá de nuevo.");
          setPending(false);
          return;
        }

        // 3. Confirm upload
        const confirmRes = await fetch(`/api/documents/${documentId}/confirm`, { method: "POST" });
        if (!confirmRes.ok) {
          setError("El archivo se subió pero no se pudo confirmar. Contactá soporte.");
          setPending(false);
          return;
        }
      }

      const nextPath =
        afterUploadPath ??
        (projectId ? `/proyectos/${projectId}/documentos/${documentId}` : null);
      if (nextPath) {
        router.push(nextPath);
      }
      router.refresh();
    } catch {
      setError("Error de red. Verificá tu conexión e intentá de nuevo.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!storageConfigured && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          {placeholderWarning ??
            "El almacenamiento real no está configurado en este entorno. Solo se guardará la metadata del documento (modo desarrollo)."}
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="file">
          Archivo{" "}
          <span className="text-muted-foreground text-xs">
            (máx. 50 MB — PDF, imágenes, Word, Excel, CSV, texto)
          </span>
        </Label>
        <Input
          id="file"
          type="file"
          accept={ALLOWED_MIME_TYPES.join(",")}
          onChange={onFileChange}
          required
        />
        {selectedFile && (
          <p className="text-xs text-muted-foreground">
            {selectedFile.name} — {(selectedFile.size / 1024).toFixed(1)} KB
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label>Categoría</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción opcional del documento..."
          rows={3}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !selectedFile}>
          {pending ? "Subiendo..." : submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            router.push(
              cancelHref ?? (projectId ? `/proyectos/${projectId}/documentos` : "/finanzas"),
            )}
          disabled={pending}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
