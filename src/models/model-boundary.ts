export interface ModelCapabilities {
  streaming: boolean;
  tool_calling: boolean;
  structured_output: boolean;
  vision: boolean;
}

export interface Model {
  id: string;
  capabilities: ModelCapabilities;
}

export interface ModelProvider {
  id: string;
  models(): Promise<Model[]>;
}
