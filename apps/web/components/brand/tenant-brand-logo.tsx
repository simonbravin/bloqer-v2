"use client";

import { useEffect, useState } from "react";
import { BloqerLogo } from "@/components/brand/bloqer-logo";
import { cn } from "@/lib/utils";

/** Intrinsic size of `public/bloqer-logo.png` (cropped horizontal mark). */
const LOGO_WIDTH = 670;
const LOGO_HEIGHT = 225;

function tenantLogoSrc(version: string | null | undefined): string {
  return version ? `/api/tenant/logo?v=${encodeURIComponent(version)}` : "/api/tenant/logo";
}

/**
 * Sidebar brand mark: tenant logo when configured, otherwise Bloqer product logo ([D-071]).
 */
export function TenantBrandLogo({
  hasTenantLogo,
  logoVersion = null,
  className,
  priority = false,
}: {
  hasTenantLogo: boolean;
  /** Cache-buster so replace/upload refreshes the browser image in production. */
  logoVersion?: string | null;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [hasTenantLogo, logoVersion]);

  if (!hasTenantLogo || failed) {
    return <BloqerLogo priority={priority} className={className} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- authenticated API stream; not a static asset
    <img
      src={tenantLogoSrc(logoVersion)}
      alt="Logo de la empresa"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      className={cn("h-10 w-auto max-w-full object-contain object-left", className)}
      onError={() => setFailed(true)}
    />
  );
}
