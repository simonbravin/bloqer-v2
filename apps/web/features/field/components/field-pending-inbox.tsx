import Link from "next/link";
import type { FieldPendingGroup, FieldPendingList } from "@bloqer/services";
import { FieldPendingCard } from "./field-pending-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CHIPS: { id: "todos" | FieldPendingGroup; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "compras", label: "Compras" },
  { id: "obra", label: "Obra" },
  { id: "certificaciones", label: "Certificaciones" },
];

type Props = {
  list: FieldPendingList;
  group: FieldPendingGroup | undefined;
  projectId: string | undefined;
  projects: Array<{ id: string; code: string }>;
  obraHref: string;
};

export function FieldPendingInbox({ list, group, projectId, projects, obraHref }: Props) {
  const chipHref = (id: (typeof CHIPS)[number]["id"]) => {
    const params = new URLSearchParams();
    if (id !== "todos") params.set("grupo", id);
    if (projectId) params.set("proyecto", projectId);
    const q = params.toString();
    return q ? `/pendientes?${q}` : "/pendientes";
  };

  return (
    <div className="space-y-4" data-testid="field-pending-inbox" data-query-ms={list.queryMs}>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CHIPS.map((chip) => {
          const active = (group ?? "todos") === chip.id;
          return (
            <Link
              key={chip.id}
              href={chipHref(chip.id)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm",
                active ? "border-foreground bg-foreground text-background" : "bg-background",
              )}
            >
              {chip.label}
            </Link>
          );
        })}
      </div>

      {projects.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Link
            href={group ? `/pendientes?grupo=${group}` : "/pendientes"}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm",
              !projectId ? "border-foreground bg-foreground text-background" : "bg-background",
            )}
          >
            Todas las obras
          </Link>
          {projects.map((project) => {
            const params = new URLSearchParams();
            if (group) params.set("grupo", group);
            params.set("proyecto", project.id);
            const active = projectId === project.id;
            return (
              <Link
                key={project.id}
                href={`/pendientes?${params.toString()}`}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm",
                  active ? "border-foreground bg-foreground text-background" : "bg-background",
                )}
              >
                {project.code}
              </Link>
            );
          })}
        </div>
      ) : null}

      {list.items.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="font-medium">No tenés acciones pendientes.</p>
          <div className="mt-4 flex flex-col gap-2">
            <Button asChild className="min-h-11">
              <Link href={obraHref}>Volver a mi obra</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/notificaciones">Ver notificaciones</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {list.items.map((item) => (
            <FieldPendingCard key={`${item.entityType}-${item.entityId}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
