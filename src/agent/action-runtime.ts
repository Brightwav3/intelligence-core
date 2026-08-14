import type { IntelligenceRequest, IntelligenceOutput } from "../contracts/intelligence.js";
import { ContextAssembler } from "../context/context-assembler.js";
import { IntelligenceRuntimeError } from "../errors/intelligence-runtime-error.js";
import type { ModelMessage } from "../models/model-boundary.js";
import type { ModelExecutor } from "../models/model-gateway.js";
import { DenyAllPolicyClient, type PolicyClient } from "../policy/policy-client.js";
import { NullToolClient, type ToolClient, type ToolRequest } from "../tools/tool-client.js";

export interface ActionRuntimeOptions {
  models: ModelExecutor;
  provider_id: string;
  model: string;
  context?: ContextAssembler;
  tools?: ToolClient;
  policy?: PolicyClient;
  maximum_iterations?: number;
}

export interface ActionResult {
  output: IntelligenceOutput;
  iterations: number;
  tool_calls: number;
}

export class ActionRuntime {
  private readonly context: ContextAssembler;
  private readonly tools: ToolClient;
  private readonly policy: PolicyClient;
  private readonly maximumIterations: number;

  public constructor(private readonly options: ActionRuntimeOptions) {
    this.context = options.context ?? new ContextAssembler();
    this.tools = options.tools ?? new NullToolClient();
    this.policy = options.policy ?? new DenyAllPolicyClient();
    this.maximumIterations = options.maximum_iterations ?? 8;
  }

  public async execute(request: IntelligenceRequest, signal?: AbortSignal): Promise<ActionResult> {
    const tools = await this.tools.discover();
    const context = await this.context.assemble(request);
    const messages: ModelMessage[] = [...context.messages];
    let toolCalls = 0;
    for (let iteration = 1; iteration <= this.maximumIterations; iteration++) {
      const response = await this.options.models.generate({ provider_id: this.options.provider_id, model: this.options.model, messages, tools }, signal);
      if (response.type === "final") return { output: { type: "text", text: response.message.content }, iterations: iteration, tool_calls: toolCalls };
      // Record what the model asked for before recording the answers. A provider that
      // pairs calls with responses cannot do so if the request turn is missing.
      messages.push({ role: "assistant", content: "", tool_calls: response.tool_requests });
      for (const toolRequest of response.tool_requests) {
        const descriptor = tools.find((tool) => tool.id === toolRequest.tool_id);
        if (!descriptor) throw new IntelligenceRuntimeError("TOOL_NOT_FOUND", "Requested tool was not found.", false, { tool_id: toolRequest.tool_id });
        const requestForTool: ToolRequest = { id: toolRequest.id, tool_id: toolRequest.tool_id, arguments: toolRequest.arguments };
        const decision = await this.policy.evaluate(requestForTool);
        if (decision.decision !== "allow") throw new IntelligenceRuntimeError("TOOL_ACTION_DENIED", "Tool action was not authorized.", false, { tool_id: toolRequest.tool_id, decision: decision.decision });
        const result = await this.tools.execute(requestForTool, signal);
        messages.push({ role: "tool", tool_call_id: result.tool_call_id, content: result.content });
        toolCalls++;
      }
    }
    throw new IntelligenceRuntimeError("ACTION_LIMIT_EXCEEDED", "Action iteration limit was exceeded.", false, { maximum_iterations: this.maximumIterations });
  }
}
