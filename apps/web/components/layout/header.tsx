"use client";

import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import Link from "next/link";
import { clearActiveTenantCookieAction } from "@/lib/auth-session-actions";
import { AppShellBreadcrumb } from "@/components/layout/shell-breadcrumb";
import { ShellHeaderLeading } from "@/components/layout/sidebar-shell-context";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { CircleHelp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  user: Session["user"];
  /** Organization name from tenant; shown under product title on desktop. */
  tenantName?: string | null;
  hasTenantContext: boolean;
  notificationUnreadCount?: number;
  showPlatformLink?: boolean;
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  return email?.[0]?.toUpperCase() ?? "U";
}

export function Header({
  user,
  tenantName,
  hasTenantContext,
  notificationUnreadCount = 0,
  showPlatformLink = false,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex min-h-14 shrink-0 items-center justify-between border-b border-border/80 bg-background/90 px-3 py-2 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/75 sm:px-6">
      <ShellHeaderLeading>
        {tenantName ? <AppShellBreadcrumb tenantName={tenantName} /> : null}
      </ShellHeaderLeading>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2 [&>button]:h-11 [&>button]:w-11 md:[&>button]:h-9 md:[&>button]:w-9">
        {hasTenantContext ? (
          <>
            <Button variant="ghost" size="icon" asChild className="h-11 w-11 md:h-9 md:w-9" title="Ayuda">
              <Link href="/ayuda" aria-label="Ayuda">
                <CircleHelp className="h-5 w-5" aria-hidden />
              </Link>
            </Button>
            <NotificationBell initialUnreadCount={notificationUnreadCount} />
          </>
        ) : null}
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Menú de cuenta"
              className="flex items-center justify-center rounded-full border border-transparent p-0.5 outline-none transition-colors hover:border-border hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? "Usuario"} />
                <AvatarFallback className="text-xs font-medium">
                  {getInitials(user?.name, user?.email)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name ?? "Usuario"}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {showPlatformLink ? (
              <DropdownMenuItem asChild>
                <Link href="/platform">Plataforma</Link>
              </DropdownMenuItem>
            ) : null}
            {hasTenantContext ? (
              <DropdownMenuItem asChild>
                <Link href="/configuracion/perfil">Mi perfil</Link>
              </DropdownMenuItem>
            ) : null}
            {hasTenantContext || showPlatformLink ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                void clearActiveTenantCookieAction().finally(() => {
                  void signOut({ callbackUrl: "/login" });
                });
              }}
            >
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
