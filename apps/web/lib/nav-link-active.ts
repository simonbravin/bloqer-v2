/** Pathname portion of a nav href (without query string). */
export function navHrefPathname(href: string): string {
  const idx = href.indexOf("?");
  return idx === -1 ? href : href.slice(0, idx);
}

export function isNavLinkActive(
  pathname: string,
  _searchParams: { get(name: string): string | null } | null | undefined,
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

  // Account detail (extracto) keeps Cuentas active in the Tesorería subnav.
  if (hrefPath === "/tesoreria/cuentas" && pathname.startsWith("/tesoreria/cuentas/")) {
    return true;
  }

  // Transfer form/historial keep Cuentas active (entry point lives under Cuentas).
  if (
    hrefPath === "/tesoreria/cuentas" &&
    (pathname === "/tesoreria/transferencias" || pathname.startsWith("/tesoreria/transferencias/"))
  ) {
    return true;
  }

  if (matchExact) {
    return pathname === hrefPath;
  }

  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}
