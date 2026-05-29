/** Client-safe view model for audit log detail (mirrors TenantAuditLogDetail from services). */
export type AuditLogDetailView = {
  id: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityId: string;
  module: string | null;
  reference: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorLabel: string;
  projectId: string | null;
  projectName: string | null;
  companyId: string | null;
  ipAddress: string | null;
  createdAt: Date;
  before: unknown;
  after: unknown;
};
