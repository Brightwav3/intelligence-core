import type { ModelRequest } from "../models/model-boundary.js";

export interface ModelRouterOptions {
  default_provider_id: string;
  fallback_provider_ids?: string[];
}

export class ModelRouter {
  public constructor(private readonly options: ModelRouterOptions) {}

  public providersFor(request: ModelRequest): string[] {
    return [...new Set([request.provider_id || this.options.default_provider_id, ...(this.options.fallback_provider_ids ?? [])])];
  }
}
