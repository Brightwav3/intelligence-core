import { IntelligenceRuntimeError } from "../errors/intelligence-runtime-error.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "./model-boundary.js";

export interface ModelExecutor {
  generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse>;
}

export class ModelGateway implements ModelExecutor {
  private readonly providers = new Map<string, ModelProvider>();

  public register(provider: ModelProvider): void { this.providers.set(provider.id, provider); }

  public providerIds(): string[] { return [...this.providers.keys()]; }

  public async generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    const provider = this.providers.get(request.provider_id);
    if (!provider) {
      throw new IntelligenceRuntimeError("MODEL_PROVIDER_NOT_FOUND", "Model provider was not found.", false, { provider_id: request.provider_id });
    }
    if (signal?.aborted) throw new IntelligenceRuntimeError("EXECUTION_CANCELLED", "Execution was cancelled.", false);
    try {
      const response = await provider.generate(request, signal);
      return { ...response, provider_id: provider.id, model: request.model };
    } catch (cause) {
      if (cause instanceof IntelligenceRuntimeError) throw cause;
      throw new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "Model provider failed.", true, { provider_id: provider.id });
    }
  }
}
