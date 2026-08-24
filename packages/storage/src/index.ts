import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStorageEnv } from "@bloqer/config";
import { randomUUID } from "node:crypto";

// ─── Key helpers ──────────────────────────────────────────────────────────────

function sanitizeFilename(filename: string): string {
  return filename
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .toLowerCase();
}

export function buildStorageKey(
  tenantId:   string,
  projectId:  string | null | undefined,
  documentId: string,
  filename:   string,
): string {
  const safe    = sanitizeFilename(filename);
  const segment = projectId ?? "global";
  return `${tenantId}/${segment}/${documentId}/${safe}`;
}

/** Branding logo key: `{tenantId}/branding/logo/{uuid}.{ext}` ([D-071]). */
export function buildTenantLogoStorageKey(
  tenantId: string,
  ext: "png" | "jpg" | "webp",
): string {
  return `${tenantId}/branding/logo/${randomUUID()}.${ext}`;
}

/**
 * Ensures an R2 key is scoped to the given tenant.
 * Throws if the key is missing or does not start with `{tenantId}/`.
 */
export function assertTenantScopedStorageKey(tenantId: string, storageKey: string): void {
  const prefix = `${tenantId}/`;
  if (!storageKey || !storageKey.startsWith(prefix)) {
    throw new Error("Storage key is not scoped to the current tenant");
  }
}

/** Logo keys must live under `{tenantId}/branding/` ([D-071]). */
export function isTenantLogoStorageKey(tenantId: string, storageKey: string): boolean {
  return Boolean(storageKey) && storageKey.startsWith(`${tenantId}/branding/`);
}

export function assertTenantLogoStorageKey(tenantId: string, storageKey: string): void {
  if (!isTenantLogoStorageKey(tenantId, storageKey)) {
    throw new Error("Storage key is not a tenant branding logo key");
  }
}

export function isTenantScopedStorageKey(tenantId: string, storageKey: string): boolean {
  return Boolean(storageKey) && storageKey.startsWith(`${tenantId}/`);
}

// ─── S3 client ────────────────────────────────────────────────────────────────

function createS3Client() {
  const env = getStorageEnv();
  return {
    client: new S3Client({
      region:      "auto",
      endpoint:    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    }),
    bucket: env.R2_BUCKET_NAME,
  };
}

// ─── Server-side upload ───────────────────────────────────────────────────────

export async function putObject(
  storageKey: string,
  body:       Buffer | Uint8Array,
  mimeType:   string,
): Promise<void> {
  const { client, bucket } = createS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket:      bucket,
      Key:         storageKey,
      Body:        body,
      ContentType: mimeType,
    }),
  );
}

export async function getObjectBytes(storageKey: string): Promise<{
  body: Buffer;
  contentType: string | undefined;
}> {
  const { client, bucket } = createS3Client();
  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key:    storageKey,
    }),
  );
  if (!result.Body) {
    throw new Error("Empty object body");
  }
  const bytes = await result.Body.transformToByteArray();
  return {
    body: Buffer.from(bytes),
    contentType: result.ContentType,
  };
}

export async function deleteObject(storageKey: string): Promise<void> {
  const { client, bucket } = createS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key:    storageKey,
    }),
  );
}

// ─── Content-Disposition for presigned GET ────────────────────────────────────

export type ContentDispositionKind = "inline" | "attachment";

/**
 * Build a Content-Disposition value with ASCII `filename` + RFC 5987 `filename*`.
 * Preserves the original extension; strips path separators and characters that
 * break S3 signing or inject extra header parameters (`;`, quotes, control chars).
 */
export function buildContentDispositionHeader(
  disposition: ContentDispositionKind,
  originalFileName: string,
): string {
  const baseName = originalFileName.replace(/^.*[/\\]/, "").trim() || "file";
  // Strict ASCII token for the legacy `filename=` param — no `;` / spaces / quotes.
  const asciiName =
    baseName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 180) || "file";
  // RFC 5987: encodeURIComponent is close enough; escape chars some parsers reject in attr.
  const utf8Star = encodeURIComponent(baseName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${utf8Star}`;
}

export type PresignedGetOptions = {
  expiresInSeconds?: number;
  /** Override response Content-Disposition (signed into the URL). */
  responseContentDisposition?: string;
  /** Override response Content-Type (signed into the URL). */
  responseContentType?: string;
};

// ─── Presigned URLs (download) ────────────────────────────────────────────────

export async function getPresignedGetUrl(
  storageKey: string,
  expiresInSecondsOrOptions: number | PresignedGetOptions = 300,
): Promise<string> {
  const options: PresignedGetOptions =
    typeof expiresInSecondsOrOptions === "number"
      ? { expiresInSeconds: expiresInSecondsOrOptions }
      : expiresInSecondsOrOptions;
  const expiresIn = options.expiresInSeconds ?? 300;

  const { client, bucket } = createS3Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key:    storageKey,
    ...(options.responseContentDisposition
      ? { ResponseContentDisposition: options.responseContentDisposition }
      : {}),
    ...(options.responseContentType
      ? { ResponseContentType: options.responseContentType }
      : {}),
  });
  return getSignedUrl(client, command, { expiresIn });
}
