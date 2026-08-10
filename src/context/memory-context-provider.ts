export interface MemoryContextProvider {
  contextFor(requestId: string): Promise<Record<string, unknown>>;
}

export class NullMemoryContextProvider implements MemoryContextProvider {
  public async contextFor(): Promise<Record<string, unknown>> { return {}; }
}
