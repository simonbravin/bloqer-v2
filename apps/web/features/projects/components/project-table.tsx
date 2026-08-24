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
import type { ProjectType } from "@bloqer/database";
import type { ProjectWithClient } from "@bloqer/services";

const TYPE_LABELS: Record<ProjectType, string> = {
  PUBLIC: "Público",
  PRIVATE: "Privado",
};

interface ProjectTableProps {
  projects: ProjectWithClient[];
}

export function ProjectTable({ projects }: ProjectTableProps) {
  const accessors = useMemo(
    () => ({
      code: (p: ProjectWithClient) => p.code ?? "",
      name: (p: ProjectWithClient) => p.name,
      client: (p: ProjectWithClient) => p.client.fantasyName ?? p.client.legalName,
      type: (p: ProjectWithClient) => TYPE_LABELS[p.type],
      status: (p: ProjectWithClient) => p.status,
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
          {sorted.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="truncate font-mono text-sm" title={p.code}>
                {p.code}
              </TableCell>
              <TableCell className="truncate font-medium" title={p.name}>
                {p.name}
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
                  <Link href={`/proyectos/${p.id}`}>Ver</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
