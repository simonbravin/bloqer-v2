"use client";

import {
  useState,
  useTransition,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
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
  ChevronsDown,
  ChevronsUp,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Upload,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatMoneyAmount } from "@/lib/format-money";
import { budgetUnitLabel } from "@/lib/budget-units";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { WbsNodeForm } from "./wbs-node-form";
import { WbsTreeToolbar } from "./wbs-tree-toolbar";
import { useBudgetWbsViewMode } from "../lib/wbs-view-mode";
import { CostItemApuDialog } from "./cost-item-apu-dialog";
import { WbsGroupDialog } from "./wbs-group-dialog";
import { WbsImportDialog, type WbsImportPreview } from "./wbs-import-dialog";
import {
  formatWbsIncidencePercent,
  wbsIncidencePercent,
  wbsTableColumnCount,
} from "@bloqer/domain";
import type { CostAnalysisLineView, WbsViewNode } from "@bloqer/services";
import {
  computeWbsRowMetrics,
  computeTreeGrandTotals,
  computeUnitCategoryCosts,
} from "@bloqer/services/wbs-metrics";
import type {
  BudgetImportRow,
  CreateWbsNodeInput,
  UpdateWbsNodeInput,
  ReorderWbsNodesInput,
  UpdateCostItemInput,
  CreateCostAnalysisLineInput,
  UpdateCostAnalysisLineInput,
  SaveCostItemApuInput,
  SubdivideApuChoice,
} from "@bloqer/validators";
import { Badge } from "@/components/ui/badge";
import { WBS_EDT_BREAKDOWN_HEADERS, VISIBLE_COST_CATEGORIES } from "@/lib/budget-categories";
import {
  addChildButtonTitle,
  resolveAddChildPreset,
  suggestChildCode,
  suggestRootGroupCode,
} from "../lib/wbs-codes";
import { isWbsStructuralLeaf, nodeHasApuData } from "../lib/wbs-apu";
import {
  apuCategoryShort,
  apuLineMatchesSearch,
  apuLinePartidaMoney,
  apuLineUnitContribution,
  apuResourceQtyDisplay,
  leafHasVisibleApu,
  visibleApuLines,
} from "../lib/wbs-apu-detail";
import { WbsSubdivideApuDialog } from "./wbs-subdivide-apu-dialog";
import type { WbsCreatePreset } from "./wbs-node-form";

function fmt(value: number, currency: string) {
  return formatMoneyAmount(String(value), currency);
}

/** Min width for the item name column (wider than before; scroll inside cell if longer). */
const WBS_ITEM_COL_CLASS =
  "min-w-[14rem] sm:min-w-[18rem] lg:min-w-[22rem] max-w-[32rem]";

type WbsRowActionsProps = {
  canAddChild: boolean;
  addChildTitle: string;
  isFirst: boolean;
  isLast: boolean;
  reorderPending: boolean;
  removePending: boolean;
  onAddChild: () => void;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
};

