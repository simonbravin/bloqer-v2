import type { CertificationStatus } from "@bloqer/database";

export type CertificationListItem = {
  id: string;
  projectId: string;
  code: string;
  periodStart: Date;
  periodEnd: Date;
  status: CertificationStatus;
  totalAmount: string;
  currency: string;
};
