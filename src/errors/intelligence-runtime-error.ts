export type IntelligenceErrorCode =
  | "INVALID_REQUEST"
  | "EXECUTION_NOT_FOUND"
  | "EXECUTION_CANCELLED"
  | "EXECUTION_FAILED"
  | "INVALID_STATE"
  | "INTERNAL_ERROR";

export class IntelligenceRuntimeError extends Error {
  public readonly name = "IntelligenceRuntimeError";

  public constructor(
    public readonly code: IntelligenceErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
  }
}
