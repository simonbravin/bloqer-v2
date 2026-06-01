/** Pathname portion of a nav href (without query string). */
export function navHrefPathname(href: string): string {
  const idx = href.indexOf("?");
  return idx === -1 ? href : href.slice(0, idx);
}

function hrefSearchParams(href: string): URLSearchParams | null {
  const idx = href.indexOf("?");
  if (idx === -1) return null;
  return new URLSearchParams(href.slice(idx + 1));
}

export function isInternalTransferMovimientosHref(href: string): boolean {
  const params = hrefSearchParams(href);
  return (
    navHrefPathname(href) === "/tesoreria/reportes/movimientos" &&
    params?.get("sourceType") === "INTERNAL_TRANSFER"
  );
}

function isInternalTransferMovimientosRoute(
  pathname: string,
  searchParams: { get(name: string): string | null } | null | undefined,
): boolean {
  return (
    pathname === "/tesoreria/reportes/movimientos" &&
    searchParams?.get("sourceType") === "INTERNAL_TRANSFER"
  );
}

/** Parent "Reportes" hub must not highlight when Transferencias owns the filtered movimientos view. */
function isTesoreriaReportesHubHref(href: string): boolean {
  return navHrefPathname(href) === "/tesoreria/reportes" && !href.includes("?");
}

export function isNavLinkActive(
  pathname: string,
  searchParams: { get(name: string): string | null } | null | undefined,
  href: string,
  options?: { matchExact?: boolean; activeWhenPathPrefix?: string },
): boolean {
  const { matchExact, activeWhenPathPrefix } = options ?? {};

  if (activeWhenPathPrefix) {
    if (pathname === activeWhenPathPrefix || pathname.startsWith(`${activeWhenPathPrefix}/`)) {
      return true;
    }
  }

  const hrefPath = navHrefPathname(href);

  if (isInternalTransferMovimientosHref(href)) {
    return isInternalTransferMovimientosRoute(pathname, searchParams);
  }

  if (matchExact) {
    return pathname === hrefPath;
  }

  if (isTesoreriaReportesHubHref(href) && isInternalTransferMovimientosRoute(pathname, searchParams)) {
    return false;
  }

  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}
