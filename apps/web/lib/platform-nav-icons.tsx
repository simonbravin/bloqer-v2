import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  LayoutDashboard,
  PlusCircle,
  ScrollText,
  Settings,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";

const PLATFORM_NAV_ICON_BY_HREF: Record<string, LucideIcon> = {
  "/platform": LayoutDashboard,
  "/platform/tenants": Building2,
  "/platform/tenants/new": PlusCircle,
  "/platform/vencimientos": AlertTriangle,
  "/platform/registro": ScrollText,
};

export function platformNavIconForHref(href: string, tenantId?: string): LucideIcon | null {
  if (PLATFORM_NAV_ICON_BY_HREF[href]) return PLATFORM_NAV_ICON_BY_HREF[href];
  if (!tenantId) return null;
  const base = `/platform/tenants/${tenantId}`;
  if (href === base) return LayoutDashboard;
  if (href.endsWith("/users")) return Users;
  if (href.endsWith("/invitations")) return UserPlus;
  if (href.endsWith("/modules")) return Shield;
  if (href.endsWith("/settings")) return Settings;
  return ClipboardList;
}

export function PlatformNavIcon({ href, tenantId }: { href: string; tenantId?: string }) {
  const Icon = platformNavIconForHref(href, tenantId);
  if (!Icon) return null;
  return <Icon className="h-4 w-4 shrink-0" aria-hidden />;
}
