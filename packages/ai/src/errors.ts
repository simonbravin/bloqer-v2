export type AiProviderErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH"
  | "RATE_LIMIT"
  | "TIMEOUT"
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
