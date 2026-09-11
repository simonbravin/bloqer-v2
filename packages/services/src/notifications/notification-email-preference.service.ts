import type { NotificationEmailCategory as PrismaEmailCategory, NotificationType } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import {
  notificationTypeToEmailCategory,
  resolveNotificationEmailPreference,
  visibleEmailCategoriesForRoles,
  defaultEmailEnabledForCategory,
  NOTIFICATION_EMAIL_CATEGORIES,
  LEADERSHIP_DAILY_FLOW_CATEGORIES,
  type NotificationEmailCategory as DomainEmailCategory,
  type UserRole,
} from "@bloqer/domain";
import { ServiceContext, ServiceError } from "../types";
import { canRunOperationalAlerts } from "./operational-alerts-runner.service";

export type TenantNotificationEmailPolicyView = {
  tenantId: string;
  leadershipDailyFlowEmailCc: boolean;
  digestEnabledDefault: boolean;
  digestHourLocal: number;
};

export type PreferenceSource = "user" | "tenant_policy" | "role_default";

export type UserEmailPreferenceRow = {
  category: DomainEmailCategory;
  emailEnabled: boolean;
  /** Effective value after defaults + policy. */
  effectiveEnabled: boolean;
  /** True when a DB row exists. */
  isExplicit: boolean;
  defaultEnabled: boolean;
  /** Why the effective value is what it is (for UI badge). */
  source: PreferenceSource;
};

const POLICY_DEFAULTS = {
  leadershipDailyFlowEmailCc: false,
  digestEnabledDefault: true,
  digestHourLocal: 7,
} as const;

function asDomainCategory(c: PrismaEmailCategory): DomainEmailCategory {
  return c as DomainEmailCategory;
}

function toPolicyView(row: {
  tenantId: string;
  leadershipDailyFlowEmailCc: boolean;
  digestEnabledDefault: boolean;
  digestHourLocal: number;
}): TenantNotificationEmailPolicyView {
  return {
    tenantId: row.tenantId,
    leadershipDailyFlowEmailCc: row.leadershipDailyFlowEmailCc,
    digestEnabledDefault: row.digestEnabledDefault,
    digestHourLocal: row.digestHourLocal,
  };
}

function resolvePreferenceSource(params: {
  category: DomainEmailCategory;
  roles: readonly UserRole[];
  isExplicit: boolean;
  leadershipDailyFlowEmailCc: boolean;
  digestEnabledDefault: boolean;
}): PreferenceSource {
  if (params.isExplicit) return "user";
  if (params.category === "DAILY_DIGEST" && params.roles.some((r) => r === "OWNER" || r === "ADMIN")) {
    // Tenant default overrides role default when they differ (role default for OA is ON).
    if (params.digestEnabledDefault !== defaultEmailEnabledForCategory("DAILY_DIGEST", params.roles)) {
      return "tenant_policy";
    }
  }
  if (
    params.category !== "DAILY_DIGEST" &&
    params.leadershipDailyFlowEmailCc &&
    params.roles.some((r) => r === "OWNER" || r === "ADMIN") &&
    LEADERSHIP_DAILY_FLOW_CATEGORIES.has(params.category)
  ) {
    return "tenant_policy";
  }
  return "role_default";
}

export function isMissingNotificationEmailPrefsSchema(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
  const message = err instanceof Error ? err.message : String(err);
  return (
    code === "P2021" ||
    code === "P2022" ||
    /tenant_notification_email_policies/i.test(message) ||
    /user_notification_email_preferences/i.test(message) ||
    /NotificationEmailCategory/i.test(message)
  );
}

/**
 * Idempotent get-or-create. Uses upsert to avoid P2002 races on first traffic after deploy.
 */
export async function getOrCreateTenantNotificationEmailPolicy(
  tenantId: string,
): Promise<TenantNotificationEmailPolicyView> {
  const row = await prisma.tenantNotificationEmailPolicy.upsert({
    where: { tenantId },
    create: {
      tenantId,
      ...POLICY_DEFAULTS,
    },
    update: {},
  });
  return toPolicyView(row);
}

export async function getTenantNotificationEmailPolicy(
  ctx: ServiceContext,
): Promise<TenantNotificationEmailPolicyView> {
  if (!canRunOperationalAlerts(ctx)) {
    throw new ServiceError("FORBIDDEN", "Solo Propietario o Administrador pueden ver esta política");
  }
  return getOrCreateTenantNotificationEmailPolicy(ctx.tenantId);
}

