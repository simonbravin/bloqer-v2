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
    return <ListEmptyState message="No se encontraron proyectos con los filtros aplicados." />;
  }

  return (
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead label="Código" sortKey="code" activeKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableTableHead label="Nombre" sortKey="name" activeKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableTableHead label="Cliente" sortKey="client" activeKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableTableHead label="Tipo" sortKey="type" activeKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortableTableHead label="Estado" sortKey="status" activeKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-sm">{p.code}</TableCell>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {p.client.fantasyName ?? p.client.legalName}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{TYPE_LABELS[p.type]}</TableCell>
              <TableCell><ProjectStatusBadge status={p.status} /></TableCell>
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
