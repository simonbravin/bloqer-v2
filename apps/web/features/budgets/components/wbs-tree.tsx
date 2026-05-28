"use client";

import { useState, useTransition, useMemo, useCallback, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoneyAmount } from "@/lib/format-money";
import { budgetUnitLabel } from "@/lib/budget-units";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { WbsNodeForm } from "./wbs-node-form";
import { WbsTreeToolbar, type WbsViewMode } from "./wbs-tree-toolbar";
import { CostItemApuDialog } from "./cost-item-apu-dialog";
import { WbsGroupDialog } from "./wbs-group-dialog";
import { WbsImportDialog, type WbsImportPreview } from "./wbs-import-dialog";
import type { BudgetImportRow } from "@bloqer/validators";
import { computeWbsRowMetrics, computeTreeGrandTotals } from "../lib/wbs-metrics";
import {
  addChildButtonTitle,
  resolveAddChildPreset,
  suggestChildCode,
  suggestRootGroupCode,
} from "../lib/wbs-codes";
import { WBS_EDT_BREAKDOWN_HEADERS, VISIBLE_COST_CATEGORIES } from "@/lib/budget-categories";
import type { WbsCreatePreset } from "./wbs-node-form";
import type { WbsViewNode } from "@bloqer/services";
import type {
  CreateWbsNodeInput,
  UpdateWbsNodeInput,
  ReorderWbsNodesInput,
  UpdateCostItemInput,
  CreateCostAnalysisLineInput,
  UpdateCostAnalysisLineInput,
} from "@bloqer/validators";

function fmt(value: number, currency: string) {
  return formatMoneyAmount(String(value), currency);
}

