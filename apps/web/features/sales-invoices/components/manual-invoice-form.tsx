"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox, toSearchableOptions } from "@/components/ui/searchable-combobox";
import { DocumentUploadZone } from "@/features/documents/components/document-upload-zone";
import { uploadDocumentAction } from "@/features/documents/upload-document-action";
import { createSalesInvoiceAction } from "@/app/(app)/proyectos/[id]/facturas/actions";

export type ClientOption = {
  id: string;
  label: string;
};

interface Props {
  projectId: string;
  clients: ClientOption[];
  storageConfigured?: boolean;
}

export function ManualInvoiceForm({ projectId, clients, storageConfigured = false }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clientContactId, setClientContactId] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  async function uploadAttachmentIfAny(invoiceId: string) {
    if (!attachment || !storageConfigured) return null;
    const detailPath = `/proyectos/${projectId}/facturas/${invoiceId}`;
    const fd = new FormData();
    fd.set("file", attachment);
    fd.set("linkedEntityType", "SALES_INVOICE");
    fd.set("linkedEntityId", invoiceId);
    fd.set("category", "INVOICE");
    fd.set("projectId", projectId);
    fd.set("revalidatePaths", JSON.stringify([detailPath]));
    return uploadDocumentAction(fd);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clientContactId) { setError("Debe seleccionar un cliente"); return; }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createSalesInvoiceAction(projectId, {
        projectId,
        clientContactId,
        issueDate:  fd.get("issueDate")  as string,
        dueDate:    fd.get("dueDate")    as string,
        currency:   "ARS",
        notes:      (fd.get("notes") as string) || null,
        externalInvoiceRef: null,
        lines: [{
          description: fd.get("description") as string,
          quantity:    fd.get("quantity")    as string,
          unitPrice:   fd.get("unitPrice")   as string,
          taxRate:     (fd.get("taxRate") as string) || "0",
          sortOrder:   0,
        }],
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      const uploadRes = await uploadAttachmentIfAny(res.id);
      if (uploadRes && "error" in uploadRes) {
        toast.warning(
          `Factura creada, pero no se pudo adjuntar el archivo: ${uploadRes.error}. Podés reintentar desde el detalle.`,
        );
      }
      router.push(`/proyectos/${projectId}/facturas/${res.id}`);
    });
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label>Cliente</Label>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay clientes activos en el directorio. Cree un contacto con rol Cliente primero.
              </p>
            ) : (
              <SearchableCombobox
                options={toSearchableOptions(clients)}
                value={clientContactId}
                onValueChange={setClientContactId}
                placeholder="Seleccionar cliente…"
                searchPlaceholder="Buscar cliente…"
                emptyText="Ningún cliente coincide."
              />
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="issueDate">Fecha de emisión</Label>
            <Input id="issueDate" name="issueDate" type="date" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dueDate">Fecha de vencimiento</Label>
            <Input id="dueDate" name="dueDate" type="date" required />
          </div>
        </div>

        <hr />
        <p className="text-sm font-medium">Línea 1</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="description">Descripción</Label>
            <Input id="description" name="description" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="quantity">Cantidad</Label>
            <Input id="quantity" name="quantity" required defaultValue="1" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="unitPrice">Precio unitario</Label>
            <Input id="unitPrice" name="unitPrice" required placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="taxRate">Alícuota IVA (%)</Label>
            <Input id="taxRate" name="taxRate" defaultValue="21" />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>

        {storageConfigured && (
          <div className="space-y-2">
            <Label>Comprobante (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Foto o PDF de la factura. Se adjunta después de crear el documento.
            </p>
            <DocumentUploadZone
              selectedFile={attachment}
              onFileSelect={setAttachment}
              onValidationError={setError}
              disabled={isPending}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={isPending || clients.length === 0}>
            {isPending ? "Guardando…" : "Crear factura"}
          </Button>
        </div>
      </form>
    </div>
  );
}
