"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  Folder,
  FolderLock,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DocumentFolderView } from "@bloqer/services";
import {
  createDocumentFolderAction,
  deleteDocumentFolderAction,
  renameDocumentFolderAction,
} from "@/app/(app)/proyectos/[id]/documentos/actions";

type Props = {
  projectId: string;
  folders: DocumentFolderView[];
  selectedFolderId: string | null;
  canEdit: boolean;
};

type TreeNode = DocumentFolderView & { children: TreeNode[] };

function buildTree(folders: DocumentFolderView[]): TreeNode[] {
  const byParent = new Map<string | null, DocumentFolderView[]>();
  for (const f of folders) {
    const key = f.parentId;
    const list = byParent.get(key) ?? [];
    list.push(f);
    byParent.set(key, list);
  }
  function nest(parentId: string | null): TreeNode[] {
    return (byParent.get(parentId) ?? []).map((f) => ({
      ...f,
      children: nest(f.id),
    }));
  }
  return nest(null);
}

function buildFolderHref(
  pathname: string,
  searchParams: URLSearchParams,
  folderId: string | null,
): string {
  const params = new URLSearchParams(searchParams.toString());
  if (folderId) params.set("folderId", folderId);
  else params.delete("folderId");
  const q = params.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export function DocumentFolderTree({
  projectId,
  folders,
  selectedFolderId,
  canEdit,
}: Props) {
  const tree = useMemo(() => buildTree(folders), [folders]);
  const [pending, startTransition] = useTransition();
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function folderHref(folderId: string | null): string {
    return buildFolderHref(pathname, searchParams, folderId);
  }

  function submitCreate(parentId: string) {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        await createDocumentFolderAction(projectId, { parentId, name });
        toast.success("Carpeta creada");
        setCreatingUnder(null);
        setNewName("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo crear la carpeta");
      }
    });
  }

  function submitRename(folderId: string) {
    const name = renameValue.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        await renameDocumentFolderAction(projectId, folderId, { name });
        toast.success("Carpeta renombrada");
        setRenamingId(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo renombrar");
      }
    });
  }

  function submitDelete(folderId: string, name: string) {
    if (!window.confirm(`¿Eliminar la carpeta «${name}»? Debe estar vacía.`)) return;
    startTransition(async () => {
      try {
        await deleteDocumentFolderAction(projectId, folderId);
        toast.success("Carpeta eliminada");
        if (selectedFolderId === folderId) {
          router.push(folderHref(null));
        } else {
          router.refresh();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
      }
    });
  }

  function renderNode(node: TreeNode, depth: number) {
    const selected = selectedFolderId === node.id;
    const Icon = node.kind === "SYSTEM" && !node.allowsLibraryWrites ? FolderLock : Folder;
    const isRenaming = renamingId === node.id;

    return (
      <li key={node.id} className="select-none">
        <div
          className={cn(
            "group flex items-center gap-0.5 rounded-md pr-1",
            selected && "bg-accent text-accent-foreground",
          )}
          style={{ paddingLeft: `${4 + depth * 12}px` }}
        >
          {node.children.length > 0 ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <span className="inline-block w-3.5 shrink-0" />
          )}
          {isRenaming ? (
            <form
              className="flex min-w-0 flex-1 items-center gap-1 py-1"
              onSubmit={(e) => {
                e.preventDefault();
                submitRename(node.id);
              }}
            >
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="h-8 text-sm"
                autoFocus
                disabled={pending}
                maxLength={120}
              />
              <Button type="submit" size="sm" className="h-8" disabled={pending}>
                OK
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                disabled={pending}
                onClick={() => setRenamingId(null)}
              >
                Cancelar
              </Button>
            </form>
          ) : (
            <>
              <Link
                href={folderHref(node.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-sm hover:underline"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{node.name}</span>
              </Link>
              {canEdit && (node.canCreateChild || node.canRename || node.canDelete) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 opacity-70 group-hover:opacity-100"
                      disabled={pending}
                      aria-label={`Acciones de ${node.name}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {node.canCreateChild ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          setCreatingUnder(node.id);
                          setNewName("");
                        }}
                      >
                        <FolderPlus className="mr-2 h-4 w-4" />
                        Nueva subcarpeta
                      </DropdownMenuItem>
                    ) : null}
                    {node.canRename ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          setRenamingId(node.id);
                          setRenameValue(node.name);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Renombrar
                      </DropdownMenuItem>
                    ) : null}
                    {node.canDelete ? (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => submitDelete(node.id, node.name)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </>
          )}
        </div>
        {creatingUnder === node.id ? (
          <form
            className="flex items-center gap-1 py-1"
            style={{ paddingLeft: `${20 + (depth + 1) * 12}px` }}
            onSubmit={(e) => {
              e.preventDefault();
              submitCreate(node.id);
            }}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre de carpeta"
              className="h-8 text-sm"
              autoFocus
              disabled={pending}
              maxLength={120}
            />
            <Button type="submit" size="sm" className="h-8" disabled={pending || !newName.trim()}>
              Crear
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              disabled={pending}
              onClick={() => setCreatingUnder(null)}
            >
              Cancelar
            </Button>
          </form>
        ) : null}
        {node.children.length > 0 ? (
          <ul className="space-y-0.5">{node.children.map((c) => renderNode(c, depth + 1))}</ul>
        ) : null}
      </li>
    );
  }

  return (
    <nav aria-label="Carpetas de documentos" className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Carpetas
        </p>
        <Link
          href={folderHref(null)}
          className={cn(
            "rounded-md px-2 py-1 text-xs hover:bg-accent",
            selectedFolderId == null && "bg-accent font-medium",
          )}
        >
          Todos
        </Link>
      </div>
      <ul className="space-y-0.5">{tree.map((n) => renderNode(n, 0))}</ul>
    </nav>
  );
}
