import "server-only";

import { compare, hash } from "bcryptjs";
import { getPublicAppBaseUrl, isEmailConfigured } from "@bloqer/config";
import { prisma } from "@bloqer/database";
import {
  renderAuthEmailHtml,
  renderAuthEmailText,
  sendEmail,
} from "@bloqer/email";
import {
  loginWithEmailPasswordSchema,
  registerWithEmailPasswordSchema,
  requestPasswordResetSchema,
  resendVerificationEmailSchema,
  resetPasswordWithTokenSchema,
  verifyEmailTokenSchema,
  type LoginWithEmailPasswordInput,
  type RegisterWithEmailPasswordInput,
  type RequestPasswordResetInput,
  type ResendVerificationEmailInput,
  type ResetPasswordWithTokenInput,
  type VerifyEmailTokenInput,
} from "@bloqer/validators";
import { normalizeInvitationEmail } from "../tenant-settings/tenant-invitation-shared";
import {
  AUTH_TOKEN_PURPOSE,
  AUTH_TOKEN_RESEND_COOLDOWN_MS,
  EMAIL_VERIFY_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  authTokenIdentifier,
  generateRawAuthToken,
  hashAuthToken,
  type AuthTokenPurpose,
} from "./credentials-token";

const BCRYPT_COST = 12;

/** Precomputed bcrypt of a fixed dummy string — keeps compare timing similar when user/hash missing. */
const DUMMY_PASSWORD_HASH =
  "$2b$12$fO0w/DPEueq0qtxYELSrzumszzvPtu6RYLCR1f117dpgOLgoS4I6W";

const GENERIC_REGISTER_OK =
  "Si el email es válido, te enviamos un enlace para confirmar tu cuenta.";
const GENERIC_RESET_OK =
  "Si el email es válido, te enviamos un enlace para restablecer la contraseña.";
const GENERIC_VERIFY_FAIL = "El enlace no es válido o expiró.";

export type CredentialsEmailDispatch = {
  dispatched: boolean;
  /** Absolute link; only returned when email is not configured and not production (dev flash). */
  flashLink: string | null;
  skipReason?: "email_not_configured" | "app_url_missing";
  providerError?: string;
};

export type RegisterWithEmailPasswordResult =
  | {
      ok: true;
      message: string;
      dispatch: CredentialsEmailDispatch;
      /** Echo email for resend UI after success (never reveals whether account existed). */
      email: string;
    }
  | { ok: false; error: string };

export type AuthenticateWithPasswordResult =
  | {
      ok: true;
      user: {
        id: string;
        email: string;
        name: string | null;
        image: string | null;
        passwordUpdatedAt: Date | null;
      };
    }
  | { ok: false; reason: "invalid_credentials" | "unverified" | "inactive" };

function sanitizeEmailSubject(s: string): string {
  return s.replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, 998);
}

function isNonProduction(): boolean {
  return process.env.NODE_ENV !== "production";
}

