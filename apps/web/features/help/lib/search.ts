import type { HelpArticle, HelpIntent, HelpModule } from "./types";

/** Normalize for es-AR search: lowercase, strip diacritics, collapse spaces. */
export function normalizeHelpQuery(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function articleSearchBlob(article: HelpArticle): string {
  return normalizeHelpQuery(
    [
      article.title,
      article.summary,
      article.slug.replace(/-/g, " "),
      ...article.keywords,
      ...article.steps,
      ...article.typicalRoles,
      article.where.menu,
      ...(article.effects ?? []),
      ...(article.pitfalls ?? []),
    ].join(" "),
  );
}

export type HelpSearchFilters = {
  query?: string;
  module?: HelpModule | null;
  intent?: HelpIntent | null;
};

const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "un", "una", "y", "o", "en", "al", "a"]);

function keywordMatchesToken(keyword: string, token: string): boolean {
  if (keyword === token) return true;
  // Avoid short keywords («oc», «gg») matching inside unrelated words («documentacion»).
  if (token.length >= 3 && keyword.includes(token)) return true;
  if (keyword.length >= 3 && token.includes(keyword)) return true;
  return false;
}

function scoreArticle(article: HelpArticle, tokens: string[], fullQuery: string): number {
  if (tokens.length === 0) return 0;
  const blob = articleSearchBlob(article);
  const title = normalizeHelpQuery(article.title);
  const keywords = article.keywords.map(normalizeHelpQuery);
  let score = 0;
  let matched = false;

  // Exact / full-query keyword match beats partial overlaps in long FAQ titles.
  if (fullQuery) {
    if (keywords.some((k) => k === fullQuery)) {
      score += 100;
      matched = true;
    }
    if (title === fullQuery) {
      score += 80;
      matched = true;
    }
    if (normalizeHelpQuery(article.slug.replace(/-/g, " ")) === fullQuery) {
      score += 70;
      matched = true;
    }
  }

  for (const token of tokens) {
    if (!token) continue;
    let tokenHit = false;
    if (keywords.some((k) => k === token)) {
      score += 50;
      tokenHit = true;
    }
    if (title === token) {
      score += 45;
      tokenHit = true;
    }
    if (title.startsWith(token) || title.includes(` ${token}`)) {
      score += 35;
      tokenHit = true;
    } else if (token.length >= 3 && title.includes(token)) {
      score += 20;
      tokenHit = true;
    }
    if (keywords.some((k) => keywordMatchesToken(k, token))) {
      score += 25;
      tokenHit = true;
    }
    if (
      token.length >= 3 &&
      article.intents.some((i) => normalizeHelpQuery(i.replace(/-/g, " ")).includes(token))
    ) {
      score += 15;
      tokenHit = true;
    }
    if (token.length >= 3 && blob.includes(token)) {
      score += 5;
      tokenHit = true;
    }
    if (tokenHit) matched = true;
  }

  if (!matched && score === 0) return 0;

  // Prefer shorter “how-to” titles when scores are close (action articles over decision trees).
  if (matched || score > 0) {
    score += Math.max(0, 12 - Math.min(article.title.length, 40) / 4);
  }

  return score;
}

/**
 * Filter and rank help articles. Empty query + no chips → all articles (stable title order).
 */
export function searchHelpArticles(
  articles: readonly HelpArticle[],
  filters: HelpSearchFilters,
): HelpArticle[] {
  const moduleFilter = filters.module ?? null;
  const intentFilter = filters.intent ?? null;
  const query = normalizeHelpQuery(filters.query ?? "");
  const tokens = query
    ? query.split(" ").filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    : [];

  let list = articles.filter((a) => {
    if (moduleFilter && !a.modules.includes(moduleFilter)) return false;
    if (intentFilter && !a.intents.includes(intentFilter)) return false;
    return true;
  });

  if (tokens.length === 0) {
    return [...list].sort((a, b) => a.title.localeCompare(b.title, "es"));
  }

  const ranked = list
    .map((article) => ({ article, score: scoreArticle(article, tokens, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, "es"));

  return ranked.map((row) => row.article);
}

export function resolveHelpHref(
  href: HelpArticle["hrefs"][number],
  projectId: string | null,
): { href: string; needsProject: boolean; label: string } {
  if (href.kind === "company") {
    return {
      href: href.path,
      needsProject: false,
      label: href.label ?? "Ir a la pantalla",
    };
  }
  if (projectId) {
    return {
      href: `/proyectos/${projectId}${href.suffix}`,
      needsProject: false,
      label: href.label ?? "Ir en esta obra",
    };
  }
  return {
    href: "/proyectos",
    needsProject: true,
    label: href.label ?? "Elegí una obra primero",
  };
}
