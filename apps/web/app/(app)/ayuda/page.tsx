import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { HelpSearchView } from "@/features/help/components/help-search-view";

export default async function AyudaPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Ayuda"
        subtitle="Procedimientos buscables: qué querés lograr, dónde se hace y quién suele hacerlo."
      />
      <HelpSearchView />
    </PageShell>
  );
}
