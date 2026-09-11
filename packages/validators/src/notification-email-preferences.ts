import { z } from "zod";
import { NOTIFICATION_EMAIL_CATEGORIES } from "@bloqer/domain";

export const upsertNotificationEmailPreferenceSchema = z.object({
  category: z.enum(
    NOTIFICATION_EMAIL_CATEGORIES as unknown as [
      (typeof NOTIFICATION_EMAIL_CATEGORIES)[number],
      ...(typeof NOTIFICATION_EMAIL_CATEGORIES)[number][],
    ],
  ),
  emailEnabled: z.boolean(),
});

export type UpsertNotificationEmailPreferenceInput = z.infer<
  typeof upsertNotificationEmailPreferenceSchema
>;

export const updateTenantNotificationEmailPolicySchema = z.object({
  leadershipDailyFlowEmailCc: z.boolean().optional(),
  digestEnabledDefault: z.boolean().optional(),
  digestHourLocal: z.number().int().min(0).max(23).optional(),
});

export type UpdateTenantNotificationEmailPolicyInput = z.infer<
  typeof updateTenantNotificationEmailPolicySchema
>;
