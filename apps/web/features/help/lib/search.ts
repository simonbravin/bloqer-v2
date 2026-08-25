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

/**
 * Argentine / construction colloquialisms → canonical phrases before tokenization.
 * Order matters (longer phrases first).
 */
const PHRASE_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["dar de alta", "cargar"],
  ["alta de", "cargar"],
  ["no me deja pagar", "pago bloqueado"],
  ["no me deja", "bloqueado"],
  ["caja chica", "ajuste caja"],
  ["liquidacion de sueldos", "pagar sueldo"],
  ["liquidacion de sueldo", "pagar sueldo"],
  ["liquidacion sueldos", "pagar sueldo"],
  ["pedido de compra", "solicitud de compra"],
  ["certificado de avance", "certificacion"],
  ["ingresar mercaderia", "recibir oc"],
  ["entrar mercaderia", "recibir oc"],
  ["mover plata", "transferencia"],
  ["transferir plata", "transferencia"],
  ["sacar plata", "pago"],
  ["poner plata", "ingreso caja"],
  ["factura de compra", "factura proveedor"],
  ["boleta de compra", "factura proveedor"],
  ["orden compra", "orden de compra"],
  ["aprobar oc", "aprobar orden de compra"],
  ["presupuestado vs real", "presupuesto vs real"],
  ["presupuesto contra real", "presupuesto vs real"],
  ["exportar a pdf", "exportar pdf"],
  ["bajar pdf", "exportar pdf"],
  ["descargar pdf", "exportar pdf"],
  ["margen de la obra", "rentabilidad"],
  ["ganar plata obra", "rentabilidad"],
  ["deshacer oc", "anular oc"],
  ["cancelar oc", "anular oc"],
];

/** Token-level synonyms (OR within a query token slot). Keep short acronyms tight. */
const TOKEN_SYNONYMS: Record<string, readonly string[]> = {
  mercaderia: ["recepcion", "recibir", "remito", "entrada", "stock"],
  remito: ["recepcion", "recibir", "entrada"],
  boleta: ["factura", "facturar"],
  haberes: ["sueldo", "sueldos", "nomina"],
  liquidacion: ["sueldo", "sueldos"],
  comitente: ["cliente", "mandante"],
  mandante: ["cliente"],
  // «plata» alone is broad — handled via BROAD_TOKENS; keep synonyms for multi-word only.
  guita: ["transferencia", "caja", "pago"],
  laburo: ["obra", "proyecto"],
  chequear: ["ver", "consultar"],
  fijarse: ["ver"],
  cbu: ["transferencia", "banco"],
  transf: ["transferencia"],
  transferencia: ["transferencia", "transferir"],
  certificado: ["certificacion", "certificar"],
  certificacion: ["certificacion", "certificar"],
  pedido: ["solicitud", "sc", "pedir"],
  // Acronyms: do NOT expand to orden/compra/cxp (OR would match half the catalog).
  sc: ["sc", "solicitud"],
  oc: ["oc"],
  cc: ["cc"],
  anular: ["anular", "cancelar", "devolver"],
  cancelar: ["anular", "cancelar"],
  adenda: ["adenda", "fase"],
  rentabilidad: ["rentabilidad", "margen"],
  pdf: ["pdf"],
  csv: ["csv"],
  proveedor: ["proveedor", "supplier"],
  ferreteria: ["ferreteria", "reintegro"],
  adelanto: ["anticipo", "adelanto"],
  cxp: ["cxp", "pagar"],
  cxc: ["cxc", "cobrar"],
  bloqueado: ["bloqueado", "bloquea", "fondos"],
  bloquea: ["bloqueado", "bloquea"],
  alta: ["cargar", "crear"],
  cargar: ["cargar", "alta", "crear"],
  plata: ["plata"],
};

const STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "y",
  "o",
  "en",
  "al",
  "a",
  "para",
  "por",
  "con",
  "como",
  "que",
  "se",
  "me",
  "mi",
  "tu",
  "su",
  "es",
  "son",
  "hacer",
  "hago",
  "quiero",
  "necesito",
]);

