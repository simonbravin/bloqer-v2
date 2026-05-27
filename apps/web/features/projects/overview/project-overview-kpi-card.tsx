import { KpiPanelCard } from "@/components/ui/kpi-panel-card";

/** @deprecated Use KpiPanelCard directly. Kept for gradual migration. */
export function ProjectOverviewKpiCard({
  title,
  description: _description,
  children,
  href,
  footerLabel,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  href?: string;
  footerLabel?: string;
  className?: string;
}) {
  return (
    <KpiPanelCard label={title} href={href} footerLabel={footerLabel} className={className}>
      {children}
    </KpiPanelCard>
  );
}
