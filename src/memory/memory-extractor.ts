import type { MemoryCandidate, MemoryExtractionInput } from "./extraction-contracts.js";

export interface MemoryExtractor {
  extract(input: MemoryExtractionInput, signal?: AbortSignal): Promise<MemoryCandidate[]>;
}

export class DeterministicMemoryExtractor implements MemoryExtractor {
  public async extract(_input: MemoryExtractionInput, signal?: AbortSignal): Promise<MemoryCandidate[]> {
    if (signal?.aborted) throw new Error("Memory extraction was cancelled");
    return [];
  }
}
