"use client";

import { ReceiptForm, type WarehouseOption } from "./receipt-form";
import { PendingEvidencePicker } from "@/features/documents/components/pending-evidence-picker";
import { PendingEvidenceRetryPanel } from "@/features/documents/components/pending-evidence-retry-panel";
import { usePendingEntityEvidence } from "@/features/documents/lib/use-pending-entity-evidence";
import type { PurchaseOrderLineView } from "@bloqer/services";

type Props = {
  projectId: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  poLines: PurchaseOrderLineView[];
  warehouseOptions?: WarehouseOption[];
};

export function ReceiptCreateComposer({
  projectId,
  purchaseOrderId,
  purchaseOrderCode,
  poLines,
  warehouseOptions,
}: Props) {
  const evidence = usePendingEntityEvidence({
    projectId,
    linkedEntityType: "PURCHASE_RECEIPT",
    category: "RECEIPT",
    afterUploadPath: (id) => `/proyectos/${projectId}/recepciones/${id}`,
    createdLabel: "Recepción creada correctamente",
    itemNounSingular: "archivo",
    itemNounPlural: "archivos",
    detailHref: (id) => `/proyectos/${projectId}/recepciones/${id}`,
  });

  const detailHref = evidence.createdId
    ? `/proyectos/${projectId}/recepciones/${evidence.createdId}`
    : `/proyectos/${projectId}/ordenes-compra/${purchaseOrderId}`;

  if (evidence.retryVisible) {
    const n = evidence.failedCount;
    return (
      <PendingEvidenceRetryPanel
        title="Recepción creada correctamente."
        description={
          n === 1
            ? "1 archivo no pudo subirse. La recepción quedó guardada. Podés reintentar o abrirla."
            : `${n} archivos no pudieron subirse. La recepción quedó guardada. Podés reintentar o abrirla.`
        }
        queue={evidence.queue}
        retrying={evidence.retrying}
        detailHref={detailHref}
        detailLabel="Ver recepción"
        onRetryAll={() => void evidence.retryFailed()}
        onRetryOne={(clientId) => void evidence.retryOne(clientId)}
      />
    );
  }

  return (
    <ReceiptForm
      projectId={projectId}
      purchaseOrderId={purchaseOrderId}
      purchaseOrderCode={purchaseOrderCode}
      poLines={poLines}
      warehouseOptions={warehouseOptions}
      onCreated={evidence.handleCreated}
      extraSections={
        <PendingEvidencePicker
          files={evidence.files}
          onChange={evidence.setFiles}
          title="Foto / remito"
          description="Evidencia de entrega: foto del material, remito o etiqueta. Se sube al registrar."
          emptyLabel="Todavía no hay foto ni remito."
          fileInputTestId="receipt-evidence-file"
        />
      }
    />
  );
}
