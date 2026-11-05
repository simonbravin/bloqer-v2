import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { getTenantModuleGate } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { ModuleSubnav } from "@/components/layout/module-subnav";
import { SectionSubnavLayout } from "@/components/layout/section-subnav-layout";
import { INVENTARIO_SUBNAV_LINKS } from "@/lib/inventario-subnav";

export default async function InventarioLayout({ children }: { children: ReactNode }) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const ctx = { actorUserId: current.session.user.id!, ...current.tenantCtx };
  const gate = await getTenantModuleGate(ctx);
  if (!can(ctx.roles, "VIEW", "INVENTORY") || !gate.isEnabled("INVENTORY")) redirect("/dashboard");
  return (
    <SectionSubnavLayout
      subnav={
        <ModuleSubnav
          links={INVENTARIO_SUBNAV_LINKS}
          ariaLabel="Navegación de inventario"
          sectionLabel="Inventario"
        />
      }
    >
      {children}
    </SectionSubnavLayout>
  );
}
