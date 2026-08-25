import type { HelpArticle, HelpIntent, HelpModule } from "./types";
import { HELP_INTENT_LABELS, HELP_MODULE_LABELS } from "./types";
import { DIRECTORY_ARTICLES } from "./articles/directory";
import { SETUP_ARTICLES, TREASURY_ARTICLES } from "./articles/setup-treasury";
import { PLANNING_ARTICLES, PROCUREMENT_ARTICLES } from "./articles/planning-procurement";
import { AP_ARTICLES, SUBCONTRACT_AR_ARTICLES } from "./articles/finance";
import { CONTROL_ARTICLES } from "./articles/control";

export const HELP_ARTICLES: HelpArticle[] = [
  ...DIRECTORY_ARTICLES,
  ...SETUP_ARTICLES,
  ...TREASURY_ARTICLES,
  ...PLANNING_ARTICLES,
  ...PROCUREMENT_ARTICLES,
  ...SUBCONTRACT_AR_ARTICLES,
  ...AP_ARTICLES,
  ...CONTROL_ARTICLES,
];

const BY_SLUG = new Map(HELP_ARTICLES.map((a) => [a.slug, a]));

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return BY_SLUG.get(slug);
}

export function listHelpModulesInUse(): HelpModule[] {
  const set = new Set<HelpModule>();
  for (const a of HELP_ARTICLES) {
    for (const m of a.modules) set.add(m);
  }
  return [...set].sort((a, b) => HELP_MODULE_LABELS[a].localeCompare(HELP_MODULE_LABELS[b], "es"));
}

/** Intents that appear as filter chips (those with a friendly label). */
export function listHelpIntentChips(): { intent: HelpIntent; label: string }[] {
  const used = new Set<HelpIntent>();
  for (const a of HELP_ARTICLES) {
    for (const i of a.intents) used.add(i);
  }
  return (Object.entries(HELP_INTENT_LABELS) as [HelpIntent, string][])
    .filter(([intent]) => used.has(intent))
    .map(([intent, label]) => ({ intent, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export { HELP_MODULE_LABELS, HELP_INTENT_LABELS };
