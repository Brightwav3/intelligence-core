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

export interface IntelligenceRequest {
  request_id: RequestId;
  input: IntelligenceInput;
  session_id?: SessionId;
  metadata?: Record<string, unknown>;
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
  status: ExecutionStatus;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  usage?: Usage;
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
