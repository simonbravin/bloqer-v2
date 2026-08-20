"use client";

import {
  JobsiteLogForm,
  type ContactOption,
  type ProductOption,
  type SubcontractOption,
  type WarehouseOption,
  type WbsItemOption,
} from "./jobsite-log-form";
import { JobsiteLogEvidencePicker } from "./jobsite-log-evidence-picker";
import { PendingEvidenceRetryPanel } from "@/features/documents/components/pending-evidence-retry-panel";
import { usePendingEntityEvidence } from "@/features/documents/lib/use-pending-entity-evidence";
import type { WbsIncrementalProgressSnapshot } from "@bloqer/services";

type Props = {
  projectId: string;
  companyId: string;
  wbsOptions: WbsItemOption[];
  contactOptions: ContactOption[];
  productOptions: ProductOption[];
  warehouseOptions: WarehouseOption[];
  subcontractOptions: SubcontractOption[];
  wbsProgressSnapshot?: WbsIncrementalProgressSnapshot;
  inventoryModuleEnabled?: boolean;
  legacyPhysicalPctWarning?: boolean;
  stockPreviewAction?: (warehouseId: string, productId: string) => Promise<{ balance?: string; error?: string }>;
  action: (fd: FormData) => Promise<{ error: string } | { id: string }>;
  onCancel?: () => void;
  onSuccess?: (id: string) => void;
};

export function JobsiteLogCreateComposer({
  projectId,
  onCancel,
  onSuccess,
  ...formProps
}: Props) {
  const evidence = usePendingEntityEvidence({
    projectId,
    linkedEntityType: "JOBSITE_LOG",
    category: "JOBSITE_EVIDENCE",
    afterUploadPath: (id) => `/proyectos/${projectId}/libro-obra/${id}`,
    createdLabel: "Parte creado correctamente",
    itemNounSingular: "foto",
    itemNounPlural: "fotos",
    detailHref: (id) => `/proyectos/${projectId}/libro-obra/${id}`,
    onRetrySuccess: onSuccess,
  });

  const detailHref = evidence.createdId
    ? `/proyectos/${projectId}/libro-obra/${evidence.createdId}`
    : `/proyectos/${projectId}/libro-obra`;

  if (evidence.retryVisible) {
    const failedCount = evidence.failedCount;
    return (
      <PendingEvidenceRetryPanel
        title="Parte creado correctamente."
        description={
          failedCount === 1
            ? "1 foto no pudo subirse. El parte quedó guardado. Podés reintentar las fotos o abrir el parte."
            : `${failedCount} fotos no pudieron subirse. El parte quedó guardado. Podés reintentar las fotos o abrir el parte.`
        }
        itemLabel="Foto"
        queue={evidence.queue}
        retrying={evidence.retrying}
        detailHref={detailHref}
        detailLabel="Ver parte"
        onRetryAll={() => void evidence.retryFailed()}
        onRetryOne={(clientId) => void evidence.retryOne(clientId)}
      />
    );
  }

  return (
    <JobsiteLogForm
      projectId={projectId}
      onCancel={onCancel}
      onSuccess={onSuccess}
      onCreated={evidence.handleCreated}
      extraSections={
        <JobsiteLogEvidencePicker files={evidence.files} onChange={evidence.setFiles} />
      }
      {...formProps}
    />
  );
}