function flattenTree(nodes: WbsViewNode[]): WbsViewNode[] {
  const result: WbsViewNode[] = [];
  function walk(ns: WbsViewNode[]) {
    for (const n of ns) {
      result.push(n);
      if (n.children.length) walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

function nodeMatchesSearch(node: WbsViewNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    node.code.toLowerCase().includes(q) ||
    node.name.toLowerCase().includes(q) ||
    (node.description?.toLowerCase().includes(q) ?? false)
  );
}

function collectMatchingIds(nodes: WbsViewNode[], query: string): Set<string> {
  const ids = new Set<string>();
  if (!query.trim()) return ids;

  function walk(ns: WbsViewNode[], ancestors: string[]): boolean {
    let subtreeMatch = false;
    for (const n of ns) {
      const selfMatch = nodeMatchesSearch(n, query);
      const childMatch = walk(n.children, [...ancestors, n.id]);
      if (selfMatch || childMatch) {
        ids.add(n.id);
        for (const a of ancestors) ids.add(a);
        subtreeMatch = true;
      }
    }
    return subtreeMatch;
  }

  walk(nodes, []);
  return ids;
}

type DialogState =
  | { type: "closed" }
  | { type: "add"; parentId?: string; preset: WbsCreatePreset; suggestedCode: string }
  | { type: "edit"; node: WbsViewNode };

interface WbsTreeProps {
  nodes: WbsViewNode[];
  budgetId: string;
  projectId: string;
  currency: string;
  editable: boolean;
  /** Agregar / borrar / importar / reordenar WBS. Por defecto igual que `editable`. */
  structureEditable?: boolean;
  structureLockedReason?: string;
  onPreviewWbsImport?: (rawRows: unknown[][]) => Promise<WbsImportPreview | { error: string }>;
  onExecuteWbsImport?: (
    rows: BudgetImportRow[],
    options: { replaceExisting: boolean },
  ) => Promise<{ createdNodes: number; createdItems: number } | { error: string }>;
  onAddNode: (data: CreateWbsNodeInput) => Promise<{ id: string } | { error: string }>;
  onUpdateNode: (nodeId: string, data: UpdateWbsNodeInput) => Promise<{ ok: true } | { error: string }>;
  onRemoveNode: (nodeId: string) => Promise<{ ok: true } | { error: string }>;
  onReorderNodes: (data: ReorderWbsNodesInput) => Promise<{ ok: true } | { error: string }>;
  onUpdateCostItem: (costItemId: string, data: UpdateCostItemInput) => Promise<{ ok: true } | { error: string }>;
  onAddLine: (data: CreateCostAnalysisLineInput) => Promise<{ id: string } | { error: string }>;
  onUpdateLine: (lineId: string, data: UpdateCostAnalysisLineInput) => Promise<{ ok: true } | { error: string }>;
  onRemoveLine: (lineId: string) => Promise<{ ok: true } | { error: string }>;
}

export function WbsTree({
  nodes,
  budgetId,
  projectId: _projectId,
  currency,
  editable,
  structureEditable,
  structureLockedReason,
  onPreviewWbsImport,
  onExecuteWbsImport,
  onAddNode,
  onUpdateNode,
  onRemoveNode,
  onReorderNodes,
  onUpdateCostItem,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
}: WbsTreeProps) {
  const router = useRouter();
  const storageKey = `wbs-view-mode-${budgetId}`;

  const [viewMode, setViewMode] = useState<WbsViewMode>("breakdown");
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    function collectGroups(ns: WbsViewNode[]) {
      for (const n of ns) {
        if (n.type === "GROUP") {
          ids.add(n.id);
          collectGroups(n.children);
        }
      }
    }
    collectGroups(nodes);
    return ids;
  });
  const [itemDialogNode, setItemDialogNode] = useState<WbsViewNode | null>(null);
  const [groupDialogNode, setGroupDialogNode] = useState<WbsViewNode | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>({ type: "closed" });
  const canEditStructure = structureEditable ?? editable;
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WbsViewNode | null>(null);
  const [removePending, startRemoveTransition] = useTransition();
  const [reorderPending, startReorderTransition] = useTransition();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(storageKey);
    if (stored === "breakdown" || stored === "totals") setViewMode(stored);
  }, [storageKey]);

  const handleViewModeChange = (mode: WbsViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") sessionStorage.setItem(storageKey, mode);
  };

  const flatNodes = useMemo(() => flattenTree(nodes), [nodes]);
  const matchingIds = useMemo(() => collectMatchingIds(nodes, search), [nodes, search]);

  useEffect(() => {
    if (!search.trim()) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of matchingIds) {
        if (flatNodes.find((n) => n.id === id)?.type === "GROUP") next.add(id);
      }
      return next;
    });
  }, [search, matchingIds, flatNodes]);

  const grandTotals = useMemo(() => computeTreeGrandTotals(nodes), [nodes]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function getSiblings(node: WbsViewNode): WbsViewNode[] {
    return flatNodes
      .filter((n) => n.parentId === node.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function moveNode(node: WbsViewNode, direction: "up" | "down") {
    const siblings = getSiblings(node);
    const idx = siblings.findIndex((s) => s.id === node.id);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === siblings.length - 1) return;

    const next = [...siblings];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];

    startReorderTransition(async () => {
      const result = await onReorderNodes({
        parentId: node.parentId ?? null,
        orderedNodeIds: next.map((s) => s.id),
      });
      if (!("error" in result)) router.refresh();
    });
  }

  function countDescendants(n: WbsViewNode): number {
    return n.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
  }

  function collectSubtreeIds(n: WbsViewNode): string[] {
    return [n.id, ...n.children.flatMap(collectSubtreeIds)];
  }

  function handleRemove(node: WbsViewNode) {
    setDeleteTarget(node);
  }

  function confirmRemove() {
    const node = deleteTarget;
    if (!node) return;

    const descendantCount = countDescendants(node);
    const removedIds = new Set(collectSubtreeIds(node));

    startRemoveTransition(async () => {
      const result = await onRemoveNode(node.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setDeleteTarget(null);
      if (itemDialogNode && removedIds.has(itemDialogNode.id)) setItemDialogNode(null);
      if (groupDialogNode && removedIds.has(groupDialogNode.id)) setGroupDialogNode(null);
      toast.success(
        descendantCount > 0
          ? `Eliminados ${descendantCount + 1} nodos`
          : "Nodo eliminado",
      );
      router.refresh();
    });
  }

  function handleRowClick(node: WbsViewNode) {
    if (node.type === "ITEM") setItemDialogNode(node);
    else setGroupDialogNode(node);
  }

  function renderRows(nodeList: WbsViewNode[], depth: number): ReactNode[] {
    const rows: ReactNode[] = [];

    for (const node of nodeList) {
      if (search.trim() && !matchingIds.has(node.id)) continue;

      const isExpanded = expandedIds.has(node.id);
      const metrics = computeWbsRowMetrics(node);
      const siblings = getSiblings(node);
      const idx = siblings.findIndex((s) => s.id === node.id);
      const isFirst = idx === 0;
      const isLast = idx === siblings.length - 1;

      rows.push(
        <TableRow
          key={node.id}
          className="cursor-pointer hover:bg-muted/40 h-9"
          onClick={() => handleRowClick(node)}
        >
          <TableCell className="py-1.5 font-mono text-xs text-muted-foreground w-24">
            <div className="flex items-center gap-1" style={{ paddingLeft: depth * 16 }}>
              {node.type === "GROUP" ? (
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(node.id);
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <span className="truncate">{node.code}</span>
            </div>
          </TableCell>
          <TableCell className="py-1.5 min-w-[12rem] text-sm font-medium">{node.name}</TableCell>
          <TableCell className="py-1.5 text-sm text-muted-foreground w-20">
            {metrics.unit ? budgetUnitLabel(metrics.unit) : "—"}
          </TableCell>
          <TableCell className="py-1.5 text-right font-mono text-sm w-24">
            {metrics.quantity != null ? metrics.quantity.toLocaleString("es-AR") : "—"}
          </TableCell>

          {viewMode === "breakdown" ? (
            <>
              <TableCell className="py-1.5 text-right font-mono text-xs w-28">
                {fmt(metrics.byCategory.MATERIAL, currency)}
              </TableCell>
              <TableCell className="py-1.5 text-right font-mono text-xs w-28">
                {fmt(metrics.byCategory.LABOR, currency)}
              </TableCell>
              <TableCell className="py-1.5 text-right font-mono text-xs w-28">
                {fmt(metrics.byCategory.EQUIPMENT, currency)}
              </TableCell>
              <TableCell className="py-1.5 text-right font-mono text-xs w-28">
                {fmt(metrics.byCategory.SUBCONTRACT, currency)}
              </TableCell>
              <TableCell className="py-1.5 text-right font-mono text-sm font-semibold w-28">
                {fmt(metrics.totalSalePrice, currency)}
              </TableCell>
            </>
          ) : (
            <>
              <TableCell className="py-1.5 text-right font-mono text-sm w-32">
                {fmt(metrics.totalCostDirect, currency)}
              </TableCell>
              <TableCell className="py-1.5 text-right font-mono text-sm font-semibold w-32">
                {fmt(metrics.totalSalePrice, currency)}
              </TableCell>
            </>
          )}

          <TableCell className="py-1.5 w-32" onClick={(e) => e.stopPropagation()}>
            {canEditStructure && (
              <div className="flex items-center justify-end gap-0.5">
                {resolveAddChildPreset(node) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={addChildButtonTitle(node)}
                    onClick={() => {
                      const preset = resolveAddChildPreset(node);
                      if (!preset) return;
                      setDialogState({
                        type: "add",
                        parentId: node.id,
                        preset,
                        suggestedCode: suggestChildCode(node, nodes),
                      });
                    }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Editar"
                  onClick={() => setDialogState({ type: "edit", node })}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={isFirst || reorderPending}
                  onClick={() => moveNode(node, "up")}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={isLast || reorderPending}
                  onClick={() => moveNode(node, "down")}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  disabled={removePending}
                  onClick={() => handleRemove(node)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </TableCell>
        </TableRow>,
      );

      if (node.type === "GROUP" && isExpanded) {
        rows.push(...renderRows(node.children, depth + 1));
      }
    }

    return rows;
  }

  return (
    <div className="w-full rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <h3 className="text-sm font-semibold">Estructura de trabajo (EDT)</h3>
        {canEditStructure && (
          <div className="flex flex-wrap gap-2">
            {onPreviewWbsImport && onExecuteWbsImport && (
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-3 w-3 mr-1" /> Importar WBS
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDialogState({
                  type: "add",
                  parentId: undefined,
                  preset: "rootGroup",
                  suggestedCode: suggestRootGroupCode(nodes),
                })
              }
            >
              <Plus className="h-3 w-3 mr-1" /> Agregar tarea
            </Button>
          </div>
        )}
      </div>

      <WbsTreeToolbar
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        search={search}
        onSearchChange={setSearch}
      />

      {structureLockedReason && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-muted-foreground">
          {structureLockedReason}
        </div>
      )}

      {nodes.length === 0 ? (
        <ListEmptyState
          message="Sin nodos en la EDT. Agregá la primera tarea o ítem."
          className="border-0 shadow-none rounded-none"
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Nº</TableHead>
                <TableHead>Ítem</TableHead>
                <TableHead className="w-20">Unidad</TableHead>
                <TableHead className="text-right w-24">Cantidad</TableHead>
                {viewMode === "breakdown" ? (
                  <>
                    {VISIBLE_COST_CATEGORIES.map((cat) => (
                      <TableHead
                        key={cat}
                        className={cn(
                          "text-right whitespace-nowrap",
                          cat === "LABOR" && "min-w-[7.5rem]",
                        )}
                        title={WBS_EDT_BREAKDOWN_HEADERS[cat]}
                      >
                        {WBS_EDT_BREAKDOWN_HEADERS[cat]}
                      </TableHead>
                    ))}
                    <TableHead className="text-right whitespace-nowrap">Total venta</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="text-right">Costo directo</TableHead>
                    <TableHead className="text-right">Total venta</TableHead>
                  </>
                )}
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {renderRows(nodes, 0)}
              <TableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                <TableCell colSpan={4}>TOTAL GENERAL</TableCell>
                {viewMode === "breakdown" ? (
                  <>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(grandTotals.byCategory.MATERIAL, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(grandTotals.byCategory.LABOR, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(grandTotals.byCategory.EQUIPMENT, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(grandTotals.byCategory.SUBCONTRACT, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(grandTotals.totalSalePrice, currency)}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(grandTotals.totalCostDirect, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(grandTotals.totalSalePrice, currency)}
                    </TableCell>
                  </>
                )}
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      <CostItemApuDialog
        open={itemDialogNode !== null}
        onOpenChange={(open) => { if (!open) setItemDialogNode(null); }}
        node={itemDialogNode}
        currency={currency}
        editable={editable}
        onUpdateCostItem={onUpdateCostItem}
        onAddLine={onAddLine}
        onUpdateLine={onUpdateLine}
        onRemoveLine={onRemoveLine}
      />

      <WbsGroupDialog
        open={groupDialogNode !== null}
        onOpenChange={(open) => { if (!open) setGroupDialogNode(null); }}
        node={groupDialogNode}
        currency={currency}
        editable={editable}
        onUpdateNode={onUpdateNode}
      />

      <Dialog
        open={dialogState.type !== "closed"}
        onOpenChange={(open) => { if (!open) setDialogState({ type: "closed" }); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState.type === "add"
                ? dialogState.preset === "childItem"
                  ? "Agregar ítem"
                  : dialogState.preset === "childGroup"
                    ? "Agregar subcapítulo"
                    : "Agregar capítulo"
                : "Editar nodo"}
            </DialogTitle>
          </DialogHeader>
          {dialogState.type === "add" && (
            <WbsNodeForm
              mode="create"
              parentId={dialogState.parentId}
              preset={dialogState.preset}
              suggestedCode={dialogState.suggestedCode}
              onSubmit={async (data) => {
                const result = await onAddNode(data);
                if (!("error" in result)) router.refresh();
                return result;
              }}
              onDone={() => setDialogState({ type: "closed" })}
            />
          )}
          {dialogState.type === "edit" && (
            <WbsNodeForm
              mode="edit"
              defaults={{
                code: dialogState.node.code,
                name: dialogState.node.name,
                description: dialogState.node.description,
              }}
              onSubmit={async (data) => {
                const result = await onUpdateNode(dialogState.node.id, data);
                if (!("error" in result)) router.refresh();
                return result;
              }}
              onDone={() => setDialogState({ type: "closed" })}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !removePending) setDeleteTarget(null);
        }}
        title="Eliminar nodo WBS"
        description={
          deleteTarget ? (
            <>
              <p>
                {countDescendants(deleteTarget) > 0 ? (
                  <>
                    Vas a eliminar{" "}
                    <span className="font-medium text-foreground">
                      {deleteTarget.code} — {deleteTarget.name}
                    </span>{" "}
                    y sus{" "}
                    <span className="font-medium text-foreground">
                      {countDescendants(deleteTarget)} subnodo(s)
                    </span>
                    .
                  </>
                ) : (
                  <>
                    Vas a eliminar{" "}
                    <span className="font-medium text-foreground">
                      {deleteTarget.code} — {deleteTarget.name}
                    </span>
                    .
                  </>
                )}
              </p>
              <p>Esta acción no se puede deshacer.</p>
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        variant="destructive"
        pending={removePending}
        onConfirm={confirmRemove}
      />

      {onPreviewWbsImport && onExecuteWbsImport && (
        <WbsImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          hasExistingNodes={nodes.length > 0}
          onPreview={onPreviewWbsImport}
          onExecute={onExecuteWbsImport}
        />
      )}
    </div>
  );
}
