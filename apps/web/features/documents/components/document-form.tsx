"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadDocumentAction } from "../upload-document-action";
import { DocumentUploadZone } from "./document-upload-zone";

const CATEGORY_OPTIONS = [
  { value: "CONTRACT", label: "Contrato" },
  { value: "PLAN", label: "Plano" },
  { value: "PERMIT", label: "Permiso" },
  { value: "TECHNICAL", label: "Técnico" },
  { value: "PHOTO", label: "Foto / evidencia" },
  { value: "INVOICE", label: "Factura" },
  { value: "RECEIPT", label: "Remito" },
  { value: "CERTIFICATE", label: "Certificado" },
  { value: "REPORT", label: "Informe" },
  { value: "JOBSITE_EVIDENCE", label: "Evidencia obra" },
  { value: "OTHER", label: "Otro" },
];

export type DocumentFormProps = {
  /** Project UUID, or `null` for corporate supplier-invoice uploads. */
  projectId: string | null;
  storageConfigured: boolean;
  linkedEntity?:
    | { type: "JOBSITE_LOG"; id: string }
    | { type: "CERTIFICATION"; id: string }
    | { type: "SUPPLIER_INVOICE"; id: string }
    | { type: "SALES_INVOICE"; id: string }
    | { type: "PURCHASE_ORDER"; id: string }
    | { type: "PURCHASE_RECEIPT"; id: string }
    | { type: "PURCHASE_REQUEST"; id: string }
    | { type: "PROCUREMENT_QUOTE"; id: string }
    | { type: "SUBCONTRACT"; id: string }
    | { type: "SUBCONTRACT_CERTIFICATION"; id: string; subcontractId: string }
    | { type: "BUDGET"; id: string };
  defaultCategory?: string;
  /** Navigate here after upload when not using dialog mode. */
  afterUploadPath?: string;
  cancelHref?: string;
  submitLabel?: string;
  placeholderWarning?: string;
  revalidatePaths?: string[];
  layout?: "page" | "dialog";
  onSuccess?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
};

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
  layout = "page",
  onSuccess,
  onCancel,
  onPendingChange,
}: DocumentFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [category, setCategory] = useState(defaultCategory);
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedFile) {
      setError("Seleccioná un archivo");
      return;
    }

    setPending(true);
    onPendingChange?.(true);

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
        onPendingChange?.(false);
        return;
      }

      const { documentId } = result;
      toast.success("Documento guardado.");
      setSelectedFile(null);
      setDescription("");
      setCategory(defaultCategory);

      if (onSuccess) {
        onSuccess();
      } else {
        const nextPath =
          afterUploadPath ??
          (projectId ? `/proyectos/${projectId}/documentos/${documentId}` : null);
        if (nextPath) router.push(nextPath);
      }

      router.refresh();
      setPending(false);
      onPendingChange?.(false);
    } catch {
      setError("Error al subir el archivo. Intentá de nuevo.");
      setPending(false);
      onPendingChange?.(false);
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }
    router.push(cancelHref ?? (projectId ? `/proyectos/${projectId}/documentos` : "/finanzas"));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!storageConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/10 dark:text-amber-300">
          {placeholderWarning ??
            "El almacenamiento de archivos no está configurado en este entorno. Solo se guardará la metadata; no habrá un archivo descargable."}
        </div>
      )}

      <DocumentUploadZone
        selectedFile={selectedFile}
        onFileSelect={setSelectedFile}
        onValidationError={setError}
        disabled={pending}
      />

      <div className="space-y-1">
        <Label>Categoría</Label>
        <Select value={category} onValueChange={setCategory} disabled={pending}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
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
          placeholder="Descripción opcional…"
          rows={layout === "dialog" ? 2 : 3}
          disabled={pending}
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={handleCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !selectedFile}>
          {pending ? "Subiendo…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
