const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when the URL segment is a persisted project id (not static routes like `nuevo`). */
export function isProjectIdSegment(segment: string): boolean {
  return UUID_RE.test(segment);
}
