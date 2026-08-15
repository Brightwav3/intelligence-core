/**
 * Deterministic provider for tests.
 *
 * ADR 0004 — docs/decisions/0004-provider-independence.md
 *   Exists so the whole path runs with no credentials and no network.
 */

import { IntelligenceRuntimeError } from "../errors/intelligence-runtime-error.js";
import type { Model, ModelCapabilities, ModelProvider, ModelProviderHealth, ModelRequest, ModelResponse } from "./model-boundary.js";

export interface FakeModelProviderOptions {
  id?: string;
  responses?: ModelResponse[];
  delay_ms?: number;
}

const wait = (duration: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new IntelligenceRuntimeError("EXECUTION_CANCELLED", "Execution was cancelled.", false));
  const timeout = setTimeout(resolve, duration);
  signal?.addEventListener("abort", () => {
    clearTimeout(timeout);
    reject(new IntelligenceRuntimeError("EXECUTION_CANCELLED", "Execution was cancelled.", false));
  }, { once: true });
});

export class FakeModelProvider implements ModelProvider {
  public readonly id: string;
  private readonly responses: ModelResponse[];
  private readonly delay: number;

  public constructor(options: FakeModelProviderOptions = {}) {
    this.id = options.id ?? "fake";
    this.responses = [...(options.responses ?? [])];
    this.delay = options.delay_ms ?? 0;
  }

  public async models(): Promise<Model[]> {
    return [{ id: "fake-1", capabilities: await this.capabilities() }];
  }

  public async capabilities(): Promise<ModelCapabilities> {
    return { streaming: false, tool_calling: true, structured_output: true, vision: false };
  }

  public async health(): Promise<ModelProviderHealth> { return { state: "healthy" }; }

  public async generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    if (this.delay > 0) await wait(this.delay, signal);
    if (signal?.aborted) throw new IntelligenceRuntimeError("EXECUTION_CANCELLED", "Execution was cancelled.", false);
    const response = this.responses.shift();
    if (!response) throw new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "Fake provider has no queued response.", false);
    return { ...response, provider_id: this.id, model: request.model };
  }
}
