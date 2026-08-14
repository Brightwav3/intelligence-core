import { IntelligenceRuntimeError } from "../errors/intelligence-runtime-error.js";
import type { Model, ModelCapabilities, ModelProvider, ModelProviderHealth, ModelRequest, ModelResponse, ModelToolDefinition, ModelToolRequest, ModelUsage } from "./model-boundary.js";

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
  /**
   * Gemini 3.x reasoning token for a function call. It must be echoed back with the call
   * or the next turn is rejected outright; it is carried through the neutral contract as
   * opaque provider context so the name stays in this file.
   */
  thoughtSignature?: string;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
}

/**
 * Maps Gemini's native counters onto the neutral dimensions. The SDK field names stop
 * here by design. `input_units`/`output_units` are emitted as exact aliases for callers
 * that predate the token fields — the same number twice, never two sources — and a
 * response with no `usageMetadata` is reported as unknown so it cannot be summed as
 * a free call.
 */
function toModelUsage(metadata: GeminiResponse["usageMetadata"]): ModelUsage {
  if (!metadata) return { usage_source: "unknown" };
  const input = metadata.promptTokenCount;
  const output = metadata.candidatesTokenCount;
  const known = [input, output, metadata.cachedContentTokenCount, metadata.thoughtsTokenCount, metadata.totalTokenCount].some((value) => value !== undefined);
  return {
    ...(input !== undefined ? { input_tokens: input, input_units: input } : {}),
    ...(output !== undefined ? { output_tokens: output, output_units: output } : {}),
    ...(metadata.cachedContentTokenCount !== undefined ? { cached_input_tokens: metadata.cachedContentTokenCount } : {}),
    ...(metadata.thoughtsTokenCount !== undefined ? { reasoning_tokens: metadata.thoughtsTokenCount } : {}),
    ...(metadata.totalTokenCount !== undefined ? { total_tokens: metadata.totalTokenCount } : {}),
    usage_source: known ? "provider" : "unknown",
  };
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

/**
 * How long the provider asked us to wait. Read from the standard `retry-after` header
 * first, then from the RetryInfo the API returns in the error body. Only the delay is
 * taken from the body — the message itself is not propagated.
 */
async function retryDelayMs(response: Response): Promise<number | undefined> {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number.parseFloat(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  }
  try {
    const body = await response.clone().text();
    const match = body.match(/"retryDelay"\s*:\s*"([\d.]+)s"/) ?? body.match(/retry in ([\d.]+)s/i);
    const seconds = match ? Number.parseFloat(match[1]!) : Number.NaN;
    return Number.isFinite(seconds) ? Math.round(seconds * 1_000) : undefined;
  } catch {
    return undefined;
  }
}

export class GeminiModelProvider implements ModelProvider {
  public readonly id = "gemini";
  private readonly apiKey: string | undefined;
  private readonly fetchImplementation: Fetch;
  private toolCallSequence = 0;
  /** Gemini issues no call identifiers, so this adapter mints them and must remember what each one meant. */
  private readonly toolNamesByCallId = new Map<string, string>();

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
        //
        // The name must be the *function's* name, not the call id this adapter minted.
        // Gemini pairs a response to a call by name; given an unknown name it treats the
        // call as still unanswered and asks again, which loops until the iteration limit.
        const name = (message.tool_call_id ? this.toolNamesByCallId.get(message.tool_call_id) : undefined) ?? message.tool_call_id ?? "tool";
        return {
          role: "user",
          parts: [{ functionResponse: { name, response: { result: message.content } } }],
        };
      }
      if (message.role === "assistant" && message.tool_calls?.length) {
        // Echo the model's own call turn back, so the following response has something
        // to answer.
        return {
          role: "model",
          parts: message.tool_calls.map((call) => {
            const signature = call.provider_context?.thoughtSignature;
            return {
              functionCall: { name: call.tool_id, args: call.arguments },
              ...(typeof signature === "string" ? { thoughtSignature: signature } : {}),
            };
          }),
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
    if (!response.ok) {
      // 429 is a wait, not a refusal. Treating it as terminal turns a few seconds of
      // backoff into a failed request the user experiences as the feature being broken.
      const retryable = response.status === 429 || response.status >= 500;
      const retryAfterMs = retryable ? await retryDelayMs(response) : undefined;
      throw new IntelligenceRuntimeError(
        "MODEL_PROVIDER_FAILED",
        response.status === 429 ? "Gemini rejected the request: quota or rate limit exceeded." : "Gemini model request failed.",
        retryable,
        { provider_id: this.id, status: response.status, ...(retryAfterMs === undefined ? {} : { retry_after_ms: retryAfterMs }) },
      );
    }
    const payload = await response.json() as GeminiResponse;
    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    const usage = toModelUsage(payload.usageMetadata);

    const toolRequests: ModelToolRequest[] = parts
      .filter((part): part is GeminiPart & { functionCall: GeminiFunctionCall } => Boolean(part.functionCall?.name))
      .map((part) => {
        // Gemini does not issue call identifiers, so the adapter mints one. The
        // action loop needs a stable id to correlate a result with its request.
        const id = `gemini-call-${++this.toolCallSequence}`;
        const toolId = String(part.functionCall.name);
        this.toolNamesByCallId.set(id, toolId);
        return {
          id,
          tool_id: toolId,
          arguments: part.functionCall.args ?? {},
          ...(part.thoughtSignature ? { provider_context: { thoughtSignature: part.thoughtSignature } } : {}),
        };
      });

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
