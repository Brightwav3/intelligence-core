import type { IntelligenceRequest } from "../contracts/intelligence.js";

export const memoryKinds = ["fact", "preference", "person", "project", "decision", "event", "summary", "instructional"] as const;
export type MemoryKind = typeof memoryKinds[number];
export type MemoryContent = { type: "text"; text: string } | { type: "structured"; value: Record<string, unknown> };
export type MemoryCandidateDisposition = "store" | "confirm" | "episode_only" | "discard";

export interface MemoryExtractionTurn {
  turnId: string;
  speaker: "user" | "assistant" | "tool" | "system";
  text: string;
  status?: "complete" | "partial" | "interrupted";
  /**
   * How far the text can be trusted as what was actually said. An `unreliable`
   * transcript is still context, but it is not evidence — nothing durable may be
   * stored on its authority alone.
   */
  transcriptConfidence?: "reliable" | "unreliable";
}

export interface MemoryExtractionInput {
  subjectId: string;
  sessionId?: string;
  turns: MemoryExtractionTurn[];
  request?: IntelligenceRequest;
}

export interface MemoryCandidate {
  candidateId: string;
  disposition: MemoryCandidateDisposition;
  kind: MemoryKind;
  subjectId: string;
  key?: string;
  content: MemoryContent;
  confidence: number;
  evidence: Array<{ sourceType: "turn" | "session" | "user"; sourceId: string }>;
  reason: string;
}
