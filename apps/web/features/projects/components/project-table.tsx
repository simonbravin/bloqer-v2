import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
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
  if (projects.length === 0) {
    return <p className="text-sm text-muted-foreground">No se encontraron proyectos.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Código</TableHead>
          <TableHead>Nombre</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((p) => (
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
  );
}