function buildAuthLink(path: string, rawToken: string): string | null {
  const base = getPublicAppBaseUrl()?.replace(/\/$/, "") ?? "";
  if (!base) return null;
  const url = new URL(path, `${base}/`);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

async function deleteTokensForIdentifier(identifier: string): Promise<void> {
  await prisma.verificationToken.deleteMany({ where: { identifier } });
}

async function findLatestTokenRow(identifier: string) {
  return prisma.verificationToken.findFirst({
    where: { identifier },
    orderBy: { expires: "desc" },
  });
}

function cooldownActive(expiresAt: Date, ttlMs: number): boolean {
  const issuedAt = expiresAt.getTime() - ttlMs;
  return Date.now() - issuedAt < AUTH_TOKEN_RESEND_COOLDOWN_MS;
}

async function issueAuthToken(params: {
  purpose: AuthTokenPurpose;
  emailNorm: string;
  ttlMs: number;
}): Promise<{ rawToken: string; expires: Date } | { cooldown: true }> {
  const identifier = authTokenIdentifier(params.purpose, params.emailNorm);
  const existing = await findLatestTokenRow(identifier);
  if (existing && existing.expires > new Date() && cooldownActive(existing.expires, params.ttlMs)) {
    return { cooldown: true };
  }

  const rawToken = generateRawAuthToken();
  const tokenHash = hashAuthToken(rawToken);
  const expires = new Date(Date.now() + params.ttlMs);

  await deleteTokensForIdentifier(identifier);
  await prisma.verificationToken.create({
    data: { identifier, token: tokenHash, expires },
  });

  return { rawToken, expires };
}

/**
 * Atomically consume a purpose-scoped token and return the email.
 * Uses deleteMany count so concurrent consumers cannot both succeed.
 */
async function consumeAuthToken(
  purpose: AuthTokenPurpose,
  rawToken: string,
): Promise<{ emailNorm: string } | null> {
  const tokenHash = hashAuthToken(rawToken);
  const prefix = `${purpose}:`;

  return prisma.$transaction(async (tx) => {
    const row = await tx.verificationToken.findFirst({
      where: {
        token: tokenHash,
        expires: { gt: new Date() },
        identifier: { startsWith: prefix },
      },
    });
    if (!row) return null;

    const emailNorm = row.identifier.slice(prefix.length);
    if (!emailNorm.includes("@")) return null;

    const deleted = await tx.verificationToken.deleteMany({
      where: { identifier: row.identifier, token: tokenHash },
    });
    if (deleted.count === 0) return null;

    return { emailNorm };
  });
}

async function dispatchAuthEmail(params: {
  toEmail: string;
  subject: string;
  title: string;
  body: string;
  actionLabel: string;
  linkPath: string;
  rawToken: string;
}): Promise<CredentialsEmailDispatch> {
  const absolute = buildAuthLink(params.linkPath, params.rawToken);
  if (!absolute) {
    return { dispatched: false, flashLink: null, skipReason: "app_url_missing" };
  }

  if (!isEmailConfigured()) {
    return {
      dispatched: false,
      flashLink: isNonProduction() ? absolute : null,
      skipReason: "email_not_configured",
    };
  }

  const html = renderAuthEmailHtml({
    title: params.title,
    body: params.body,
    actionLabel: params.actionLabel,
    actionUrlAbsolute: absolute,
  });
  const text = renderAuthEmailText({
    title: params.title,
    body: params.body,
    actionLabel: params.actionLabel,
    actionUrlAbsolute: absolute,
  });

  const res = await sendEmail({
    to: params.toEmail,
    subject: sanitizeEmailSubject(params.subject),
    html,
    text,
  });

  if (res.ok && res.provider === "resend") {
    return { dispatched: true, flashLink: null };
  }

  return {
    dispatched: false,
    flashLink: isNonProduction() ? absolute : null,
    providerError: res.error ?? "send_failed",
  };
}

async function sendEmailVerifyDispatch(emailNorm: string): Promise<CredentialsEmailDispatch> {
  const issued = await issueAuthToken({
    purpose: AUTH_TOKEN_PURPOSE.EMAIL_VERIFY,
    emailNorm,
    ttlMs: EMAIL_VERIFY_TTL_MS,
  });

  if ("cooldown" in issued) {
    return { dispatched: false, flashLink: null };
  }

  return dispatchAuthEmail({
    toEmail: emailNorm,
    subject: "Confirmá tu cuenta en Bloqer",
    title: "Confirmá tu email",
    body: "Para activar tu cuenta en Bloqer, abrí el enlace y tocá el botón «Confirmar mi email» en la página.",
    actionLabel: "Abrir confirmación",
    linkPath: "/verificar-email",
    rawToken: issued.rawToken,
  });
}

export async function registerWithEmailPassword(
  input: RegisterWithEmailPasswordInput,
): Promise<RegisterWithEmailPasswordResult> {
  const parsed = registerWithEmailPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const emailNorm = normalizeInvitationEmail(parsed.data.email);
  const existing = await prisma.user.findUnique({
    where: { email: emailNorm },
    select: { id: true, emailVerified: true, passwordHash: true },
  });

  if (existing) {
    // Unverified credentials stub: re-send verify (same generic message). Do not overwrite password.
    let dispatch: CredentialsEmailDispatch = { dispatched: false, flashLink: null };
    if (!existing.emailVerified && existing.passwordHash) {
      dispatch = await sendEmailVerifyDispatch(emailNorm);
    }
    return {
      ok: true,
      message: GENERIC_REGISTER_OK,
      dispatch,
      email: emailNorm,
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    await prisma.user.create({
      data: {
        email: emailNorm,
        name: parsed.data.name ?? null,
        passwordHash,
        status: "INVITED",
        emailVerified: null,
      },
    });
  } catch (e) {
    const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code === "P2002") {
      return {
        ok: true,
        message: GENERIC_REGISTER_OK,
        dispatch: { dispatched: false, flashLink: null },
        email: emailNorm,
      };
    }
    throw e;
  }

  const dispatch = await sendEmailVerifyDispatch(emailNorm);
  return { ok: true, message: GENERIC_REGISTER_OK, dispatch, email: emailNorm };
}

export async function resendVerificationEmail(
  input: ResendVerificationEmailInput,
): Promise<{ ok: true; message: string; dispatch: CredentialsEmailDispatch; email: string }> {
  const parsed = resendVerificationEmailSchema.safeParse(input);
  const message = GENERIC_REGISTER_OK;
  if (!parsed.success) {
    return {
      ok: true,
      message,
      dispatch: { dispatched: false, flashLink: null },
      email: "",
    };
  }

  const emailNorm = normalizeInvitationEmail(parsed.data.email);
  const user = await prisma.user.findUnique({
    where: { email: emailNorm },
    select: { id: true, emailVerified: true, passwordHash: true },
  });

  if (!user || user.emailVerified || !user.passwordHash) {
    return {
      ok: true,
      message,
      dispatch: { dispatched: false, flashLink: null },
      email: emailNorm,
    };
  }

  const dispatch = await sendEmailVerifyDispatch(emailNorm);
  return { ok: true, message, dispatch, email: emailNorm };
}

export async function verifyEmailWithToken(
  input: VerifyEmailTokenInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = verifyEmailTokenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_VERIFY_FAIL };

  const consumed = await consumeAuthToken(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY, parsed.data.token);
  if (!consumed) return { ok: false, error: GENERIC_VERIFY_FAIL };

  const user = await prisma.user.findUnique({
    where: { email: consumed.emailNorm },
    select: { id: true, emailVerified: true },
  });
  if (!user) return { ok: false, error: GENERIC_VERIFY_FAIL };

  if (!user.emailVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date(), status: "ACTIVE" },
    });
  }

  return { ok: true };
}

