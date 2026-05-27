import { Badge } from "@/components/ui/badge";
import type { AgingBucket } from "@bloqer/services";

const LABELS: Record<AgingBucket, string> = {
  current: "Al día",
  "1_30":  "1–30 días",
  "31_60": "31–60 días",
  "61_90": "61–90 días",
  "90_plus": "+90 días",
};

const CLASS: Record<AgingBucket, string> = {
  current:   "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-transparent",
  "1_30":    "bg-amber-500/15 text-amber-900 dark:text-amber-300 border-transparent",
  "31_60":   "bg-orange-500/15 text-orange-900 dark:text-orange-300 border-transparent",
  "61_90":   "bg-destructive/15 text-destructive border-transparent",
  "90_plus": "bg-destructive/25 text-destructive border-transparent",
};

export function AgingBucketBadge({ bucket }: { bucket: AgingBucket }) {
  return (
    <Badge className={CLASS[bucket]}>{LABELS[bucket]}</Badge>
  );
}
