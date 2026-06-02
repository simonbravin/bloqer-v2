/** PO statuses that count toward committed cost (BR-PUR-001 / D-006). */
export const PO_COMMITTED_STATUSES = ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] as const;

/** PO statuses that allow creating/confirming receipts. */
export const PO_RECEIPT_ELIGIBLE_STATUSES = ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] as const;

/** PO statuses considered "open" for project cancellation guards. */
export const PO_OPEN_FOR_PROJECT_CANCEL_STATUSES = ["CONFIRMED", "PARTIALLY_RECEIVED"] as const;

export const PR_OPEN_FOR_PROJECT_CANCEL_STATUSES = ["SUBMITTED", "QUOTE_SELECTED"] as const;
