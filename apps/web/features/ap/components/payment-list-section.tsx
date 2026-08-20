"use client";

import type { PaymentListItem } from "./payment-list";
import { useListViewMode } from "@/components/ui/list-view-toggle";
import { PaymentCards } from "./payment-cards";
import { PaymentTable } from "./payment-table";

export function PaymentListSection({
  payments,
  hrefPrefix,
}: {
  payments: PaymentListItem[];
  hrefPrefix: string;
}) {
  const view = useListViewMode();
  if (view === "cards") return <PaymentCards payments={payments} hrefPrefix={hrefPrefix} />;
  return <PaymentTable payments={payments} hrefPrefix={hrefPrefix} />;
}
