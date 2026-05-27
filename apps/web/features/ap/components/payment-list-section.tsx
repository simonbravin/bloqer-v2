"use client";

import { useSearchParams } from "next/navigation";
import type { PaymentListItem } from "./payment-list";
import { PaymentCards } from "./payment-cards";
import { PaymentTable } from "./payment-table";

export function PaymentListSection({
  payments,
  hrefPrefix,
}: {
  payments: PaymentListItem[];
  hrefPrefix: string;
}) {
  const view = useSearchParams().get("view") === "cards" ? "cards" : "table";
  if (view === "cards") return <PaymentCards payments={payments} hrefPrefix={hrefPrefix} />;
  return <PaymentTable payments={payments} hrefPrefix={hrefPrefix} />;
}