export async function authenticateWithPassword(
  input: LoginWithEmailPasswordInput,
): Promise<AuthenticateWithPasswordResult> {
  const parsed = loginWithEmailPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_credentials" };

  const emailNorm = normalizeInvitationEmail(parsed.data.email);
  const user = await prisma.user.findUnique({
    where: { email: emailNorm },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      passwordHash: true,
      emailVerified: true,
      status: true,
      passwordUpdatedAt: true,
    },
  });

  const hashToCompare = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const passwordOk = await compare(parsed.data.password, hashToCompare);

  if (!user || !user.passwordHash || !passwordOk) {
    return { ok: false, reason: "invalid_credentials" };
  }
  if (!user.emailVerified) {
    return { ok: false, reason: "unverified" };
  }
  if (user.status !== "ACTIVE") {
    return { ok: false, reason: "inactive" };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      passwordUpdatedAt: user.passwordUpdatedAt,
    },
  };
}

export async function requestPasswordReset(
  input: RequestPasswordResetInput,
): Promise<{ ok: true; message: string; dispatch: CredentialsEmailDispatch }> {
  const parsed = requestPasswordResetSchema.safeParse(input);
  const message = GENERIC_RESET_OK;
  if (!parsed.success) {
    return { ok: true, message, dispatch: { dispatched: false, flashLink: null } };
  }

  const emailNorm = normalizeInvitationEmail(parsed.data.email);
  const user = await prisma.user.findUnique({
    where: { email: emailNorm },
    select: { id: true },
  });

  if (!user) {
    return { ok: true, message, dispatch: { dispatched: false, flashLink: null } };
  }

  const issued = await issueAuthToken({
    purpose: AUTH_TOKEN_PURPOSE.PASSWORD_RESET,
    emailNorm,
    ttlMs: PASSWORD_RESET_TTL_MS,
  });

  if ("cooldown" in issued) {
    return { ok: true, message, dispatch: { dispatched: false, flashLink: null } };
  }

  const dispatch = await dispatchAuthEmail({
    toEmail: emailNorm,
    subject: "Restablecé tu contraseña en Bloqer",
    title: "Restablecer contraseña",
    body: "Usá el enlace para elegir una contraseña nueva. El enlace vence en una hora.",
    actionLabel: "Elegir contraseña",
    linkPath: "/restablecer-contrasena",
    rawToken: issued.rawToken,
  });

  return { ok: true, message, dispatch };
}

