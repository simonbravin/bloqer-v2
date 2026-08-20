import { z } from "zod";

/** Client-generated UUID for one user intent. Opaque; not authorization. */
export const idempotencyKeySchema = z
  .string()
  .uuid("Clave de idempotencia inválida");
