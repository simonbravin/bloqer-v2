"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useFieldProjectContext } from "@/lib/field-project-context";

const POLL_MS = 30_000;

type PendingInboxCountValue = {
  tenantCount: number;
  projectCount: number | null;
};

const PendingInboxCountContext = createContext<PendingInboxCountValue>({
  tenantCount: 0,
  projectCount: null,
});

function parsePendingTotal(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const total = (data as { total?: unknown }).total;
  if (typeof total !== "number" || !Number.isFinite(total)) return null;
  return Math.max(0, Math.trunc(total));
}

async function fetchPendingTotal(projectId?: string | null): Promise<number | null> {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const res = await fetch(`/api/pendientes/count${qs}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) return null;
  return parsePendingTotal(await res.json());
}

export function PendingInboxCountProvider({
  tenantInitial,
  children,
}: {
  tenantInitial: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { convenienceProjectId: projectId } = useFieldProjectContext();
  const [tenantCount, setTenantCount] = useState(tenantInitial);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    setTenantCount(tenantInitial);
  }, [tenantInitial]);

  useEffect(() => {
    setProjectCount(null);
  }, [projectId]);

  const refresh = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    try {
      const [tenant, project] = await Promise.all([
        fetchPendingTotal(),
        projectId ? fetchPendingTotal(projectId) : Promise.resolve(null),
      ]);
      if (!mountedRef.current || gen !== fetchGenRef.current) return;
      if (tenant != null) setTenantCount(tenant);
      setProjectCount(projectId ? project : null);
    } catch {
      /* best-effort poll — session expiry redirects to /login HTML */
    }
  }, [projectId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refresh();

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, POLL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      fetchGenRef.current += 1;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, pathname]);

  const value = useMemo(
    () => ({ tenantCount, projectCount }),
    [tenantCount, projectCount],
  );

  return (
    <PendingInboxCountContext.Provider value={value}>{children}</PendingInboxCountContext.Provider>
  );
}

export function usePendingInboxCount(): PendingInboxCountValue {
  return useContext(PendingInboxCountContext);
}
