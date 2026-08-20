import { can } from "@bloqer/domain";
import type { ServiceContext } from "../types";

export function canViewJobsiteLogArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "JOBSITE_LOG") || can(roles, "VIEW", "PROJECTS");
}

/** Create / update / submit / cancel — not approve/return (supervisor). */
export function canMutateJobsiteLogAsContributor(roles: ServiceContext["roles"]): boolean {
  return can(roles, "EDIT", "JOBSITE_LOG") || can(roles, "EDIT", "PROJECTS");
}

export function canSuperviseJobsiteLog(roles: ServiceContext["roles"]): boolean {
  return can(roles, "APPROVE", "JOBSITE_LOG") || can(roles, "EDIT", "PROJECTS");
}
