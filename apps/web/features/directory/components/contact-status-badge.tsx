import { Badge } from "@/components/ui/badge";

export function ContactStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "ACTIVE" ? "default" : "secondary"}>
      {status === "ACTIVE" ? "Activo" : "Archivado"}
    </Badge>
  );
}
