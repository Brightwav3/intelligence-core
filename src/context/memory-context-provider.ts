export interface MemoryContextRequest {
  request_id: string;
  subject_id: string;
  query: string;
  kinds?: string[];
  limit?: number;
  token_budget?: number;
}

export interface MemoryContextProvider {
  contextFor(request: MemoryContextRequest): Promise<Record<string, unknown>>;
}

export class NullMemoryContextProvider implements MemoryContextProvider {
  public async contextFor(): Promise<Record<string, unknown>> { return {}; }
}
