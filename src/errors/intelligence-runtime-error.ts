export type IntelligenceErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONFIGURATION"
  | "EXECUTION_NOT_FOUND"
  | "EXECUTION_CANCELLED"
  | "EXECUTION_DEADLINE_EXCEEDED"
  | "EXECUTION_FAILED"
  | "MODEL_PROVIDER_NOT_FOUND"
  | "MODEL_PROVIDER_FAILED"
  | "MODEL_REQUEST_INVALID"
  | "TOOL_ACTION_DENIED"
  | "TOOL_NOT_FOUND"
  | "ACTION_LIMIT_EXCEEDED"
  | "MODEL_BUDGET_EXCEEDED"
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
