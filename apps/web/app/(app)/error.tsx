"use client";

import { PageErrorState } from "@/components/ui/page-error-state";

export default function AppErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageErrorState onRetry={reset} />;
}