function WbsRowActions({
  canAddChild,
  addChildTitle,
  isFirst,
  isLast,
  reorderPending,
  removePending,
  onAddChild,
  onEdit,
  onMoveUp,
  onMoveDown,
  onRemove,
}: WbsRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Acciones del ítem"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {canAddChild ? (
          <DropdownMenuItem onSelect={onAddChild}>
            <Plus className="h-4 w-4" />
            {addChildTitle}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil className="h-4 w-4" />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isFirst || reorderPending}
          onSelect={onMoveUp}
        >
          <ArrowUp className="h-4 w-4" />
          Mover arriba
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isLast || reorderPending}
          onSelect={onMoveDown}
        >
          <ArrowDown className="h-4 w-4" />
          Mover abajo
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={removePending}
          onSelect={onRemove}
        >
          <Trash2 className="h-4 w-4" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function collectExpandableIds(ns: WbsViewNode[]): Set<string> {
  const ids = new Set<string>();
  function walk(nodes: WbsViewNode[]) {
    for (const n of nodes) {
      if (n.children.length > 0) {
        ids.add(n.id);
        walk(n.children);
      }
    }
  }
  walk(ns);
  return ids;
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

function nodeOrApuMatchesSearch(node: WbsViewNode, query: string): boolean {
  if (nodeMatchesSearch(node, query)) return true;
  const lines = node.costItem?.analysisLines;
  if (!lines?.length) return false;
  return lines.some((l) => apuLineMatchesSearch(l, query));
}

function collectMatchingIds(nodes: WbsViewNode[], query: string): Set<string> {
  const ids = new Set<string>();
  if (!query.trim()) return ids;

  function walk(ns: WbsViewNode[], ancestors: string[]): boolean {
    let subtreeMatch = false;
    for (const n of ns) {
      const selfMatch = nodeOrApuMatchesSearch(n, query);
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
  | {
      type: "add";
      parentId?: string;
      preset: WbsCreatePreset;
      suggestedCode: string;
      subdivideApu?: SubdivideApuChoice;
    }
  | { type: "edit"; node: WbsViewNode };

type SubdividePromptState = {
  parent: WbsViewNode;
  preset: WbsCreatePreset;
  suggestedCode: string;
} | null;

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
  onSaveApu: (data: SaveCostItemApuInput) => Promise<{ ok: true } | { error: string }>;
  onEnsureLeafForApu?: (nodeId: string) => Promise<{ node: WbsViewNode } | { error: string }>;
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
  onUpdateCostItem: _onUpdateCostItem,
  onAddLine: _onAddLine,
  onUpdateLine: _onUpdateLine,
  onRemoveLine: _onRemoveLine,
  onSaveApu,
  onEnsureLeafForApu,
}: WbsTreeProps) {
  const router = useRouter();
  const { viewMode, patchViewMode } = useBudgetWbsViewMode();

  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => collectExpandableIds(nodes));
  /** [D-059] Independent of GROUP expand — never reuse expandedIds for APU. */
  const [apuExpandedIds, setApuExpandedIds] = useState<Set<string>>(() => new Set());
  const [itemDialogNode, setItemDialogNode] = useState<WbsViewNode | null>(null);
  const [groupDialogNode, setGroupDialogNode] = useState<WbsViewNode | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>({ type: "closed" });
  const [subdividePrompt, setSubdividePrompt] = useState<SubdividePromptState>(null);
  const canEditStructure = structureEditable ?? editable;
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WbsViewNode | null>(null);
  const [removePending, startRemoveTransition] = useTransition();
  const [reorderPending, startReorderTransition] = useTransition();
  const [, startApuTransition] = useTransition();

  void _onUpdateCostItem;
  void _onAddLine;
  void _onUpdateLine;
  void _onRemoveLine;

  const flatNodes = useMemo(() => flattenTree(nodes), [nodes]);
  const expandableIds = useMemo(() => collectExpandableIds(nodes), [nodes]);
  const matchingIds = useMemo(() => collectMatchingIds(nodes, search), [nodes, search]);
  const tableColCount = wbsTableColumnCount(viewMode);
  const lastSearchExpandKey = useRef("");

  // Auto-expand matches only when the search string changes (not on every tree refresh).
  useEffect(() => {
    const key = search.trim().toLowerCase();
    if (!key) {
      lastSearchExpandKey.current = "";
      return;
    }
    if (key === lastSearchExpandKey.current) return;
    lastSearchExpandKey.current = key;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of matchingIds) {
        if (flatNodes.find((n) => n.id === id)?.type === "GROUP") next.add(id);
      }
      return next;
    });
    setApuExpandedIds((prev) => {
      const next = new Set(prev);
      for (const n of flatNodes) {
        if (!matchingIds.has(n.id) || !n.costItem?.analysisLines?.length) continue;
        if (n.costItem.analysisLines.some((l) => apuLineMatchesSearch(l, search))) {
          next.add(n.id);
        }
      }
      return next;
    });
  }, [search, matchingIds, flatNodes]);

  // Prune stale APU expands when tree shape / lines change (e.g. after subdivide).
  useEffect(() => {
    setApuExpandedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        const n = flatNodes.find((x) => x.id === id);
        if (
          n &&
          isWbsStructuralLeaf(n) &&
          leafHasVisibleApu(n.costItem?.analysisLines)
        ) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed || next.size !== prev.size ? next : prev;
    });
  }, [flatNodes]);

  const grandTotals = useMemo(() => computeTreeGrandTotals(nodes), [nodes]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleApuExpand = useCallback((id: string) => {
    setApuExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allExpanded = useMemo(() => {
    if (expandableIds.size === 0) return false;
    for (const id of expandableIds) {
      if (!expandedIds.has(id)) return false;
    }
    return true;
  }, [expandableIds, expandedIds]);

  const toggleExpandAll = useCallback(() => {
    setExpandedIds(allExpanded ? new Set() : new Set(expandableIds));
  }, [allExpanded, expandableIds]);

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
      setApuExpandedIds((prev) => {
        const next = new Set(prev);
        for (const id of removedIds) next.delete(id);
        return next;
      });
      toast.success(
        descendantCount > 0
          ? `Eliminados ${descendantCount + 1} nodos`
          : "Nodo eliminado",
      );
      router.refresh();
    });
  }

  function handleRowClick(node: WbsViewNode) {
    if (!isWbsStructuralLeaf(node)) {
      setGroupDialogNode(node);
      return;
    }
    if (node.costItem || !onEnsureLeafForApu) {
      setItemDialogNode(node);
      return;
    }
    startApuTransition(async () => {
      const result = await onEnsureLeafForApu(node.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setItemDialogNode(result.node);
      router.refresh();
    });
  }

  function beginAddChild(node: WbsViewNode) {
    const preset = resolveAddChildPreset(node);
    if (!preset) return;
    const suggestedCode = suggestChildCode(node, nodes);
    if (isWbsStructuralLeaf(node) && nodeHasApuData(node)) {
      setSubdividePrompt({ parent: node, preset, suggestedCode });
      return;
    }
    setDialogState({
      type: "add",
      parentId: node.id,
      preset,
      suggestedCode,
      subdivideApu: nodeHasApuData(node) ? "discard" : undefined,
    });
  }

  function openAddAfterSubdivide(choice: SubdivideApuChoice) {
    if (!subdividePrompt) return;
    const { parent, preset, suggestedCode } = subdividePrompt;
    setSubdividePrompt(null);
    setApuExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(parent.id);
      return next;
    });
    if (itemDialogNode?.id === parent.id) setItemDialogNode(null);
    setDialogState({
      type: "add",
      parentId: parent.id,
      preset,
      suggestedCode,
      subdivideApu: choice,
    });
  }

  function incidenceCell(
    metrics: ReturnType<typeof computeWbsRowMetrics>,
    opts?: { muted?: boolean; empty?: boolean },
  ): ReactNode {
    if (!viewMode.showIncidence) return null;
    if (opts?.empty) {
      return (
        <TableCell
          className={cn(
            "py-0.5 text-right font-mono text-xs w-20",
            opts.muted && "text-muted-foreground",
          )}
        >
          —
        </TableCell>
      );
    }
    const part =
      viewMode.base === "sale" ? metrics.totalSalePrice : metrics.totalCostDirect;
    const whole =
      viewMode.base === "sale" ? grandTotals.totalSalePrice : grandTotals.totalCostDirect;
    return (
      <TableCell
        className="py-0.5 text-right font-mono text-xs text-muted-foreground w-20"
        title={
          viewMode.base === "sale"
            ? "Incidencia sobre el total de venta"
            : "Incidencia sobre el costo directo total"
        }
      >
        {formatWbsIncidencePercent(wbsIncidencePercent(part, whole))}
      </TableCell>
    );
  }

  function renderApuMoneyCells(line: CostAnalysisLineView, itemQty: number): ReactNode {
    const unitContribution = apuLineUnitContribution(line);
    const partidaMoney = apuLinePartidaMoney(line, itemQty);
    const value = viewMode.scale === "unit" ? unitContribution : partidaMoney;

    if (viewMode.base === "sale") {
      return (
        <TableCell className="py-0.5 text-right font-mono text-xs text-muted-foreground w-32">
          —
        </TableCell>
      );
    }

    if (viewMode.detail === "breakdown") {
      return (
        <>
          {VISIBLE_COST_CATEGORIES.map((cat) => (
            <TableCell
              key={cat}
              className="py-0.5 text-right font-mono text-xs text-muted-foreground w-28"
            >
              {line.category === cat ? fmt(value, currency) : "—"}
            </TableCell>
          ))}
          <TableCell className="py-0.5 text-right font-mono text-xs text-muted-foreground w-28">
            {fmt(value, currency)}
          </TableCell>
        </>
      );
    }

    return (
      <TableCell className="py-0.5 text-right font-mono text-xs text-muted-foreground w-32">
        {fmt(value, currency)}
      </TableCell>
    );
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
      const showApuChevron =
        isWbsStructuralLeaf(node) && leafHasVisibleApu(node.costItem?.analysisLines);
      const apuExpanded = apuExpandedIds.has(node.id);

      rows.push(
        <TableRow
          key={node.id}
          className="cursor-pointer hover:bg-muted/40 h-8"
          onClick={() => handleRowClick(node)}
        >
          <TableCell className="py-0.5 px-1.5 font-mono text-xs text-muted-foreground w-0 whitespace-nowrap">
            <div className="flex items-center gap-0.5" style={{ paddingLeft: depth * 12 }}>
              {node.children.length > 0 ? (
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(node.id);
                  }}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? "Contraer capítulo" : "Expandir capítulo"}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : showApuChevron ? (
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  title="Ver composición APU (insumos)"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleApuExpand(node.id);
                  }}
                  aria-expanded={apuExpanded}
                  aria-label={apuExpanded ? "Ocultar composición APU" : "Ver composición APU"}
                >
                  {apuExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <span>{node.code}</span>
            </div>
          </TableCell>
          <TableCell className={cn("py-0.5 px-2 text-sm", WBS_ITEM_COL_CLASS)}>
            <div
              className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1"
              title={node.name}
            >
              <span className="block whitespace-nowrap pr-1">{node.name}</span>
            </div>
          </TableCell>
          <TableCell className="py-0.5 text-sm text-muted-foreground w-20">
            {metrics.unit ? budgetUnitLabel(metrics.unit) : "—"}
          </TableCell>
          <TableCell className="py-0.5 text-right font-mono text-sm w-24">
            {metrics.quantity != null ? metrics.quantity.toLocaleString("es-AR") : "—"}
          </TableCell>

          {(() => {
            const isLeaf = node.children.length === 0 && !!node.costItem;
            const unitCats = isLeaf ? computeUnitCategoryCosts(node) : null;
            const unitCd = isLeaf ? parseFloat(node.costItem!.unitCostDirect) || 0 : null;
            const unitSale = isLeaf ? parseFloat(node.costItem!.unitSalePrice) || 0 : null;

            if (viewMode.base === "sale") {
              const saleVal =
                viewMode.scale === "unit" ? unitSale : metrics.totalSalePrice;
              return (
                <TableCell className="py-0.5 text-right font-mono text-sm font-semibold w-32">
                  {viewMode.scale === "unit"
                    ? unitSale != null
                      ? fmt(unitSale, currency)
                      : "—"
                    : fmt(saleVal as number, currency)}
                </TableCell>
              );
            }

            if (viewMode.detail === "breakdown") {
              const cats =
                viewMode.scale === "unit" && unitCats
                  ? unitCats
                  : metrics.byCategory;
              const cd =
                viewMode.scale === "unit" ? unitCd : metrics.totalCostDirect;
              return (
                <>
                  <TableCell className="py-0.5 text-right font-mono text-xs w-28">
                    {viewMode.scale === "unit" && !unitCats ? "—" : fmt(cats.MATERIAL, currency)}
                  </TableCell>
                  <TableCell className="py-0.5 text-right font-mono text-xs w-28">
                    {viewMode.scale === "unit" && !unitCats ? "—" : fmt(cats.LABOR, currency)}
                  </TableCell>
                  <TableCell className="py-0.5 text-right font-mono text-xs w-28">
                    {viewMode.scale === "unit" && !unitCats ? "—" : fmt(cats.EQUIPMENT, currency)}
                  </TableCell>
                  <TableCell className="py-0.5 text-right font-mono text-xs w-28">
                    {viewMode.scale === "unit" && !unitCats ? "—" : fmt(cats.SUBCONTRACT, currency)}
                  </TableCell>
                  <TableCell className="py-0.5 text-right font-mono text-sm font-semibold w-28">
                    {cd != null ? fmt(cd, currency) : "—"}
                  </TableCell>
                </>
              );
            }

            const compact =
              viewMode.scale === "unit" ? unitCd : metrics.totalCostDirect;
            return (
              <TableCell className="py-0.5 text-right font-mono text-sm font-semibold w-32">
                {compact != null ? fmt(compact, currency) : "—"}
              </TableCell>
            );
          })()}

          {incidenceCell(metrics)}

          <TableCell className="py-0.5 w-10 px-0 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            {canEditStructure && (
              <div className="flex justify-end">
                <WbsRowActions
                  canAddChild={resolveAddChildPreset(node) !== null}
                  addChildTitle={addChildButtonTitle(node)}
                  isFirst={isFirst}
                  isLast={isLast}
                  reorderPending={reorderPending}
                  removePending={removePending}
                  onAddChild={() => beginAddChild(node)}
                  onEdit={() => setDialogState({ type: "edit", node })}
                  onMoveUp={() => moveNode(node, "up")}
                  onMoveDown={() => moveNode(node, "down")}
                  onRemove={() => handleRemove(node)}
                />
              </div>
            )}
          </TableCell>
        </TableRow>,
      );

      if (showApuChevron && apuExpanded && node.costItem) {
        const itemQty = parseFloat(node.costItem.quantity) || 0;
        const lines = visibleApuLines(node.costItem.analysisLines);
        for (const line of lines) {
          const qtyDisp = apuResourceQtyDisplay(line, itemQty);
          const searchHit =
            Boolean(search.trim()) && apuLineMatchesSearch(line, search);
          rows.push(
            <TableRow
              key={`${node.id}-apu-${line.id}`}
              className={cn(
                "h-7 cursor-pointer bg-muted/25 hover:bg-muted/40",
                searchHit && "bg-amber-500/10",
              )}
              onClick={() => setItemDialogNode(node)}
              aria-label={`Insumo APU: ${line.description}`}
            >
              <TableCell className="py-0.5 px-1.5 w-0 whitespace-nowrap">
                <div
                  className="flex items-center gap-1 pl-0.5"
                  style={{ paddingLeft: (depth + 1) * 12 + 14 }}
                >
                  <Badge
                    variant="secondary"
                    className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground"
                  >
                    APU·{apuCategoryShort(line.category)}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className={cn("py-0.5 px-2 text-xs text-muted-foreground", WBS_ITEM_COL_CLASS)}>
                <div
                  className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
                  title={line.description}
                >
                  <span className="block truncate pr-1">{line.description}</span>
                </div>
              </TableCell>
              <TableCell className="py-0.5 text-xs text-muted-foreground w-20">
                {line.unit ? budgetUnitLabel(line.unit) : "—"}
              </TableCell>
              <TableCell className="py-0.5 text-right font-mono text-xs text-muted-foreground w-24">
                {qtyDisp.kind === "lump"
                  ? "global"
                  : qtyDisp.qty.toLocaleString("es-AR", {
                      maximumFractionDigits: 4,
                    })}
              </TableCell>
              {renderApuMoneyCells(line, itemQty)}
              {incidenceCell(metrics, { empty: true, muted: true })}
              <TableCell className="py-0.5 w-10 px-0" />
            </TableRow>,
          );
        }
      }

      if (node.children.length > 0 && isExpanded) {
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
                  preset: "childItem",
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
        onPatchViewMode={patchViewMode}
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
                <TableHead className="w-0 px-1.5 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <span>Nº</span>
                    {expandableIds.size > 0 ? (
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={toggleExpandAll}
                        title={allExpanded ? "Contraer todo" : "Expandir todo"}
                        aria-label={allExpanded ? "Contraer todo" : "Expandir todo"}
                      >
                        {allExpanded ? (
                          <ChevronsUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronsDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : null}
                  </div>
                </TableHead>
                <TableHead className={WBS_ITEM_COL_CLASS}>Ítem</TableHead>
                <TableHead className="w-20">Unidad</TableHead>
                <TableHead className="text-right w-24">Cantidad</TableHead>
                {viewMode.base === "sale" ? (
                  <TableHead className="text-right whitespace-nowrap">
                    {viewMode.scale === "unit" ? "PU venta" : "Total venta"}
                  </TableHead>
                ) : viewMode.detail === "breakdown" ? (
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
                        {viewMode.scale === "unit"
                          ? `${WBS_EDT_BREAKDOWN_HEADERS[cat]} /u`
                          : WBS_EDT_BREAKDOWN_HEADERS[cat]}
                      </TableHead>
                    ))}
                    <TableHead className="text-right whitespace-nowrap">
                      {viewMode.scale === "unit" ? "CD unit." : "CD total"}
                    </TableHead>
                  </>
                ) : (
                  <TableHead className="text-right whitespace-nowrap">
                    {viewMode.scale === "unit" ? "CD unitario" : "Costo directo"}
                  </TableHead>
                )}
                {viewMode.showIncidence ? (
                  <TableHead
                    className="text-right whitespace-nowrap w-20"
                    title={
                      viewMode.base === "sale"
                        ? "% sobre el total de venta del presupuesto"
                        : "% sobre el costo directo total del presupuesto"
                    }
                  >
                    Incid.
                  </TableHead>
                ) : null}
                <TableHead className="w-10 px-0 text-right">
                  {canEditStructure ? <span className="sr-only">Acciones</span> : null}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {search.trim() && matchingIds.size === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={tableColCount}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Sin resultados para “{search.trim()}”
                  </TableCell>
                </TableRow>
              ) : (
                renderRows(nodes, 0)
              )}
              <TableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                <TableCell colSpan={4}>TOTAL GENERAL</TableCell>
                {viewMode.base === "sale" ? (
                  <TableCell className="text-right font-mono text-sm">
                    {viewMode.scale === "unit" ? "—" : fmt(grandTotals.totalSalePrice, currency)}
                  </TableCell>
                ) : viewMode.detail === "breakdown" ? (
                  <>
                    <TableCell className="text-right font-mono text-sm">
                      {viewMode.scale === "unit" ? "—" : fmt(grandTotals.byCategory.MATERIAL, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {viewMode.scale === "unit" ? "—" : fmt(grandTotals.byCategory.LABOR, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {viewMode.scale === "unit" ? "—" : fmt(grandTotals.byCategory.EQUIPMENT, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {viewMode.scale === "unit" ? "—" : fmt(grandTotals.byCategory.SUBCONTRACT, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {viewMode.scale === "unit" ? "—" : fmt(grandTotals.totalCostDirect, currency)}
                    </TableCell>
                  </>
                ) : (
                  <TableCell className="text-right font-mono text-sm">
                    {viewMode.scale === "unit" ? "—" : fmt(grandTotals.totalCostDirect, currency)}
                  </TableCell>
                )}
                {viewMode.showIncidence ? (
                  <TableCell className="text-right font-mono text-sm">
                    {formatWbsIncidencePercent(
                      wbsIncidencePercent(
                        viewMode.base === "sale"
                          ? grandTotals.totalSalePrice
                          : grandTotals.totalCostDirect,
                        viewMode.base === "sale"
                          ? grandTotals.totalSalePrice
                          : grandTotals.totalCostDirect,
                      ),
                    )}
                  </TableCell>
                ) : null}
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
        onSaveApu={onSaveApu}
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
                ? "Agregar tarea"
                : "Editar nodo"}
            </DialogTitle>
          </DialogHeader>
          {dialogState.type === "add" && (
            <WbsNodeForm
              mode="create"
              parentId={dialogState.parentId}
              preset={dialogState.preset}
              suggestedCode={dialogState.suggestedCode}
              subdivideApu={dialogState.subdivideApu}
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

      <WbsSubdivideApuDialog
        open={subdividePrompt !== null}
        onOpenChange={(open) => {
          if (!open) setSubdividePrompt(null);
        }}
        parentCode={subdividePrompt?.parent.code ?? ""}
        parentName={subdividePrompt?.parent.name ?? ""}
        childCode={subdividePrompt?.suggestedCode ?? ""}
        onMigrate={() => openAddAfterSubdivide("migrate")}
        onDiscard={() => openAddAfterSubdivide("discard")}
      />

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
