"use client";

import {
  PendingEvidencePicker,
  type PendingEvidenceQueuedFile,
} from "@/features/documents/components/pending-evidence-picker";

export type JobsiteLogQueuedFile = PendingEvidenceQueuedFile;

type Props = {
  files: JobsiteLogQueuedFile[];
  onChange: (files: JobsiteLogQueuedFile[]) => void;
  disabled?: boolean;
};

export function JobsiteLogEvidencePicker({ files, onChange, disabled = false }: Props) {
  return (
    <PendingEvidencePicker
      files={files}
      onChange={onChange}
      disabled={disabled}
      title="Fotos / evidencia"
      description="Se suben al guardar el parte. Podés tomar varias fotos."
      emptyLabel="Todavía no hay fotos en este parte."
      itemLabel="Foto"
      fileInputTestId="jobsite-log-evidence-file"
    />
  );
}
