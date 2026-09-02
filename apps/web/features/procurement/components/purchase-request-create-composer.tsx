"use client";

import { PurchaseRequestForm } from "./purchase-request-form";
import { PendingEvidencePicker } from "@/features/documents/components/pending-evidence-picker";
import { PendingEvidenceRetryPanel } from "@/features/documents/components/pending-evidence-retry-panel";
import { usePendingEntityEvidence } from "@/features/documents/lib/use-pending-entity-evidence";
import type { WbsOption } from "./purchase-order-lines-editor";

type Props = {
  projectId: string;
  wbsOptions: WbsOption[];
  initialLine?: {
    wbsNodeId?: string;
    description?: string;
    quantity?: string;
    productId?: string;
    costAnalysisLineId?: string;
    unit?: string;
    costType?: "MATERIAL" | "LABOR" | "EQUIPMENT" | "SUBCONTRACT" | "OTHER";
  };
  prefilledFromMaterials?: boolean;
  /** Origin board for banner copy (`materiales` | `mano-obra` | `equipos`). */
  prefillFrom?: "materiales" | "mano-obra" | "equipos";
  variant?: "card" | "plain";
  onCancel?: () => void;
  onSuccess?: () => void;
};

export function PurchaseRequestCreateComposer({
  projectId,
  wbsOptions,
  initialLine,
  prefilledFromMaterials,
  prefillFrom,
  variant = "plain",
  onCancel,
  onSuccess,
}: Props) {
  const evidence = usePendingEntityEvidence({
    projectId,
    linkedEntityType: "PURCHASE_REQUEST",
    category: "OTHER",
    afterUploadPath: (id) => `/proyectos/${projectId}/solicitudes-compra/${id}`,
    createdLabel: "Solicitud creada correctamente",
    itemNounSingular: "archivo",
    itemNounPlural: "archivos",
    detailHref: (id) => `/proyectos/${projectId}/solicitudes-compra/${id}`,
    onRetrySuccess: onSuccess,
  });

  const detailHref = evidence.createdId
    ? `/proyectos/${projectId}/solicitudes-compra/${evidence.createdId}`
    : `/proyectos/${projectId}/solicitudes-compra`;

  if (evidence.retryVisible) {
    const n = evidence.failedCount;
    return (
      <PendingEvidenceRetryPanel
        title="Solicitud creada correctamente."
        description={
          n === 1
            ? "1 archivo no pudo subirse. La solicitud quedó guardada. Podés reintentar o abrirla."
            : `${n} archivos no pudieron subirse. La solicitud quedó guardada. Podés reintentar o abrirla.`
        }
        queue={evidence.queue}
        retrying={evidence.retrying}
        detailHref={detailHref}
        detailLabel="Ver solicitud"
        onRetryAll={() => void evidence.retryFailed()}
        onRetryOne={(clientId) => void evidence.retryOne(clientId)}
      />
    );
  }

  return (
    <PurchaseRequestForm
      projectId={projectId}
      wbsOptions={wbsOptions}
      initialLine={initialLine}
      prefilledFromMaterials={prefilledFromMaterials}
      prefillFrom={prefillFrom}
      variant={variant}
      onCancel={onCancel}
      onSuccess={onSuccess}
      onCreated={evidence.handleCreated}
      extraSections={
        <PendingEvidencePicker
          files={evidence.files}
          onChange={evidence.setFiles}
          title="Evidencia"
          description="Se suben al crear la solicitud. Podés tomar una foto o elegir un archivo."
          emptyLabel="Todavía no hay evidencia en esta solicitud."
          fileInputTestId="purchase-request-evidence-file"
        />
      }
    />
  );
}
