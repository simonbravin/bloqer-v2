"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type PlatformActiveTenant = {
  id: string;
  name: string;
};

type PlatformNavContextValue = {
  activeTenant: PlatformActiveTenant | null;
  setActiveTenant: (tenant: PlatformActiveTenant | null) => void;
};

const PlatformNavContext = createContext<PlatformNavContextValue | null>(null);

export function PlatformNavProvider({ children }: { children: ReactNode }) {
  const [activeTenant, setActiveTenant] = useState<PlatformActiveTenant | null>(null);
  const value = useMemo(
    () => ({ activeTenant, setActiveTenant }),
    [activeTenant],
  );
  return <PlatformNavContext.Provider value={value}>{children}</PlatformNavContext.Provider>;
}

export function usePlatformNav() {
  const ctx = useContext(PlatformNavContext);
  if (!ctx) {
    throw new Error("usePlatformNav must be used within PlatformNavProvider");
  }
  return ctx;
}

/** Syncs active tenant into platform sidebar when viewing a tenant detail route. */
export function PlatformTenantNavBridge({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const { setActiveTenant } = usePlatformNav();

  useEffect(() => {
    setActiveTenant({ id: tenantId, name: tenantName });
    return () => setActiveTenant(null);
  }, [tenantId, tenantName, setActiveTenant]);

  return null;
}
