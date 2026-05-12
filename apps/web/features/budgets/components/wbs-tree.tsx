"use client";

import { useState, useTransition, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { WbsNodeForm } from "./wbs-node-form";
import { CostItemPanel } from "./cost-item-panel";
import type { WbsViewNode, CostItemView } from "@bloqer/services";
import type {
  CreateWbsNodeInput, UpdateWbsNodeInput, ReorderWbsNodesInput,
  UpdateCostItemInput, CreateCostAnalysisLineInput, UpdateCostAnalysisLineInput,
} from "@bloqer/validators";

function fmt(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parseFloat(value),
    ) +
    " " +
    currency
  );
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

type DialogState =
  | { type: "closed" }
  | { type: "add"; parentId?: string }
  | { type: "edit"; node: WbsViewNode };

interface WbsTreeProps {
  nodes: WbsViewNode[];
  budgetId: string;
  currency: string;
  editable: boolean;
  onAddNode: (budgetId: string, data: CreateWbsNodeInput) => Promise<{ id: string } | { error: string }>;
  onUpdateNode: (nodeId: string, data: UpdateWbsNodeInput) => Promise<{ ok: true } | { error: string }>;
  onRemoveNode: (nodeId: string) => Promise<{ ok: true } | { error: string }>;
  onReorderNodes: (budgetId: string, data: ReorderWbsNodesInput) => Promise<{ ok: true } | { error: string }>;
  onUpdateCostItem: (costItemId: string, data: UpdateCostItemInput) => Promise<{ ok: true } | { error: string }>;
  onAddLine: (data: CreateCostAnalysisLineInput) => Promise<{ id: string } | { error: string }>;
  onUpdateLine: (lineId: string, data: UpdateCostAnalysisLineInput) => Promise<{ ok: true } | { error: string }>;
  onRemoveLine: (lineId: string) => Promise<{ ok: true } | { error: string }>;
}

export function WbsTree({
  nodes, budgetId, currency, editable,
  onAddNode, onUpdateNode, onRemoveNode, onReorderNodes,
  onUpdateCostItem, onAddLine, onUpdateLine, onRemoveLine,
}: WbsTreeProps) {
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>({ type: "closed" });
  const [removePending, startRemoveTransition] = useTransition();
  const [reorderPending, startReorderTransition] = useTransition();

  const flatNodes = useMemo(() => flattenTree(nodes), [nodes]);

  const selectedNode = useMemo(
    () => flatNodes.find((n) => n.id === selectedNodeId) ?? null,
    [flatNodes, selectedNodeId],
  );

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
      await onReorderNodes(budgetId, {
        parentId: node.parentId ?? null,
        orderedNodeIds: next.map((s) => s.id),
      });
    });
  }

  function handleRemove(node: WbsViewNode) {
    if (node.children.length > 0) {
      alert("Elimine los subnodos antes de eliminar este nodo.");
      return;
    }
    if (!confirm(`¿Eliminar "${node.code} — ${node.name}"?`)) return;
    startRemoveTransition(async () => {
      if (selectedNodeId === node.id) setSelectedNodeId(null);
      await onRemoveNode(node.id);
    });
  }

  function renderNode(node: WbsViewNode, depth: number) {
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const siblings = getSiblings(node);
    const idx = siblings.findIndex((s) => s.id === node.id);
    const isFirst = idx === 0;
    const isLast = idx === siblings.length - 1;

    return (
      <div key={node.id}>
        <div
          style={{ paddingLeft: depth * 20 + 8 }}
          className={cn(
            "flex items-center gap-2 py-1.5 pr-2 rounded cursor-pointer hover:bg-muted/50 group",
            isSelected && "bg-muted",
          )}
          onClick={() => {
            if (node.type === "ITEM") setSelectedNodeId(node.id);
          }}
        >
          {node.type === "GROUP" ? (
            <button
              className="text-muted-foreground hover:text-foreground shrink-0"
              onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
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

          <span className="font-mono text-xs text-muted-foreground shrink-0 w-16 truncate">
            {node.code}
          </span>
          <span className="flex-1 text-sm truncate">{node.name}</span>

          <Badge
            variant={node.type === "GROUP" ? "secondary" : "outline"}
            className="text-xs shrink-0"
          >
            {node.type}
          </Badge>

          <span className="font-mono text-xs text-muted-foreground shrink-0 w-28 text-right">
            {fmt(node.totalSalePrice, currency)}
          </span>

          {editable && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
              {node.type === "GROUP" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Agregar subnodo"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDialogState({ type: "add", parentId: node.id });
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="Editar"
                onClick={(e) => {
                  e.stopPropagation();
                  setDialogState({ type: "edit", node });
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="Subir"
                disabled={isFirst || reorderPending}
                onClick={(e) => { e.stopPropagation(); moveNode(node, "up"); }}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="Bajar"
                disabled={isLast || reorderPending}
                onClick={(e) => { e.stopPropagation(); moveNode(node, "down"); }}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive"
                title="Eliminar"
                disabled={removePending}
                onClick={(e) => { e.stopPropagation(); handleRemove(node); }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {node.type === "GROUP" && isExpanded && node.children.map((child) =>
          renderNode(child, depth + 1),
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-4 min-h-[400px]">
      {/* Tree panel */}
      <div className="flex-1 rounded-lg border overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Estructura de trabajo (EDT)</h3>
          {editable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogState({ type: "add", parentId: undefined })}
            >
              <Plus className="h-3 w-3 mr-1" /> Agregar nodo raíz
            </Button>
          )}
        </div>

        {nodes.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">
            Sin nodos. Agregue el primer elemento de la EDT.
          </p>
        ) : (
          <div className="p-2 space-y-0.5">
            {nodes.map((node) => renderNode(node, 0))}
          </div>
        )}
      </div>

      {/* APU panel */}
      <div className="w-[480px] shrink-0">
        {selectedNode?.type === "ITEM" && selectedNode.costItem ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground px-1">
              <span className="font-mono">{selectedNode.code}</span> — {selectedNode.name}
            </p>
            <CostItemPanel
              costItem={selectedNode.costItem as CostItemView}
              currency={currency}
              editable={editable}
              onUpdateCostItem={(data) => onUpdateCostItem(selectedNode.costItem!.id, data)}
              onAddLine={onAddLine}
              onUpdateLine={onUpdateLine}
              onRemoveLine={onRemoveLine}
            />
          </div>
        ) : (
          <div className="rounded-lg border h-full flex items-center justify-center p-8">
            <p className="text-sm text-muted-foreground text-center">
              Seleccione un ítem (ITEM) del árbol para ver su análisis de precio unitario.
            </p>
          </div>
        )}
      </div>

      {/* Node dialog */}
      <Dialog
        open={dialogState.type !== "closed"}
        onOpenChange={(open) => { if (!open) setDialogState({ type: "closed" }); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState.type === "add" ? "Agregar nodo" : "Editar nodo"}
            </DialogTitle>
          </DialogHeader>
          {dialogState.type === "add" && (
            <WbsNodeForm
              mode="create"
              parentId={dialogState.parentId}
              onSubmit={(data) => onAddNode(budgetId, data)}
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
              onSubmit={(data) => onUpdateNode(dialogState.type === "edit" ? dialogState.node.id : "", data)}
              onDone={() => setDialogState({ type: "closed" })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
