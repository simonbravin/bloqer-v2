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

/** Filtered movimientos deep-link (e.g. from Transferencias → Ver en movimientos). */
export function isInternalTransferMovimientosHref(href: string): boolean {
  const params = hrefSearchParams(href);
  return (
    navHrefPathname(href) === "/tesoreria/movimientos" &&
    params?.get("sourceType") === "INTERNAL_TRANSFER"
  );
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
    return (
      pathname === "/tesoreria/movimientos" &&
      searchParams?.get("sourceType") === "INTERNAL_TRANSFER"
    );
  }

  if (matchExact) {
    return pathname === hrefPath;
  }

  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}
