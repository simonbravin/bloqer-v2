import type { DashboardOnboardingStep } from "./dashboard-empty-state";
import { DashboardEmptyState } from "./dashboard-empty-state";

/** Checklist de primeros pasos (tenant nuevo / sin datos operativos). */
export function DashboardOnboardingChecklist({ steps }: { steps: DashboardOnboardingStep[] }) {
  return <DashboardEmptyState steps={steps} />;
}
