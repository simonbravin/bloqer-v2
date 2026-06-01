import { isUuid } from "@bloqer/utils";

/** True when the URL segment is a persisted project id (not static routes like `nuevo`). */
export function isProjectIdSegment(segment: string): boolean {
  return isUuid(segment);
}
