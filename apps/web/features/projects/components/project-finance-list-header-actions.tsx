import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";

export function ProjectFinanceListHeaderActions({
  listViewStorageKey,
  secondary,
  primary,
}: {
  listViewStorageKey: string;
  secondary?: { href: string; label: string };
  primary?: { href: string; label: string };
}) {
  return (
    <>
      <Suspense fallback={null}>
        <ListViewToggle storageKey={listViewStorageKey} />
      </Suspense>
      {secondary ? (
        <Button asChild variant="outline" size="sm">
          <Link href={secondary.href}>{secondary.label}</Link>
        </Button>
      ) : null}
      {primary ? (
        <Button asChild size="sm">
          <Link href={primary.href}>{primary.label}</Link>
        </Button>
      ) : null}
    </>
  );
}
