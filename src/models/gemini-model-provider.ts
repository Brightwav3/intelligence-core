import { IntelligenceRuntimeError } from "../errors/intelligence-runtime-error.js";
import type { Model, ModelCapabilities, ModelProvider, ModelProviderHealth, ModelRequest, ModelResponse } from "./model-boundary.js";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface GeminiModelProviderOptions {
  api_key?: string;
  fetch?: Fetch;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export class GeminiModelProvider implements ModelProvider {
  public readonly id = "gemini";
  private readonly apiKey: string | undefined;
  private readonly fetchImplementation: Fetch;

  public constructor(options: GeminiModelProviderOptions = {}) {
    this.apiKey = options.api_key || process.env.GEMINI_API_KEY;
    this.fetchImplementation = options.fetch ?? fetch;
  }

  public async models(): Promise<Model[]> {
    return [{ id: "gemini-2.5-flash", capabilities: await this.capabilities() }];
  }

  public async capabilities(): Promise<ModelCapabilities> {
    return { streaming: false, tool_calling: false, structured_output: false, vision: false };
  }

  public async health(): Promise<ModelProviderHealth> {
    return { state: this.apiKey ? "healthy" : "degraded" };
  }

  public async generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    if (!this.apiKey) throw new IntelligenceRuntimeError("INVALID_CONFIGURATION", "GEMINI_API_KEY is required for the Gemini provider.", false);
    const system = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
    const contents = request.messages.filter((message) => message.role !== "system").map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
    let response: Response;
    try {
      response = await this.fetchImplementation(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents }),
        signal,
      });
    } catch (cause) {
      if (signal?.aborted) throw new IntelligenceRuntimeError("EXECUTION_CANCELLED", "Execution was cancelled.", false);
      throw new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "Gemini model request failed.", true, { provider_id: this.id });
    }
    if (!response.ok) throw new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "Gemini model request failed.", response.status >= 500, { provider_id: this.id, status: response.status });
    const payload = await response.json() as GeminiResponse;
    const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
    if (!content) throw new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "Gemini model response was invalid.", false, { provider_id: this.id });
    return {
      provider_id: this.id,
      model: request.model,
      type: "final",
      message: { role: "assistant", content },
      usage: { input_units: payload.usageMetadata?.promptTokenCount, output_units: payload.usageMetadata?.candidatesTokenCount },
    };
  }
}
