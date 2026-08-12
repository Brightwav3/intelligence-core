import { IntelligenceRuntimeError } from "../errors/intelligence-runtime-error.js";
import type { Model, ModelCapabilities, ModelProvider, ModelProviderHealth, ModelRequest, ModelResponse, ModelToolDefinition, ModelToolRequest } from "./model-boundary.js";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface GeminiModelProviderOptions {
  api_key?: string;
  fetch?: Fetch;
}

interface GeminiFunctionCall {
  name?: string;
  args?: Record<string, unknown>;
}

interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Translates normalized tool definitions into Gemini function declarations.
 *
 * The normalized `input_schema` is already JSON Schema shaped, which is what
 * Gemini expects, so the translation is a rename rather than a rewrite. Keeping
 * it that way is deliberate: the more this adapter reshapes, the more provider
 * assumptions leak back into the neutral contract.
 */
function toFunctionDeclarations(tools: ModelToolDefinition[]): Record<string, unknown> {
  return {
    function_declarations: tools.map((tool) => ({
      name: tool.id,
      description: tool.description,
      parameters: tool.input_schema,
    })),
  };
}

export class GeminiModelProvider implements ModelProvider {
  public readonly id = "gemini";
  private readonly apiKey: string | undefined;
  private readonly fetchImplementation: Fetch;
  private toolCallSequence = 0;

  public constructor(options: GeminiModelProviderOptions = {}) {
    this.apiKey = options.api_key || process.env.GEMINI_API_KEY;
    this.fetchImplementation = options.fetch ?? fetch;
  }

  public async models(): Promise<Model[]> {
    return [{ id: "gemini-2.5-flash", capabilities: await this.capabilities() }];
  }

  public async capabilities(): Promise<ModelCapabilities> {
    return { streaming: false, tool_calling: true, structured_output: false, vision: false };
  }

  public async health(): Promise<ModelProviderHealth> {
    return { state: this.apiKey ? "healthy" : "degraded" };
  }

  public async generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    if (!this.apiKey) throw new IntelligenceRuntimeError("INVALID_CONFIGURATION", "GEMINI_API_KEY is required for the Gemini provider.", false);
    const system = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
    const contents = request.messages.filter((message) => message.role !== "system").map((message) => {
      if (message.role === "tool") {
        // A tool result is a function response, not user text. Sending it as
        // text is what makes a model narrate its own tool output instead of
        // continuing the turn.
        return {
          role: "user",
          parts: [{ functionResponse: { name: message.tool_call_id ?? "tool", response: { result: message.content } } }],
        };
      }
      return {
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      };
    });
    const tools = request.tools && request.tools.length > 0 ? [toFunctionDeclarations(request.tools)] : undefined;
    let response: Response;
    try {
      response = await this.fetchImplementation(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents, ...(tools ? { tools } : {}) }),
        signal,
      });
    } catch (cause) {
      if (signal?.aborted) throw new IntelligenceRuntimeError("EXECUTION_CANCELLED", "Execution was cancelled.", false);
      throw new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "Gemini model request failed.", true, { provider_id: this.id });
    }
    if (!response.ok) throw new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "Gemini model request failed.", response.status >= 500, { provider_id: this.id, status: response.status });
    const payload = await response.json() as GeminiResponse;
    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    const usage = { input_units: payload.usageMetadata?.promptTokenCount, output_units: payload.usageMetadata?.candidatesTokenCount };

    const toolRequests: ModelToolRequest[] = parts
      .filter((part): part is GeminiPart & { functionCall: GeminiFunctionCall } => Boolean(part.functionCall?.name))
      .map((part) => ({
        // Gemini does not issue call identifiers, so the adapter mints one. The
        // action loop needs a stable id to correlate a result with its request.
        id: `gemini-call-${++this.toolCallSequence}`,
        tool_id: String(part.functionCall.name),
        arguments: part.functionCall.args ?? {},
      }));

    if (toolRequests.length > 0) {
      return { provider_id: this.id, model: request.model, type: "tool_requests", tool_requests: toolRequests, usage };
    }

    const content = parts.map((part) => part.text ?? "").join("");
    if (!content) throw new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "Gemini model response was invalid.", false, { provider_id: this.id });
    return {
      provider_id: this.id,
      model: request.model,
      type: "final",
      message: { role: "assistant", content },
      usage,
    };
  }
}
