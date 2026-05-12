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
  current:   "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent",
  "1_30":    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-transparent",
  "31_60":   "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-transparent",
  "61_90":   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-transparent",
  "90_plus": "bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300 border-transparent",
};

export function AgingBucketBadge({ bucket }: { bucket: AgingBucket }) {
  return (
    <Badge className={CLASS[bucket]}>{LABELS[bucket]}</Badge>
  );
}
