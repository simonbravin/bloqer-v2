import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStorageEnv } from "@bloqer/config";

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

// ─── Presigned URLs ───────────────────────────────────────────────────────────

export async function getPresignedPutUrl(
  storageKey:      string,
  mimeType:        string,
  expiresInSeconds = 300,
): Promise<string> {
  const { client, bucket } = createS3Client();
  const command = new PutObjectCommand({
    Bucket:      bucket,
    Key:         storageKey,
    ContentType: mimeType,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function getPresignedGetUrl(
  storageKey:      string,
  expiresInSeconds = 300,
): Promise<string> {
  const { client, bucket } = createS3Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key:    storageKey,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}
