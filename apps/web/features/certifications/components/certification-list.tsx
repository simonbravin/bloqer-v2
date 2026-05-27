import type { CertificationStatus } from "@bloqer/database";

/** @deprecated Use CertificationTable or CertificationListSection */
export { CertificationTable as CertificationList } from "./certification-table";

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
