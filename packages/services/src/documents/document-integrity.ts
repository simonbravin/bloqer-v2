import { createHash } from "node:crypto";
import { ServiceError } from "../types";

/** Legacy rows without a checksum can prove size only, never original-byte identity. */
export function verifyDocumentBytes(body: Buffer, sizeBytes: number, contentSha256: string | null): boolean {
  if (body.length !== sizeBytes || body.length > 50 * 1024 * 1024 || sizeBytes <= 0) {
    throw new ServiceError("CONFLICT", "El tamaño del archivo almacenado no coincide");
  }
  if (!contentSha256) return false;
  if (!/^[a-f0-9]{64}$/i.test(contentSha256) || createHash("sha256").update(body).digest("hex") !== contentSha256.toLowerCase()) {
    throw new ServiceError("CONFLICT", "El contenido del archivo no coincide con la huella registrada. Conservá tu original y solicitá una revisión.");
  }
  return true;
}
