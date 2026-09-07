export type AiProviderErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "CANCELLED"
  | "UNSUPPORTED"
  | "BAD_REQUEST"
  | "PROVIDER"
  | "UNKNOWN";

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly providerId: string;
  readonly retryable: boolean;

  constructor(
    code: AiProviderErrorCode,
    message: string,
    opts?: { providerId?: string; retryable?: boolean; cause?: unknown },
  ) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "AiProviderError";
    this.code = code;
    this.providerId = opts?.providerId ?? "unknown";
    this.retryable = opts?.retryable ?? false;
  }
}

/** User-facing Spanish — never vendor English / HTTP payloads. Shared by all providers. */
export function userFacingAiProviderErrorMessage(code: AiProviderErrorCode): string {
  switch (code) {
    case "AUTH":
      return "El proveedor de AI rechazó las credenciales. Revisá la configuración.";
    case "RATE_LIMIT":
      return "El proveedor de AI está saturado. Probá de nuevo en unos minutos.";
    case "NOT_CONFIGURED":
      return "Bloqer AI no está configurado correctamente.";
    case "TIMEOUT":
      return "La consulta tardó demasiado y se canceló.";
    case "CANCELLED":
      return "Consulta cancelada.";
    case "UNSUPPORTED":
      return "El proveedor seleccionado no soporta esta operación.";
    case "BAD_REQUEST":
    case "PROVIDER":
    case "UNKNOWN":
    default:
      return "No pude completar la consulta en este momento. Intentá nuevamente.";
  }
}

/** @deprecated Prefer userFacingAiProviderErrorMessage — kept for existing imports. */
export const userFacingOpenAiErrorMessage = userFacingAiProviderErrorMessage;