export async function resetPasswordWithToken(
  input: ResetPasswordWithTokenInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = resetPasswordWithTokenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const consumed = await consumeAuthToken(AUTH_TOKEN_PURPOSE.PASSWORD_RESET, parsed.data.token);
  if (!consumed) return { ok: false, error: GENERIC_VERIFY_FAIL };

  const user = await prisma.user.findUnique({
    where: { email: consumed.emailNorm },
    select: { id: true },
  });
  if (!user) return { ok: false, error: GENERIC_VERIFY_FAIL };

  const passwordHash = await hashPassword(parsed.data.password);
  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordUpdatedAt: now,
      emailVerified: now,
      status: "ACTIVE",
    },
  });

  await deleteTokensForIdentifier(
    authTokenIdentifier(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY, consumed.emailNorm),
  );

  return { ok: true };
}

/**
 * Google sign-in path: if an unverified credentials stub exists for the same email,
 * activate it so Prisma unique email does not block OAuth account linking.
 * Clears any attacker-chosen passwordHash on takeover.
 */
export async function takeoverUnverifiedCredentialsStub(params: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<{ userId: string; tookOver: boolean } | null> {
  const emailNorm = normalizeInvitationEmail(params.email);
  if (!emailNorm) return null;

  const user = await prisma.user.findUnique({
    where: { email: emailNorm },
    select: {
      id: true,
      emailVerified: true,
      accounts: { select: { provider: true } },
    },
  });

  if (!user) return null;

  const hasOAuth = user.accounts.some((a) => a.provider !== "credentials");
  if (user.emailVerified || hasOAuth) {
    return { userId: user.id, tookOver: false };
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: now,
      status: "ACTIVE",
      // Prevent attacker who created the stub from keeping a known password after Google proves ownership.
      passwordHash: null,
      passwordUpdatedAt: now,
      name: params.name ?? undefined,
      image: params.image ?? undefined,
    },
  });

  await deleteTokensForIdentifier(authTokenIdentifier(AUTH_TOKEN_PURPOSE.EMAIL_VERIFY, emailNorm));

  return { userId: user.id, tookOver: true };
}

export async function getUserPasswordUpdatedAt(userId: string): Promise<Date | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordUpdatedAt: true },
  });
  return user?.passwordUpdatedAt ?? null;
}

export { GENERIC_REGISTER_OK, GENERIC_RESET_OK, GENERIC_VERIFY_FAIL };
