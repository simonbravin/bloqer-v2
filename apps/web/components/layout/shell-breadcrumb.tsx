"use client";

import { Fragment, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  resolveAppShellBreadcrumbs,
  resolvePlatformShellBreadcrumbs,
  type ShellBreadcrumbItem,
} from "@/lib/shell-breadcrumb";
import { useBreadcrumbOverride } from "@/lib/breadcrumb-override-context";
import { useProjectShellName } from "@/lib/project-shell-context";
import { usePlatformNav } from "@/features/platform/platform-nav-context";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const MOBILE_MAX_VISIBLE = 3;
const MOBILE_MQ = "(max-width: 639px)";

function subscribeMobileBreadcrumb(onStoreChange: () => void) {
  const mq = window.matchMedia(MOBILE_MQ);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getMobileBreadcrumbSnapshot() {
  return window.matchMedia(MOBILE_MQ).matches;
}

function useIsMobileBreadcrumb(): boolean {
  return useSyncExternalStore(subscribeMobileBreadcrumb, getMobileBreadcrumbSnapshot, () => false);
}

type DisplayBreadcrumbItem = ShellBreadcrumbItem & { ellipsis?: boolean };

function collapseBreadcrumbItems(
  items: ShellBreadcrumbItem[],
  isMobile: boolean,
): DisplayBreadcrumbItem[] {
  if (!isMobile || items.length <= MOBILE_MAX_VISIBLE) return items;

  const tail = items.slice(-2);
  return [items[0]!, { label: "…", ellipsis: true }, ...tail];
}

function ShellBreadcrumbTrail({ items }: { items: ShellBreadcrumbItem[] }) {
  const isMobile = useIsMobileBreadcrumb();
  const displayItems = useMemo(
    () => collapseBreadcrumbItems(items, isMobile),
    [items, isMobile],
  );

  if (displayItems.length === 0) return null;

  if (displayItems.length === 1 && !displayItems[0]!.ellipsis) {
    const only = displayItems[0]!;
    return (
      <p className="truncate text-sm font-semibold tracking-tight text-foreground" title={only.label}>
        {only.label}
      </p>
    );
  }

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList>
        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;
          if (item.ellipsis) {
            return (
              <Fragment key="breadcrumb-ellipsis">
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbEllipsis />
                </BreadcrumbItem>
              </Fragment>
            );
          }

          return (
            <Fragment key={item.href ?? `crumb-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {isLast || !item.href ? (
                  <BreadcrumbPage title={item.label}>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={item.href} title={item.label}>
                    {item.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function AppShellBreadcrumb({ tenantName }: { tenantName: string }) {
  const pathname = usePathname();
  const { tailLabel, segmentLabels } = useBreadcrumbOverride();
  const projectName = useProjectShellName();

  const items = useMemo(
    () =>
      resolveAppShellBreadcrumbs(pathname, {
        tenantName,
        projectName,
        tailLabel,
        segmentLabels,
      }),
    [pathname, tenantName, projectName, tailLabel, segmentLabels],
  );

  return <ShellBreadcrumbTrail items={items} />;
}

export function PlatformShellBreadcrumb() {
  const pathname = usePathname();
  const { activeTenant } = usePlatformNav();
  const { tailLabel, segmentLabels } = useBreadcrumbOverride();
  const tenantName = activeTenant?.name ?? null;

  const items = useMemo(
    () =>
      resolvePlatformShellBreadcrumbs(pathname, {
        tenantName,
        tailLabel,
        segmentLabels,
      }),
    [pathname, tenantName, tailLabel, segmentLabels],
  );

  return <ShellBreadcrumbTrail items={items} />;
}
