"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Label }    from "@/components/ui/label";
import { Input }    from "@/components/ui/input";
import { Button }   from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ALLOWED_MIME_TYPES, resolveAllowedMimeType } from "@bloqer/validators";
import { uploadDocumentAction } from "../upload-document-action";

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
  /** App Router paths to revalidate after a successful upload. */
  revalidatePaths?:  string[];
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
  revalidatePaths,
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

    const mime = resolveAllowedMimeType(file.name, file.type);
    if (!mime) {
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
      const paths = [
        ...new Set([
          ...(revalidatePaths ?? []),
          ...(afterUploadPath ? [afterUploadPath] : []),
          ...(projectId ? [`/proyectos/${projectId}/documentos`] : []),
        ]),
      ];

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("category", category);
      if (description) formData.append("description", description);
      if (projectId) formData.append("projectId", projectId);
      if (linkedEntity) {
        formData.append("linkedEntityType", linkedEntity.type);
        formData.append("linkedEntityId", linkedEntity.id);
      }
      if (paths.length > 0) {
        formData.append("revalidatePaths", JSON.stringify(paths));
      }

      const result = await uploadDocumentAction(formData);

      if ("error" in result) {
        setError(result.error);
        setPending(false);
        return;
      }

      const { documentId } = result;
      const nextPath =
        afterUploadPath ??
        (projectId ? `/proyectos/${projectId}/documentos/${documentId}` : null);
      toast.success("Documento guardado.");
      if (nextPath) {
        router.push(nextPath);
      }
      router.refresh();
      setPending(false);
    } catch {
      setError("Error al subir el archivo. Intentá de nuevo.");
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
