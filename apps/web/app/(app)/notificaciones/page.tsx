import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import {
  canRunOperationalAlerts,
  listMyNotifications,
  NOTIFICATION_INBOX_PAGE_SIZE,
  type NotificationInboxFilter,
  type NotificationListItem,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import {
  archiveNotificationFormAction,
  markAllNotificationsReadAction,
  markNotificationReadFormAction,
} from "./actions";
import { formatDateTime } from "@/lib/format";
import { notificationSeverityLabelEs } from "@/lib/notification-severity-label";
import { PageShell } from "@/components/layout/page-shell";
import { ListEmptyState } from "@/components/ui/list-empty-state";

interface PageProps {
  searchParams: Promise<{ filtro?: string; page?: string }>;
}

const FILTERS: { key: NotificationInboxFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "unread", label: "No leídas" },
  { key: "read", label: "Leídas" },
  { key: "archived", label: "Archivadas" },
];

function severityVariant(s: NotificationListItem["severity"]): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "ERROR":
      return "destructive";
    case "WARNING":
      return "outline";
    case "SUCCESS":
      return "secondary";
    default:
      return "outline";
  }
}

/** Only allow same-origin relative paths (defense in depth vs. tampered DB rows). */
function safeActionHref(url: string | null): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u.startsWith("/") || u.startsWith("//")) return null;
  return u;
}

function fmtWhen(iso: string) {
  return formatDateTime(iso, iso);
}

function filterHref(filtro: NotificationInboxFilter): string {
  return filtro === "all" ? "/notificaciones" : `/notificaciones?filtro=${filtro}`;
}

export default async function NotificacionesPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const raw = sp.filtro ?? "all";
  const filtro = FILTERS.some((f) => f.key === raw) ? (raw as NotificationInboxFilter) : "all";
  const parsedPage = Number(sp.page ?? 1);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const { items, total, page, pageSize } = await listMyNotifications(filtro, ctx, {
    page: requestedPage,
    pageSize: NOTIFICATION_INBOX_PAGE_SIZE,
  });

  // Keep address bar in sync when the service clamps an out-of-range ?page=
  if (page !== requestedPage) {
    const params = new URLSearchParams();
    if (filtro !== "all") params.set("filtro", filtro);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    redirect(qs ? `/notificaciones?${qs}` : "/notificaciones");
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notificaciones</h1>
          <p className="text-sm text-muted-foreground">
            Alertas y avisos dentro de Bloqer.
            {canRunOperationalAlerts(ctx) && (
              <>
                {" "}
                <Link
                  href="/notificaciones/alertas"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Alertas operativas
                </Link>
                {" · "}
                <Link
                  href="/notificaciones/emails"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Emails enviados
                </Link>
              </>
            )}
          </p>
        </div>
        <form action={markAllNotificationsReadAction}>
          <Button type="submit" variant="outline" size="sm">
            Marcar todas como leídas
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={f.key === filtro ? "default" : "outline"}
            size="sm"
            asChild
          >
            <Link href={filterHref(f.key)}>{f.label}</Link>
          </Button>
        ))}
      </div>

      {items.length === 0 ? (
        <ListEmptyState
          title="Sin notificaciones"
          description={
            filtro === "unread"
              ? "No tenés notificaciones sin leer."
              : filtro === "archived"
                ? "No hay notificaciones archivadas."
                : "Cuando haya alertas o avisos del sistema aparecerán acá. También podés abrirlos desde la campana del encabezado."
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((n) => {
              const actionHref = safeActionHref(n.actionUrl);
              return (
                <li key={n.id}>
                  <div
                    className={`rounded-lg border bg-card p-4 ${
                      n.status === "UNREAD" ? "border-primary/30 bg-primary/5 dark:bg-primary/10" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold leading-tight">{n.title}</h2>
                          <Badge variant={severityVariant(n.severity)} className="text-[10px]">
                            {notificationSeverityLabelEs(n.severity)}
                          </Badge>
                          {n.status === "UNREAD" && (
                            <Badge variant="default" className="text-[10px]">
                              Nueva
                            </Badge>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
                        <p className="text-xs text-muted-foreground">{fmtWhen(n.createdAt)}</p>
                        {actionHref && (
                          <p className="pt-1">
                            <Button variant="link" className="h-auto p-0 text-sm" asChild>
                              <Link href={actionHref}>Abrir detalle</Link>
                            </Button>
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {n.status === "UNREAD" && (
                          <form action={markNotificationReadFormAction}>
                            <input type="hidden" name="notificationId" value={n.id} />
                            <Button type="submit" size="sm" variant="secondary">
                              Marcar leída
                            </Button>
                          </form>
                        )}
                        {(n.status === "UNREAD" || n.status === "READ") && (
                          <form action={archiveNotificationFormAction}>
                            <input type="hidden" name="notificationId" value={n.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Archivar
                            </Button>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Suspense fallback={null}>
            <Pagination page={page} pageSize={pageSize} total={total} />
          </Suspense>
        </>
      )}
    </PageShell>
  );
}