export async function updateTenantNotificationEmailPolicy(
  input: {
    leadershipDailyFlowEmailCc?: boolean;
    digestEnabledDefault?: boolean;
    digestHourLocal?: number;
  },
  ctx: ServiceContext,
): Promise<TenantNotificationEmailPolicyView> {
  if (!canRunOperationalAlerts(ctx)) {
    throw new ServiceError("FORBIDDEN", "Solo Propietario o Administrador pueden editar esta política");
  }
  if (input.digestHourLocal !== undefined) {
    const h = input.digestHourLocal;
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      throw new ServiceError("VALIDATION", "La hora del digest debe ser un entero entre 0 y 23");
    }
  }

  const updated = await prisma.tenantNotificationEmailPolicy.upsert({
    where: { tenantId: ctx.tenantId },
    create: {
      tenantId: ctx.tenantId,
      leadershipDailyFlowEmailCc:
        input.leadershipDailyFlowEmailCc ?? POLICY_DEFAULTS.leadershipDailyFlowEmailCc,
      digestEnabledDefault: input.digestEnabledDefault ?? POLICY_DEFAULTS.digestEnabledDefault,
      digestHourLocal: input.digestHourLocal ?? POLICY_DEFAULTS.digestHourLocal,
    },
    update: {
      ...(input.leadershipDailyFlowEmailCc !== undefined
        ? { leadershipDailyFlowEmailCc: input.leadershipDailyFlowEmailCc }
        : {}),
      ...(input.digestEnabledDefault !== undefined
        ? { digestEnabledDefault: input.digestEnabledDefault }
        : {}),
      ...(input.digestHourLocal !== undefined ? { digestHourLocal: input.digestHourLocal } : {}),
    },
  });
  return toPolicyView(updated);
}

async function loadMembershipRoles(
  tenantId: string,
  userId: string,
): Promise<UserRole[] | null> {
  const m = await prisma.userMembership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { roles: true },
  });
  return m ? (m.roles as UserRole[]) : null;
}

function buildPreferenceRow(params: {
  category: DomainEmailCategory;
  roles: readonly UserRole[];
  explicit: boolean | undefined;
  policy: TenantNotificationEmailPolicyView;
}): UserEmailPreferenceRow {
  const isExplicit = params.explicit !== undefined;
  const defaultEnabled = defaultEmailEnabledForCategory(params.category, params.roles);
  const effectiveEnabled = resolveNotificationEmailPreference({
    category: params.category,
    roles: params.roles,
    userEmailEnabled: isExplicit ? params.explicit! : null,
    leadershipDailyFlowEmailCc: params.policy.leadershipDailyFlowEmailCc,
    digestEnabledDefault: params.policy.digestEnabledDefault,
  });
  return {
    category: params.category,
    emailEnabled: isExplicit ? params.explicit! : effectiveEnabled,
    effectiveEnabled,
    isExplicit,
    defaultEnabled,
    source: resolvePreferenceSource({
      category: params.category,
      roles: params.roles,
      isExplicit,
      leadershipDailyFlowEmailCc: params.policy.leadershipDailyFlowEmailCc,
      digestEnabledDefault: params.policy.digestEnabledDefault,
    }),
  };
}

export async function listMyNotificationEmailPreferences(
  ctx: ServiceContext,
): Promise<{
  policy: TenantNotificationEmailPolicyView;
  preferences: UserEmailPreferenceRow[];
}> {
  const roles = ctx.roles as UserRole[];
  const policy = await getOrCreateTenantNotificationEmailPolicy(ctx.tenantId);
  const rows = await prisma.userNotificationEmailPreference.findMany({
    where: { tenantId: ctx.tenantId, userId: ctx.actorUserId },
  });
  const byCat = new Map(rows.map((r) => [asDomainCategory(r.category), r.emailEnabled]));

  const visible = visibleEmailCategoriesForRoles(roles);
  const preferences: UserEmailPreferenceRow[] = visible.map((category) =>
    buildPreferenceRow({
      category,
      roles,
      explicit: byCat.get(category),
      policy,
    }),
  );

  return { policy, preferences };
}

