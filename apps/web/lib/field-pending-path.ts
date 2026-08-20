const PROJECT_PENDIENTES_PATH = /^\/proyectos\/[^/]+\/pendientes$/;

/** Company `/pendientes` and project `/proyectos/[id]/pendientes`. */
export function isPendingInboxPath(pathname: string): boolean {
  return pathname === "/pendientes" || PROJECT_PENDIENTES_PATH.test(pathname);
}
