export type FieldPendingObraCta = {
  href: string;
  label: string;
};

/** Empty-state CTA when the pending inbox has no items. Never pretends there is a single obra. */
export function fieldPendingEmptyObraCta(opts: {
  projectId: string | undefined;
  projects: Array<{ id: string; code: string }>;
  lastProjectId: string | null | undefined;
}): FieldPendingObraCta {
  const { projectId, projects, lastProjectId } = opts;
  if (projectId) {
    const project = projects.find((row) => row.id === projectId);
    return {
      href: `/proyectos/${projectId}`,
      label: project ? `Volver a ${project.code}` : "Volver a la obra",
    };
  }
  if (projects.length === 1) {
    const project = projects[0]!;
    return { href: `/proyectos/${project.id}`, label: `Volver a ${project.code}` };
  }
  if (lastProjectId && projects.some((row) => row.id === lastProjectId)) {
    const project = projects.find((row) => row.id === lastProjectId)!;
    return { href: `/proyectos/${project.id}`, label: `Ir a ${project.code}` };
  }
  return { href: "/proyectos", label: "Ver proyectos" };
}
