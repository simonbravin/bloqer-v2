import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";

export function ProjectFinanceListHeaderActions({
  listViewStorageKey,
  secondary,
  exportSlot,
  primary,
  primarySlot,
}: {
  listViewStorageKey: string;
  secondary?: { href: string; label: string };
  exportSlot?: ReactNode;
  primary?: { href: string; label: string };
  /** Prefer over `primary` when create opens in a dialog (empresa UX). */
  primarySlot?: ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <ListViewToggle storageKey={listViewStorageKey} />
      </Suspense>
      {exportSlot}
      {secondary ? (
        <Button asChild variant="outline" size="sm">
          <Link href={secondary.href}>{secondary.label}</Link>
        </Button>
      ) : null}
      {primarySlot ? (
        primarySlot
      ) : primary ? (
        <Button asChild size="sm">
          <Link href={primary.href}>{primary.label}</Link>
        </Button>
      ) : null}
    </>
  );
}
