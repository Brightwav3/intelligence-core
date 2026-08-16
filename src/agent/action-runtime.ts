/**
 * The action loop.
 *
 * ADR 0005 — docs/decisions/0005-model-output-is-input-never-authority.md
 *   A model's tool request is input to a decision, never the decision. It is
 *   validated, bounded by `maximum_iterations`, submitted to an external
 *   PolicyClient, and only then executed through an external ToolClient. The
 *   model's input includes content the user did not write.
 */

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
    const maximumToolCalls = request.execution?.maximum_tool_calls;
    const discoveredTools = await this.tools.discover();
    // A zero budget is also a capability boundary: do not advertise tools and then hope
    // the model chooses not to call them. Compaction uses this to stay a pure transform.
    const tools = maximumToolCalls === 0 ? [] : discoveredTools;
    const context = await this.context.assemble(request);
    const messages: ModelMessage[] = [...context.messages];
    let toolCalls = 0;
    // The request may carry the runtime's choice for this execution; the constructor
    // values are the default, not an override of it.
    const providerId = request.model?.provider_id ?? this.options.provider_id;
    const model = request.model?.model ?? this.options.model;
    const fallbackModels = request.model?.fallback_models ?? [];
    const maximumModelCalls = Math.min(this.maximumIterations, request.execution?.maximum_model_calls ?? this.maximumIterations);
    for (let iteration = 1; iteration <= maximumModelCalls; iteration++) {
      const response = await this.options.models.generate({
        provider_id: providerId,
        model,
        // Every iteration may escalate independently: a mid-conversation failure on the
        // primary must not force the whole loop to restart on the fallback.
        ...(fallbackModels.length ? { fallback_models: fallbackModels } : {}),
        messages,
        tools,
      }, signal);
      if (response.type === "final") return { output: { type: "text", text: response.message.content }, iterations: iteration, tool_calls: toolCalls };
      // Record what the model asked for before recording the answers. A provider that
      // pairs calls with responses cannot do so if the request turn is missing.
      messages.push({ role: "assistant", content: "", tool_calls: response.tool_requests });
      if (maximumToolCalls !== undefined && toolCalls + response.tool_requests.length > maximumToolCalls) {
        throw new IntelligenceRuntimeError("ACTION_LIMIT_EXCEEDED", "Tool call limit was exceeded.", false, { maximum_tool_calls: maximumToolCalls });
      }
      for (const toolRequest of response.tool_requests) {
        const descriptor = tools.find((tool) => tool.id === toolRequest.tool_id);
        if (!descriptor) throw new IntelligenceRuntimeError("TOOL_NOT_FOUND", "Requested tool was not found.", false, { tool_id: toolRequest.tool_id });
        // Ecosystem ADR 0003 — 0003-delegation-tool-failures-remain-failed.md: the parent
        // request lets the composing runtime associate a tool failure with its delegation.
        const requestForTool: ToolRequest = { id: toolRequest.id, tool_id: toolRequest.tool_id, arguments: toolRequest.arguments, request_id: request.request_id };
        const decision = await this.policy.evaluate(requestForTool);
        if (decision.decision !== "allow") throw new IntelligenceRuntimeError("TOOL_ACTION_DENIED", "Tool action was not authorized.", false, { tool_id: toolRequest.tool_id, decision: decision.decision });
        const result = await this.tools.execute(requestForTool, signal);
        messages.push({ role: "tool", tool_call_id: result.tool_call_id, content: result.content });
        toolCalls++;
      }
    }
    throw new IntelligenceRuntimeError("ACTION_LIMIT_EXCEEDED", "Action iteration limit was exceeded.", false, { maximum_iterations: maximumModelCalls });
  }
}
