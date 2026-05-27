"use client";

import { useSearchParams } from "next/navigation";
import type { CertificationListItem } from "./certification-list";
import { CertificationCards } from "./certification-cards";
import { CertificationTable } from "./certification-table";

export function CertificationListSection({
  certifications,
  projectId,
}: {
  certifications: CertificationListItem[];
  projectId: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") {
    return <CertificationCards certifications={certifications} projectId={projectId} />;
  }
  return <CertificationTable certifications={certifications} projectId={projectId} />;
}
