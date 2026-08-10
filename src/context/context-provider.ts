import type { IntelligenceRequest } from "../contracts/intelligence.js";
import type { ModelMessage } from "../models/model-boundary.js";

export interface ContextProvider {
  id: string;
  contextFor(request: IntelligenceRequest): Promise<ModelMessage[]>;
}
