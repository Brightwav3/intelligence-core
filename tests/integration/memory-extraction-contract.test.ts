import assert from "node:assert/strict";
import test from "node:test";
import { DeterministicMemoryExtractor, type MemoryCandidate, type MemoryExtractionInput } from "../../src/index.js";

test("memory candidates carry provider-neutral evidence and policy disposition", async () => {
  const candidate: MemoryCandidate = {
    candidateId: "candidate-1",
    disposition: "confirm",
    kind: "preference",
    subjectId: "user-1",
    key: "response_style",
    content: { type: "text", text: "User prefers concise answers" },
    confidence: 0.86,
    evidence: [{ sourceType: "turn", sourceId: "turn-4" }],
    reason: "The user stated a persistent response preference.",
  };
  assert.equal(candidate.disposition, "confirm");
  assert.equal(candidate.subjectId, "user-1");
  assert.equal(candidate.evidence[0]?.sourceType, "turn");
  assert.ok(candidate.reason.length > 0);
});

test("deterministic extractor is offline and returns no candidates by default", async () => {
  const input: MemoryExtractionInput = { subjectId: "user-1", sessionId: "session-1", turns: [{ turnId: "turn-1", speaker: "user", text: "Remember this" }] };
  assert.deepEqual(await new DeterministicMemoryExtractor().extract(input), []);
});
