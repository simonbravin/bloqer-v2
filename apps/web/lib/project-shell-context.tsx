"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { ProjectShellInfo } from "@bloqer/services";
import { extractProjectIdFromPath } from "@/lib/shell-breadcrumb";

type ProjectShellState =
  | { status: "idle" }
  | { status: "loading"; projectId: string }
  | { status: "error"; projectId: string; message: string }
  | { status: "ok"; projectId: string; shell: ProjectShellInfo };

type ProjectShellContextValue = {
  state: ProjectShellState;
};

const ProjectShellContext = createContext<ProjectShellContextValue>({
  state: { status: "idle" },
});

/** In-flight fetches keyed by project id — dedupes sidebar + breadcrumb requests. */
const inflight = new Map<string, Promise<ProjectShellInfo>>();
const cache = new Map<string, ProjectShellInfo>();

let cacheVersion = 0;
const cacheVersionListeners = new Set<() => void>();

function notifyCacheVersionChange() {
  cacheVersion += 1;
  cacheVersionListeners.forEach((listener) => listener());
}

function subscribeCacheVersion(onStoreChange: () => void) {
  cacheVersionListeners.add(onStoreChange);
  return () => cacheVersionListeners.delete(onStoreChange);
}

function getCacheVersionSnapshot() {
  return cacheVersion;
}

async function fetchProjectShell(projectId: string): Promise<ProjectShellInfo> {
  const cached = cache.get(projectId);
  if (cached) return cached;

  let pending = inflight.get(projectId);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(`/api/projects/${projectId}/shell`, { credentials: "same-origin" });
      const data = (await res.json()) as ProjectShellInfo | { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof data === "object" && data && "error" in data ? String(data.error) : "Error al cargar",
        );
      }
      cache.set(projectId, data as ProjectShellInfo);
      return data as ProjectShellInfo;
    })().finally(() => {
      inflight.delete(projectId);
    });
    inflight.set(projectId, pending);
  }

  return pending;
}

export function ProjectShellProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const projectId = useMemo(() => extractProjectIdFromPath(pathname), [pathname]);
  const cacheVersion = useSyncExternalStore(
    subscribeCacheVersion,
    getCacheVersionSnapshot,
    getCacheVersionSnapshot,
  );
  const [state, setState] = useState<ProjectShellState>({ status: "idle" });
  const requestId = useRef(0);

  useEffect(() => {
    if (!projectId) {
      setState({ status: "idle" });
      return;
    }

    const cached = cache.get(projectId);
    if (cached) {
      setState({ status: "ok", projectId, shell: cached });
      return;
    }

    const id = ++requestId.current;
    setState({ status: "loading", projectId });

    void fetchProjectShell(projectId)
      .then((shell) => {
        if (requestId.current !== id) return;
        setState({ status: "ok", projectId, shell });
      })
      .catch((err: unknown) => {
        if (requestId.current !== id) return;
        setState({
          status: "error",
          projectId,
          message: err instanceof Error ? err.message : "Error de red",
        });
      });
  }, [projectId, cacheVersion]);

  const value = useMemo(() => ({ state }), [state]);
  return <ProjectShellContext.Provider value={value}>{children}</ProjectShellContext.Provider>;
}

export function useProjectShell(): ProjectShellContextValue {
  return useContext(ProjectShellContext);
}

export function useProjectShellName(): string | null {
  const pathname = usePathname();
  const activeProjectId = useMemo(() => extractProjectIdFromPath(pathname), [pathname]);
  const { state } = useProjectShell();

  if (!activeProjectId) return null;
  if (state.status === "ok" && state.projectId === activeProjectId) return state.shell.name;
  return null;
}

/** Clears cached shell data and triggers a refetch in ProjectShellProvider. */
export function invalidateProjectShellCache(projectId?: string) {
  if (projectId) {
    cache.delete(projectId);
    inflight.delete(projectId);
  } else {
    cache.clear();
    inflight.clear();
  }
  notifyCacheVersionChange();
}