export async function upsertMyNotificationEmailPreference(
  category: DomainEmailCategory,
  emailEnabled: boolean,
  ctx: ServiceContext,
): Promise<UserEmailPreferenceRow> {
  if (!(NOTIFICATION_EMAIL_CATEGORIES as readonly string[]).includes(category)) {
    throw new ServiceError("VALIDATION", "Categoría de notificación inválida");
  }
  const roles = ctx.roles as UserRole[];
  const visible = visibleEmailCategoriesForRoles(roles);
  if (!visible.includes(category)) {
    throw new ServiceError("FORBIDDEN", "No podés configurar esta categoría con tu rol");
  }

  const policy = await getOrCreateTenantNotificationEmailPolicy(ctx.tenantId);
  await prisma.userNotificationEmailPreference.upsert({
    where: {
      tenantId_userId_category: {
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        category: category as PrismaEmailCategory,
      },
    },
    create: {
      tenantId: ctx.tenantId,
      userId: ctx.actorUserId,
      category: category as PrismaEmailCategory,
      emailEnabled,
    },
    update: { emailEnabled },
  });
  return buildPreferenceRow({
    category,
    roles,
    explicit: emailEnabled,
    policy,
  });
}

/** Delete user row so defaults / tenant policy apply again. */
export async function resetMyNotificationEmailPreference(
  category: DomainEmailCategory,
  ctx: ServiceContext,
): Promise<UserEmailPreferenceRow> {
  if (!(NOTIFICATION_EMAIL_CATEGORIES as readonly string[]).includes(category)) {
    throw new ServiceError("VALIDATION", "Categoría de notificación inválida");
  }
  const roles = ctx.roles as UserRole[];
  const visible = visibleEmailCategoriesForRoles(roles);
  if (!visible.includes(category)) {
    throw new ServiceError("FORBIDDEN", "No podés configurar esta categoría con tu rol");
  }

  const policy = await getOrCreateTenantNotificationEmailPolicy(ctx.tenantId);
  await prisma.userNotificationEmailPreference.deleteMany({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.actorUserId,
      category: category as PrismaEmailCategory,
    },
  });
  return buildPreferenceRow({
    category,
    roles,
    explicit: undefined,
    policy,
  });
}

function metaHighLevelApproval(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const v = (metadata as Record<string, unknown>).highLevelApproval;
  return v === true;
}

/**
 * Whether outbound email should be sent for this notification to its recipient.
 * In-app delivery is unchanged ([D-054]).
 * Fail-open if D-114 tables are not migrated yet (deploy window) so operational mail is not dropped.
 */
export async function shouldSendNotificationEmailForRecipient(params: {
  tenantId: string;
  recipientUserId: string;
  notificationType: NotificationType | string;
  metadata?: unknown;
}): Promise<{ send: boolean; reason?: string; category?: DomainEmailCategory | null }> {
  const category = notificationTypeToEmailCategory(String(params.notificationType), {
    highLevelApproval: metaHighLevelApproval(params.metadata),
  });
  if (!category) {
    return { send: false, reason: "category_no_email", category: null };
  }

  try {
    const roles = await loadMembershipRoles(params.tenantId, params.recipientUserId);
    if (!roles) {
      return { send: false, reason: "recipient_not_in_tenant", category };
    }

    const [policy, pref] = await Promise.all([
      getOrCreateTenantNotificationEmailPolicy(params.tenantId),
      prisma.userNotificationEmailPreference.findUnique({
        where: {
          tenantId_userId_category: {
            tenantId: params.tenantId,
            userId: params.recipientUserId,
            category: category as PrismaEmailCategory,
          },
        },
        select: { emailEnabled: true },
      }),
    ]);

    const send = resolveNotificationEmailPreference({
      category,
      roles,
      userEmailEnabled: pref?.emailEnabled ?? null,
      leadershipDailyFlowEmailCc: policy.leadershipDailyFlowEmailCc,
      digestEnabledDefault: policy.digestEnabledDefault,
    });

    return {
      send,
      reason: send ? undefined : pref ? "user_preference" : "role_default",
      category,
    };
  } catch (err) {
    if (isMissingNotificationEmailPrefsSchema(err)) {
      console.warn(
        `[notification-email] D-114 schema missing; fail-open email for type=${params.notificationType}`,
      );
      return { send: true, category };
    }
    throw err;
  }
}

/** Used by digest runner: is digest enabled for this OA user? */
export async function isDigestEnabledForUser(params: {
  tenantId: string;
  userId: string;
  roles: readonly UserRole[];
  policy: TenantNotificationEmailPolicyView;
}): Promise<boolean> {
  const pref = await prisma.userNotificationEmailPreference.findUnique({
    where: {
      tenantId_userId_category: {
        tenantId: params.tenantId,
        userId: params.userId,
        category: "DAILY_DIGEST",
      },
    },
    select: { emailEnabled: true },
  });
  return resolveNotificationEmailPreference({
    category: "DAILY_DIGEST",
    roles: params.roles,
    userEmailEnabled: pref?.emailEnabled ?? null,
    digestEnabledDefault: params.policy.digestEnabledDefault,
  });
}
