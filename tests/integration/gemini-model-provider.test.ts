import assert from "node:assert/strict";
import test from "node:test";

import { GeminiModelProvider, IntelligenceRuntimeError } from "../../src/index.js";

test("converts normalized messages to a Gemini REST request and response", async () => {
  let requestedUrl = "";
  let requestedBody: unknown;
  const provider = new GeminiModelProvider({
    api_key: "test-key",
    fetch: async (url, init) => {
      requestedUrl = String(url);
      requestedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "hello from Gemini" }] } }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 },
      }), { status: 200 });
    },
  });

  const response = await provider.generate({
    provider_id: "gemini",
    model: "gemini-test",
    messages: [
      { role: "system", content: "Be concise" },
      { role: "user", content: "Hello" },
    ],
  });

  assert.match(requestedUrl, /models\/gemini-test:generateContent\?key=test-key$/);
  assert.deepEqual(requestedBody, {
    systemInstruction: { parts: [{ text: "Be concise" }] },
    contents: [{ role: "user", parts: [{ text: "Hello" }] }],
  });
  assert.deepEqual(response, {
    provider_id: "gemini",
    model: "gemini-test",
    type: "final",
    message: { role: "assistant", content: "hello from Gemini" },
    usage: { input_units: 3, output_units: 4 },
  });
});

test("does not leak an HTTP provider response into its error", async () => {
  const provider = new GeminiModelProvider({
    api_key: "test-key",
    fetch: async () => new Response("upstream secret", { status: 500 }),
  });

  await assert.rejects(
    provider.generate({ provider_id: "gemini", model: "gemini-test", messages: [{ role: "user", content: "Hello" }] }),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "MODEL_PROVIDER_FAILED" && error.retryable === true && error.message === "Gemini model request failed.",
  );
});

test("requires an API key only when a real Gemini call is attempted", async () => {
  const provider = new GeminiModelProvider({ api_key: "" });

  await assert.rejects(
    provider.generate({ provider_id: "gemini", model: "gemini-test", messages: [{ role: "user", content: "Hello" }] }),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "INVALID_CONFIGURATION",
  );
});
