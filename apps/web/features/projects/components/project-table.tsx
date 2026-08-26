"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { TableScroll } from "@/components/ui/table-scroll";
import { useClientTableSort } from "@/hooks/use-client-table-sort";
import { ProjectStatusBadge } from "./project-status-badge";
import type { ProjectListItem } from "@bloqer/services";
import type { ProjectType } from "@bloqer/database";

const TYPE_LABELS: Record<ProjectType, string> = {
  PUBLIC: "Público",
  PRIVATE: "Privado",
};

interface ProjectTableProps {
  projects: ProjectListItem[];
}

export function ProjectTable({ projects }: ProjectTableProps) {
  const accessors = useMemo(
    () => ({
      code: (p: ProjectListItem) => p.code ?? "",
      name: (p: ProjectListItem) => p.name,
      client: (p: ProjectListItem) => p.client.fantasyName ?? p.client.legalName,
      type: (p: ProjectListItem) => TYPE_LABELS[p.type],
      status: (p: ProjectListItem) => p.status,
    }),
    [],
  );

  const { sorted, sortKey, sortDir, toggleSort } = useClientTableSort(projects, accessors, "name");

  if (projects.length === 0) {
    return (
      <ListEmptyState
        title="Sin proyectos"
        description="No hay proyectos con los filtros aplicados, o todavía no creaste ninguno."
        action={
          <Button asChild size="sm">
            <Link href="/proyectos/nuevo">Crear proyecto</Link>
          </Button>
        }
      />
    );
  }

  return (
    <TableScroll>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <SortableTableHead
              className="w-[14%]"
              label="Código"
              sortKey="code"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortableTableHead
              className="w-[30%]"
              label="Nombre"
              sortKey="name"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortableTableHead
              className="w-[30%]"
              label="Cliente"
              sortKey="client"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortableTableHead
              className="w-[10%]"
              label="Tipo"
              sortKey="type"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortableTableHead
              className="w-[10%]"
              label="Estado"
              sortKey="status"
              activeKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <TableHead className="w-[6%]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((p) => {
            const href = `/proyectos/${p.id}`;
            const openLabel = `Abrir ${p.name}`;
            return (
              <TableRow key={p.id}>
                <TableCell className="p-0 font-mono text-sm">
                  <Link
                    href={href}
                    title={p.code || undefined}
                    aria-label={openLabel}
                    className="block truncate px-3 py-3 text-primary hover:underline"
                  >
                    {p.code || "—"}
                  </Link>
                </TableCell>
                <TableCell className="p-0 font-medium">
                  <Link
                    href={href}
                    title={p.name}
                    aria-label={openLabel}
                    className="block truncate px-3 py-3 hover:underline"
                  >
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell
                  className="truncate text-sm text-muted-foreground"
                  title={p.client.fantasyName ?? p.client.legalName}
                >
                  {p.client.fantasyName ?? p.client.legalName}
                </TableCell>
                <TableCell className="truncate text-sm text-muted-foreground">
                  {TYPE_LABELS[p.type]}
                </TableCell>
                <TableCell>
                  <ProjectStatusBadge status={p.status} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={href}>Ver</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
