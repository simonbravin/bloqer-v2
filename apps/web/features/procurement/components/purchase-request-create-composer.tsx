"use client";

import { useEffect, useState } from "react";
import type { PurchaseRequestAudioProposal } from "@bloqer/ai";
import { Button } from "@/components/ui/button";
import { PurchaseRequestForm } from "./purchase-request-form";
import { PurchaseRequestAudioAssistant } from "./purchase-request-audio-assistant";
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
  onPendingChange?: (pending: boolean) => void;
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
  onPendingChange,
}: Props) {
  const [audioAvailable, setAudioAvailable] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioProposal, setAudioProposal] = useState<PurchaseRequestAudioProposal | null>(null);
  const [operationPending, setOperationPending] = useState(false);
  function pendingChanged(value: boolean) { setOperationPending(value); onPendingChange?.(value); }
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/ai/purchase-request-audio", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data: { enabled?: boolean } | null) => { if (!controller.signal.aborted) setAudioAvailable(data?.enabled === true); })
      .catch(() => { /* Manual entry remains available. */ });
    return () => controller.abort();
  }, []);
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

  async function retryEvidence(clientId?: string) {
    onPendingChange?.(true);
    try {
      if (clientId) await evidence.retryOne(clientId);
      else await evidence.retryFailed();
    } finally {
      onPendingChange?.(false);
    }
  }

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
        onRetryAll={() => void retryEvidence()}
        onRetryOne={(clientId) => void retryEvidence(clientId)}
      />
    );
  }

  return (
    <>
    {audioAvailable && !audioOpen && !audioProposal ? <Button type="button" variant="outline" disabled={operationPending} onClick={() => setAudioOpen(true)}>Dictar solicitud</Button> : null}
    {audioOpen ? <PurchaseRequestAudioAssistant projectId={projectId} onPendingChange={pendingChanged} onCancel={() => setAudioOpen(false)} onApply={(proposal) => { setAudioProposal(proposal); setAudioOpen(false); }} /> : null}
    <div hidden={audioOpen}>
    <PurchaseRequestForm
      key={audioProposal ? "audio" : "manual"}
      projectId={projectId}
      wbsOptions={wbsOptions}
      initialLine={audioProposal ? undefined : initialLine}
      initialValues={audioProposal ? { neededByDate: audioProposal.neededByDate, notes: audioProposal.observations, lines: audioProposal.lines.map((line) => ({ description: line.description ?? "", quantity: line.quantity ?? "", unit: line.unit ?? "" })) } : undefined}
      requireAudioReview={Boolean(audioProposal)}
      prefilledFromMaterials={!audioProposal && prefilledFromMaterials}
      prefillFrom={prefillFrom}
      variant={variant}
      onCancel={onCancel}
      onSuccess={onSuccess}
      onPendingChange={pendingChanged}
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
    </div>
    </>
  );
}
