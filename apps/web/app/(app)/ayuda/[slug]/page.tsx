import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { getHelpArticle } from "@/features/help/lib/catalog";
import { HelpArticleView } from "@/features/help/components/help-article-view";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function AyudaArticlePage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) notFound();

  return (
    <PageShell variant="default">
      <HelpArticleView article={article} />
    </PageShell>
  );
}
