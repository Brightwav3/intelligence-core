export interface ModelCapabilities {
  streaming: boolean;
  tool_calling: boolean;
  structured_output: boolean;
  vision: boolean;
}

export interface Model {
  id: string;
  capabilities: ModelCapabilities;
}

export type ModelRole = "system" | "user" | "assistant" | "tool";

export interface ModelMessage {
  role: ModelRole;
  content: string;
  tool_call_id?: string;
}

export interface ModelToolDefinition {
  id: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ModelToolRequest {
  id: string;
  tool_id: string;
  arguments: Record<string, unknown>;
}

export interface ModelUsage {
  input_units?: number;
  output_units?: number;
  estimated_cost?: number;
}

export interface ModelRequest {
  provider_id: string;
  model: string;
  messages: ModelMessage[];
  tools?: ModelToolDefinition[];
}

export type ModelResponse =
  | { provider_id?: string; model?: string; type: "final"; message: ModelMessage; usage?: ModelUsage }
  | { provider_id?: string; model?: string; type: "tool_requests"; tool_requests: ModelToolRequest[]; usage?: ModelUsage };

export interface ModelProviderHealth {
  state: "healthy" | "degraded" | "unhealthy";
}

export interface ModelProvider {
  id: string;
  models(): Promise<Model[]>;
  capabilities(): Promise<ModelCapabilities>;
  health(): Promise<ModelProviderHealth>;
  generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse>;
  stream?(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelResponse>;
}
