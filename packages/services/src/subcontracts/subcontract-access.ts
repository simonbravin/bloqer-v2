import { can } from "@bloqer/domain";
import type { ServiceContext } from "../types";

/** Matches document.service listEntityDocuments / canViewDocumentByLink for subcontract-linked attachments. */
export function canViewSubcontractsArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "SUBCONTRACTS") || can(roles, "VIEW", "PROJECTS");
}

/** Matches document.service initiate/canMutateDocumentByLink for SUBCONTRACT / SUBCONTRACT_CERTIFICATION. */
export function canEditSubcontractsArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "EDIT", "SUBCONTRACTS");
}
