"use client";

import * as React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type BreadcrumbOverrideContextValue = {
  tailLabel: string | null;
  segmentLabels: Readonly<Record<string, string>>;
  setTailLabel: (ownerId: symbol, label: string | null) => void;
  setSegmentLabels: (ownerId: symbol, labels: Record<string, string> | null) => void;
};

const BreadcrumbOverrideContext = createContext<BreadcrumbOverrideContextValue | null>(null);

function mergeSegmentLabelMaps(
  owners: Map<symbol, Record<string, string>>,
): Readonly<Record<string, string>> {
  const merged: Record<string, string> = {};
  for (const labels of owners.values()) {
    for (const [segmentId, label] of Object.entries(labels)) {
      const trimmed = label.trim();
      if (trimmed) merged[segmentId] = trimmed;
    }
  }
  return merged;
}

export function BreadcrumbOverrideProvider({ children }: { children: ReactNode }) {
  const tailOwnersRef = useRef(new Map<symbol, string>());
  const segmentOwnersRef = useRef(new Map<symbol, Record<string, string>>());
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const setTailLabel = useCallback(
    (ownerId: symbol, label: string | null) => {
      if (label?.trim()) {
        tailOwnersRef.current.set(ownerId, label.trim());
      } else {
        tailOwnersRef.current.delete(ownerId);
      }
      bump();
    },
    [bump],
  );

  const setSegmentLabels = useCallback(
    (ownerId: symbol, labels: Record<string, string> | null) => {
      if (labels && Object.keys(labels).length > 0) {
        segmentOwnersRef.current.set(ownerId, labels);
      } else {
        segmentOwnersRef.current.delete(ownerId);
      }
      bump();
    },
    [bump],
  );

  const tailLabel = useMemo(() => {
    void version;
    const values = [...tailOwnersRef.current.values()];
    return values.at(-1) ?? null;
  }, [version]);

  const segmentLabels = useMemo(() => {
    void version;
    return mergeSegmentLabelMaps(segmentOwnersRef.current);
  }, [version]);

  const value = useMemo(
    () => ({ tailLabel, segmentLabels, setTailLabel, setSegmentLabels }),
    [tailLabel, segmentLabels, setTailLabel, setSegmentLabels],
  );

  return (
    <BreadcrumbOverrideContext.Provider value={value}>{children}</BreadcrumbOverrideContext.Provider>
  );
}

export function useBreadcrumbOverride(): BreadcrumbOverrideContextValue {
  const ctx = useContext(BreadcrumbOverrideContext);
  if (!ctx) {
    return {
      tailLabel: null,
      segmentLabels: {},
      setTailLabel: () => {},
      setSegmentLabels: () => {},
    };
  }
  return ctx;
}

/** Sets the last breadcrumb segment label (e.g. entity code or name). Clears on unmount. */
export function BreadcrumbTailLabel({ label }: { label: string }) {
  const { setTailLabel } = useBreadcrumbOverride();
  const ownerId = useRef(Symbol("breadcrumb-tail"));

  React.useEffect(() => {
    setTailLabel(ownerId.current, label);
    return () => setTailLabel(ownerId.current, null);
  }, [label, setTailLabel]);

  return null;
}

/** Labels for specific URL UUID segments (nested entity trails). Clears on unmount. */
export function BreadcrumbSegmentLabels({ labels }: { labels: Record<string, string> }) {
  const { setSegmentLabels } = useBreadcrumbOverride();
  const ownerId = useRef(Symbol("breadcrumb-segments"));

  React.useEffect(() => {
    setSegmentLabels(ownerId.current, labels);
    return () => setSegmentLabels(ownerId.current, null);
  }, [labels, setSegmentLabels]);

  return null;
}
