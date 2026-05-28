import { randomBytes } from "node:crypto";
import type { Prisma } from "@bloqer/database";
import { OVERVIEW_MODULES } from "@bloqer/domain";
import type { CompleteTrialOnboardingInput } from "@bloqer/validators";
import { ServiceError } from "../types";

const TRIAL_DAYS = 30;

function slugifyBase(displayName: string): string {
  const s = displayName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "tenant";
}

export type TrialTenantBundleResult = {
  tenant: { id: string; name: string; slug: string; trialEndsAt: Date | null };
  company: { id: string; name: string };
};

/**
 * Creates trial tenant, primary company, and explicit module settings (no membership).
 */
export async function createTrialTenantBundle(
  tx: Prisma.TransactionClient,
  input: CompleteTrialOnboardingInput,
): Promise<TrialTenantBundleResult> {
  const baseSlug = slugifyBase(input.displayName);
  let slug = baseSlug;
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(3).toString("hex")}`;
    const taken = await tx.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) {
      slug = candidate;
      break;
    }
    if (attempt === 23) {
      throw new ServiceError("CONFLICT", "No se pudo generar un identificador único. Probá con otro nombre.");
    }
  }

  const trialEndsAt = new Date();
  trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + TRIAL_DAYS);

  const tenant = await tx.tenant.create({
    data: {
      name: input.displayName,
      slug,
      fiscalId: input.taxId,
      status: "ACTIVE",
      saasPlan: "trial",
      subscriptionStatus: "TRIAL",
      trialEndsAt,
    },
    select: { id: true, name: true, slug: true, trialEndsAt: true },
  });

  const company = await tx.company.create({
    data: {
      tenantId: tenant.id,
      name: input.displayName,
      legalName: input.legalName,
      fiscalId: input.taxId,
      status: "ACTIVE",
      address: input.address,
      city: input.city,
      country: input.country,
      phone: input.phone,
      website: input.website ?? null,
      industry: input.industry ?? null,
      companySize: input.companySize ?? null,
    },
    select: { id: true, name: true },
  });

  await tx.tenantModuleSetting.createMany({
    data: OVERVIEW_MODULES.map((moduleKey) => ({
      tenantId: tenant.id,
      moduleKey,
      isEnabled: true,
    })),
    skipDuplicates: true,
  });

  return { tenant, company };
}
