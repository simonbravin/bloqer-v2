"use client";

import { Fragment, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  resolveAppShellBreadcrumbs,
  resolvePlatformShellBreadcrumbs,
  type ShellBreadcrumbItem,
} from "@/lib/shell-breadcrumb";
import { useBreadcrumbOverride } from "@/lib/breadcrumb-override-context";
import { useProjectShellName } from "@/lib/project-shell-context";
import { usePlatformNav } from "@/features/platform/platform-nav-context";
import { cn } from "@/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

function ShellBreadcrumbTrail({ items }: { items: ShellBreadcrumbItem[] }) {
  if (items.length === 0) return null;

  if (items.length === 1) {
    const only = items[0]!;
    return (
      <p className="truncate text-sm font-semibold tracking-tight text-foreground" title={only.label}>
        {only.label}
      </p>
    );
  }

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isParent = index === items.length - 2;

          return (
            <Fragment key={item.href ?? `crumb-${index}`}>
              {index > 0 ? (
                <BreadcrumbSeparator
                  className={cn("hidden shrink-0", isLast ? "min-[375px]:block" : "lg:block")}
                />
              ) : null}
              <BreadcrumbItem className={cn(
                "min-w-0 max-w-full",
                isLast && "min-[375px]:max-w-[60%] min-[375px]:shrink-0 lg:max-w-[18rem] lg:shrink",
                !isLast && (isParent ? "hidden min-[375px]:inline-flex" : "hidden lg:inline-flex"),
              )}>
                {isLast ? (
                  <BreadcrumbPage className="min-w-0 max-w-full" title={item.label}>{item.label}</BreadcrumbPage>
                ) : item.href ? (
                  <BreadcrumbLink className="min-w-0 max-w-full" href={item.href} title={item.label}>
                    {item.label}
                  </BreadcrumbLink>
                ) : (
                  <span className="min-w-0 truncate font-medium" title={item.label}>
                    {item.label}
                  </span>
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
