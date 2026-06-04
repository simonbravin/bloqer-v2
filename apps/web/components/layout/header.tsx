"use client";

import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import Link from "next/link";
import { Bell } from "lucide-react";
import { clearActiveTenantCookieAction } from "@/lib/auth-session-actions";
import { ShellHeaderLeading } from "@/components/layout/sidebar-shell-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  user: Session["user"];
  /** Organization name from tenant; shown under product title on desktop. */
  tenantName?: string | null;
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
  notificationUnreadCount = 0,
  showPlatformLink = false,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-background/90 px-4 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/75 sm:px-6">
      <ShellHeaderLeading>
        {tenantName ? (
          <p className="truncate text-sm font-semibold tracking-tight text-foreground" title={tenantName}>
            {tenantName}
          </p>
        ) : null}
      </ShellHeaderLeading>
      <div className="flex items-center gap-1 sm:gap-2">
        <Button variant="ghost" size="icon" className="relative h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground" asChild title="Notificaciones">
          <Link href="/notificaciones">
            <Bell className="h-4 w-4" aria-hidden />
            {notificationUnreadCount > 0 ? (
              <Badge
                variant="destructive"
                className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center px-1 text-[10px] font-semibold leading-none tabular-nums"
              >
                {notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}
              </Badge>
            ) : null}
            <span className="sr-only">Notificaciones</span>
          </Link>
        </Button>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-transparent p-0.5 outline-none transition-colors hover:border-border hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
            <DropdownMenuItem asChild>
              <Link href="/configuracion/perfil">Mi perfil</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