/** Soft single-token queries: only title/keyword hits + hard result cap. */
const BROAD_TOKENS = new Set([
  "compra",
  "compras",
  "pagar",
  "pago",
  "pagos",
  "factura",
  "facturas",
  "aprobar",
  "caja",
  "obra",
  "obras",
  "stock",
  "roles",
  "rol",
  "proyecto",
  "proyectos",
  "material",
  "materiales",
  "gasto",
  "gastos",
  "ingreso",
  "ingresos",
  "cuenta",
  "cuentas",
  "plata",
  "guita",
  "exportar",
  "pdf",
  "csv",
]);

const MAX_SEARCH_RESULTS = 8;
const RELATIVE_SCORE_RATIO = 0.42;
const MIN_ABSOLUTE_SCORE = 28;

export type HelpSearchFilters = {
  query?: string;
  module?: HelpModule | null;
  intent?: HelpIntent | null;
};

function applyPhraseAliases(normalized: string): string {
  let q = ` ${normalized} `;
  for (const [from, to] of PHRASE_ALIASES) {
    q = q.replaceAll(` ${from} `, ` ${to} `);
  }
  return q.trim().replace(/\s+/g, " ");
}

function expandToken(token: string): string[] {
  const syn = TOKEN_SYNONYMS[token];
  if (!syn) return [token];
  return [...new Set([token, ...syn])];
}

