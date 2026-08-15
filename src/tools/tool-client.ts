/**
 * The external tool boundary.
 *
 * ADR 0005 — docs/decisions/0005-model-output-is-input-never-authority.md
 *   NullToolClient is the unconfigured default on purpose: a deployment that
 *   forgot to wire a tool client must execute nothing, not something reasonable.
 */

export interface ToolDescriptor {
  id: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolRequest {
  id: string;
  tool_id: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
}

export interface ToolClient {
  discover(): Promise<ToolDescriptor[]>;
  execute(request: ToolRequest, signal?: AbortSignal): Promise<ToolResult>;
}

export class NullToolClient implements ToolClient {
  public async discover(): Promise<ToolDescriptor[]> { return []; }
  public async execute(request: ToolRequest): Promise<ToolResult> { return { tool_call_id: request.id, content: "" }; }
}
