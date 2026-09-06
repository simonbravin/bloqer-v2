import { z } from "zod";

/** Presentation mode — how the UI should render (not a rigid intent classifier). */
export const aiPresentationKindSchema = z.enum([
  "direct",
  "executive",
  "list",
  "help",
  "explain",
]);
export type AiPresentationKind = z.infer<typeof aiPresentationKindSchema>;

/**
 * Severity is constrained. The model must pick from this enum only.
 * Prefer neutral when unsure — never invent financial risk grades.
 */
export const aiInsightSeveritySchema = z.enum([
  "critical",
  "attention",
  "pending",
  "info",
  "neutral",
]);
export type AiInsightSeverity = z.infer<typeof aiInsightSeveritySchema>;

export const aiPresentationLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  /** Prefer internal Bloqer paths; unsafe hrefs are dropped in sanitizeAiPresentation. */
  href: z.string().trim().min(1).max(500),
});
export type AiPresentationLink = z.infer<typeof aiPresentationLinkSchema>;

export const aiInsightSchema = z.object({
  kind: z
    .enum([
      "schedule",
      "procurement",
      "materials",
      "payables",
      "receivables",
      "cash",
      "certification",
      "field",
      "budget",
      "help",
      "other",
    ])
    .default("other"),
  severity: aiInsightSeveritySchema.default("neutral"),
  title: z.string().trim().min(1).max(120),
  value: z.string().trim().max(120).optional(),
  explanation: z.string().trim().min(1).max(600),
  recommendation: z.string().trim().max(400).optional(),
  links: z.array(aiPresentationLinkSchema).max(4).default([]),
});
export type AiInsight = z.infer<typeof aiInsightSchema>;

export const aiActionSchema = z.object({
  rank: z.number().int().min(1).max(10),
  label: z.string().trim().min(1).max(200),
  links: z.array(aiPresentationLinkSchema).max(2).default([]),
});
export type AiAction = z.infer<typeof aiActionSchema>;

export const aiSecondaryMetricSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(120),
  note: z.string().trim().max(200).optional(),
});
export type AiSecondaryMetric = z.infer<typeof aiSecondaryMetricSchema>;

export const aiPresentationSchema = z.object({
  kind: aiPresentationKindSchema,
  headline: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(400).optional(),
  insights: z.array(aiInsightSchema).max(5).default([]),
  actions: z.array(aiActionSchema).max(5).default([]),
  secondaryMetrics: z.array(aiSecondaryMetricSchema).max(12).default([]),
  followUps: z.array(z.string().trim().min(1).max(120)).max(3).default([]),
});
export type AiPresentation = z.infer<typeof aiPresentationSchema>;

export const PRESENTATION_START = "<<<BLOQER_PRESENTATION>>>";
export const PRESENTATION_END = "<<<END_BLOQER_PRESENTATION>>>";
