import { Badge } from "@/components/ui/badge";
import type { JobsiteLogIssueType, JobsiteLogIssueSeverity, JobsiteLogIssueStatus } from "@bloqer/database";

const TYPE_LABELS: Record<JobsiteLogIssueType, string> = {
  INCIDENT: "Incidente",
  BLOCKER:  "Bloqueo",
  SAFETY:   "Seguridad",
  OTHER:    "Otro",
};

const SEVERITY_CONFIG: Record<JobsiteLogIssueSeverity, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  LOW:      { label: "Baja",     variant: "outline" },
  MEDIUM:   { label: "Media",    variant: "secondary" },
  HIGH:     { label: "Alta",     variant: "default" },
  CRITICAL: { label: "Crítica",  variant: "destructive" },
};

const STATUS_LABELS: Record<JobsiteLogIssueStatus, string> = {
  OPEN:      "Abierto",
  RESOLVED:  "Resuelto",
  ESCALATED: "Escalado",
};

export function JobsiteLogIssueSeverityBadge({ severity }: { severity: JobsiteLogIssueSeverity }) {
  const { label, variant } = SEVERITY_CONFIG[severity];
  return <Badge variant={variant}>{label}</Badge>;
}

export function JobsiteLogIssueTypeBadge({ type }: { type: JobsiteLogIssueType }) {
  return <Badge variant="outline">{TYPE_LABELS[type]}</Badge>;
}

export function JobsiteLogIssueStatusBadge({ status }: { status: JobsiteLogIssueStatus }) {
  return <span className="text-xs text-muted-foreground">{STATUS_LABELS[status]}</span>;
}
