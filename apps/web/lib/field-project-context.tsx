"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { extractProjectIdFromPath } from "@/lib/shell-breadcrumb";
import {
  readLastProjectIdFromDocument,
  subscribeLastProjectId,
  writeLastProjectIdCookie,
} from "@/lib/last-project-cookie";

type FieldProjectContextValue = {
  pathProjectId: string | null;
  lastProjectId: string | null;
  /** Convenience only — never authorization. Prefer path, else last visited (client). */
  convenienceProjectId: string | null;
};

const FieldProjectContext = createContext<FieldProjectContextValue>({
  pathProjectId: null,
  lastProjectId: null,
  convenienceProjectId: null,
});

export function FieldProjectProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pathProjectId = useMemo(() => extractProjectIdFromPath(pathname), [pathname]);
  const [lastProjectId, setLastProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (pathProjectId) {
      writeLastProjectIdCookie(pathProjectId);
      setLastProjectId(pathProjectId);
      return;
    }
    setLastProjectId(readLastProjectIdFromDocument());
    return subscribeLastProjectId(() => {
      setLastProjectId(readLastProjectIdFromDocument());
    });
  }, [pathProjectId]);

  const value = useMemo<FieldProjectContextValue>(
    () => ({
      pathProjectId,
      lastProjectId,
      convenienceProjectId: pathProjectId ?? lastProjectId,
    }),
    [pathProjectId, lastProjectId],
  );

  return <FieldProjectContext.Provider value={value}>{children}</FieldProjectContext.Provider>;
}

export function useFieldProjectContext(): FieldProjectContextValue {
  return useContext(FieldProjectContext);
}