/** Whole-word / boundary-aware contains (avoids «oc» in «documentacion»). */
function textHasToken(haystack: string, token: string): boolean {
  if (!token || !haystack) return false;
  if (token.length <= 2) {
    return new RegExp(`(?:^|\\s)${escapeRegExp(token)}(?:\\s|$)`).test(haystack);
  }
  // Prefer word-ish boundaries; still allow stemmed prefix («comprar» ↔ «compra»).
  if (new RegExp(`(?:^|\\s|/|-)${escapeRegExp(token)}(?:\\s|/|-|s\\b|$)`).test(haystack)) {
    return true;
  }
  // Prefix of a longer word only if token is long enough («compra» in «compras»).
  if (token.length >= 5 && new RegExp(`(?:^|\\s)${escapeRegExp(token)}\\p{L}*`, "u").test(haystack)) {
    return true;
  }
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatchesToken(keyword: string, token: string): boolean {
  if (keyword === token) return true;
  if (textHasToken(keyword, token)) return true;
  // Multi-word keyword: match a whole segment; prefix only for longer tokens.
  if (
    keyword.split(" ").some((part) => {
      if (part === token) return true;
      if (token.length >= 5 && part.startsWith(token)) return true;
      return false;
    })
  ) {
    return true;
  }
  return false;
}

type ArticleIndex = {
  article: HelpArticle;
  title: string;
  keywords: string[];
  /** title + keywords + slug + intents — primary match surface */
  primary: string;
  /** summary + menu — secondary */
  secondary: string;
};

function indexArticle(article: HelpArticle): ArticleIndex {
  const title = normalizeHelpQuery(article.title);
  const keywords = article.keywords.map(normalizeHelpQuery);
  const slug = normalizeHelpQuery(article.slug.replace(/-/g, " "));
  const intents = article.intents.map((i) => normalizeHelpQuery(i.replace(/-/g, " ")));
  const primary = [title, slug, ...keywords, ...intents].join(" ");
  const secondary = normalizeHelpQuery([article.summary, article.where.menu].join(" "));
  return { article, title, keywords, primary, secondary };
}

function groupMatchesSurface(surface: string, keywords: string[], title: string, group: string[]): boolean {
  return group.some(
    (t) =>
      textHasToken(title, t) ||
      keywords.some((k) => keywordMatchesToken(k, t)) ||
      textHasToken(surface, t),
  );
}

function scoreArticle(
  index: ArticleIndex,
  tokenGroups: string[][],
  fullQuery: string,
  originalTokens: string[],
): number {
  const { article, title, keywords, primary, secondary } = index;
  if (tokenGroups.length === 0) return 0;

  const rawSingle = originalTokens.length === 1 ? originalTokens[0]! : null;
  const isBroadSingle =
    rawSingle != null && (BROAD_TOKENS.has(rawSingle) || rawSingle.length <= 2);

  // AND across groups; within a group, any synonym (OR).
  for (const group of tokenGroups) {
    const hitPrimary = groupMatchesSurface(primary, keywords, title, group);
    if (hitPrimary) continue;
    // Broad single tokens: primary only (no summary noise).
    if (isBroadSingle) return 0;
    // Multi-word: allow secondary for the group, but later scored weaker.
    if (!groupMatchesSurface(secondary, keywords, title, group)) return 0;
  }

  let score = 0;
  let matched = false;
  let primaryHitCount = 0;

  if (fullQuery) {
    if (keywords.some((k) => k === fullQuery)) {
      score += 120;
      matched = true;
    }
    if (title === fullQuery) {
      score += 100;
      matched = true;
    }
    if (keywords.some((k) => k.includes(fullQuery)) || title.includes(fullQuery)) {
      score += 80;
      matched = true;
    }
  }

  if (tokenGroups.length >= 2) {
    const flat = tokenGroups.map((g) => g[0]!);
    for (let i = 0; i < flat.length - 1; i++) {
      const bigram = `${flat[i]} ${flat[i + 1]}`;
      if (title.includes(bigram) || keywords.some((k) => k.includes(bigram))) {
        score += 45;
        matched = true;
      }
    }
  }

  if (
    tokenGroups.some((g) => g.includes("orden")) &&
    tokenGroups.some((g) => g.includes("compra") || g.includes("compras")) &&
    title.includes("orden de compra")
  ) {
    score += 55;
    matched = true;
  }
  if (
    tokenGroups.some((g) => g.includes("aprobar")) &&
    (title.includes("orden de compra") || keywords.includes("aprobar orden de compra"))
  ) {
    score += 35;
    matched = true;
  }

  for (const group of tokenGroups) {
    let best = 0;
    let primaryForGroup = false;
    for (const token of group) {
      if (keywords.some((k) => k === token)) {
        best = Math.max(best, 50);
        primaryForGroup = true;
      }
      if (title === token) {
        best = Math.max(best, 45);
        primaryForGroup = true;
      }
      if (textHasToken(title, token)) {
        best = Math.max(best, title.startsWith(token) ? 35 : 22);
        primaryForGroup = true;
      }
      if (keywords.some((k) => keywordMatchesToken(k, token))) {
        best = Math.max(best, 28);
        primaryForGroup = true;
      }
      if (textHasToken(primary, token)) {
        best = Math.max(best, 12);
        primaryForGroup = true;
      }
      if (!isBroadSingle && textHasToken(secondary, token)) {
        best = Math.max(best, 4);
      }
    }
    score += best;
    if (best > 0) matched = true;
    if (primaryForGroup) primaryHitCount += 1;
  }

  if (!matched) return 0;

  // Multi-word: require most groups to hit primary (title/keywords), not only summary.
  if (tokenGroups.length >= 2 && primaryHitCount < Math.ceil(tokenGroups.length * 0.6)) {
    return 0;
  }

  score += Math.max(0, 10 - Math.min(article.title.length, 36) / 5);
  return score;
}

/**
 * Filter and rank help articles. Empty query + no chips → all articles (stable title order).
 * With a query: capped list, relative score cutoff, AR phrase/token aliases.
 */
export function searchHelpArticles(
  articles: readonly HelpArticle[],
  filters: HelpSearchFilters,
): HelpArticle[] {
  const moduleFilter = filters.module ?? null;
  const intentFilter = filters.intent ?? null;
  const raw = normalizeHelpQuery(filters.query ?? "");
  const query = applyPhraseAliases(raw);
  const rawTokens = query
    ? query.split(" ").filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    : [];
  const tokenGroups = rawTokens.map(expandToken);

  let list = articles.filter((a) => {
    if (moduleFilter && !a.modules.includes(moduleFilter)) return false;
    if (intentFilter && !a.intents.includes(intentFilter)) return false;
    return true;
  });

  if (tokenGroups.length === 0) {
    return [...list].sort((a, b) => a.title.localeCompare(b.title, "es"));
  }

  const ranked = list
    .map((article) => ({
      article,
      score: scoreArticle(indexArticle(article), tokenGroups, query, rawTokens),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, "es"));

  if (ranked.length === 0) return [];

  const top = ranked[0]!.score;
  const floor = Math.max(top * RELATIVE_SCORE_RATIO, MIN_ABSOLUTE_SCORE);
  const cut = ranked.filter((row) => row.score >= floor).slice(0, MAX_SEARCH_RESULTS);
  return cut.map((row) => row.article);
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
