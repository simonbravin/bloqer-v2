"use client";

import { BreadcrumbSegmentLabels, BreadcrumbTailLabel } from "@/lib/breadcrumb-override-context";

/** Sets the active page label on the shell breadcrumb trail (last UUID segment). */
export function ShellBreadcrumbLabel({ label }: { label: string }) {
  const trimmed = label.trim();
  if (!trimmed) return null;
  return <BreadcrumbTailLabel label={trimmed} />;
}

/** Labels for specific URL UUID segments (nested routes with multiple entity ids). */
export function ShellBreadcrumbSegmentLabels({ labels }: { labels: Record<string, string> }) {
  const filtered = Object.fromEntries(
    Object.entries(labels)
      .map(([id, label]) => [id, label.trim()] as const)
      .filter(([, label]) => label.length > 0),
  );
  if (Object.keys(filtered).length === 0) return null;
  return <BreadcrumbSegmentLabels labels={filtered} />;
}
