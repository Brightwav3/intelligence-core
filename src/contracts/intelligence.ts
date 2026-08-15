/**
 * Public contracts.
 *
 * ADR 0003 — docs/decisions/0003-request-vs-execution.md
 *   Request, execution, and session identity are three separate things.
 */

export type RequestId = string;
export type ExecutionId = string;
export type SessionId = string;

export type IntelligenceInput =
  | { type: "text"; text: string }
  | { type: "structured"; value: Record<string, unknown> }
  | { type: "event"; name: string; payload?: Record<string, unknown> };

export type IntelligenceOutput =
  | { type: "text"; text: string }
  | { type: "structured"; value: Record<string, unknown> };

export interface ExecutionConstraints {
  deadline?: string;
  maximum_duration_ms?: number;
  maximum_cost?: number;
  maximum_model_calls?: number;
  maximum_tool_calls?: number;
  allowed_capabilities?: string[];
  /** Foundation-only deterministic test control. */
  delay_ms?: number;
}

/**
 * The model an execution should run on. Supplied by the runtime that admitted the work,
 * never by whatever asked for it — model selection is an operator decision, and a caller
 * that could name its own model could name an unpriced or unapproved one.
 */
export interface ModelSelection {
  provider_id?: string;
  model: string;
  /** Tried in the given order once the primary has exhausted its retries. */
  fallback_models?: string[];
}

export interface IntelligenceRequest {
  request_id: RequestId;
  input: IntelligenceInput;
  /** Overrides the action runtime's configured default for this execution only. */
  model?: ModelSelection;
  session_id?: SessionId;
  /** Correlates this execution with the conversational turn that caused it. */
  interaction_id?: string;
  metadata?: Record<string, unknown>;
  memory_context?: { subject_id?: string; kinds?: string[]; limit?: number; token_budget?: number };
  execution?: ExecutionConstraints;
}

export type ExecutionStatus = "created" | "running" | "completed" | "failed" | "cancelled";
export type RuntimeLifecycleState = "created" | "starting" | "running" | "stopping" | "stopped" | "failed";

export interface Usage {
  input_units?: number;
  output_units?: number;
  model_calls?: number;
  tool_calls?: number;
  duration_ms: number;
  estimated_cost?: number;
}

export interface IntelligenceResult {
  request_id: RequestId;
  execution_id: ExecutionId;
  status: "completed";
  outputs: IntelligenceOutput[];
  usage: Usage;
}

export interface ExecutionRecord {
  request_id: RequestId;
  execution_id: ExecutionId;
  session_id?: SessionId;
  interaction_id?: string;
  status: ExecutionStatus;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  usage?: Usage;
}

/**
 * A handle to work that has been admitted but not yet performed. Exists so a caller can
 * acknowledge immediately and correlate later: the identity is available before the
 * model runs, which a bare completion promise cannot provide.
 */
export interface AcceptedExecution {
  executionId: ExecutionId;
  record(): ExecutionRecord | undefined;
  result: Promise<IntelligenceResult>;
  cancel(): Promise<void>;
}

export interface RuntimeHealth {
  state: "healthy" | "degraded" | "unhealthy";
  components: { runtime: "healthy" | "degraded" | "unhealthy" };
}

export interface RuntimeCapabilities {
  runtime: true;
  models: boolean;
  tools: boolean;
  memory: boolean;
  agentic_execution: boolean;
}
