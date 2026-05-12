import type { UserRole } from "@bloqer/domain";

export interface ServiceContext {
  actorUserId: string;
  tenantId: string;
  companyId: string | null;
  roles: UserRole[];
  ipAddress?: string | null;
}

export type ServiceErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
