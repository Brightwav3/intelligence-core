import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryUsageMeter, PriceCatalog, normalizeModelUsage, type ModelPriceEntry, type UsageRecord } from "../../src/index.js";

const price: ModelPriceEntry = {
  provider_id: "gemini",
  model_pattern: "gemini-2.5-flash",
  currency: "USD",
  input_per_million: 1,
  output_per_million: 2,
  effective_from: "2026-01-01T00:00:00.000Z",
  catalog_version: "2026-01",
};

const record = (overrides: Partial<UsageRecord> = {}): UsageRecord => ({
  schema: "usage.record.v1",
  record_id: "rec-1",
  occurred_at: "2026-08-14T12:00:00.000Z",
  call_id: "call-1",
  attempt: 1,
  provider_id: "gemini",
  model: "gemini-2.5-flash",
  operation: "chat",
  role: "delegation",
  outcome: "completed",
  dimensions: { input_tokens: 1_000_000, output_tokens: 500_000 },
  model_calls: 1,
  tool_calls: 0,
  retry_count: 0,
  latency_ms: 100,
  usage_source: "provider",
  redacted: true,
  ...overrides,
});

const meter = () => new InMemoryUsageMeter({ catalog: new PriceCatalog({ entries: [price] }) });
const window = { from: "2026-08-14T00:00:00.000Z", to: "2026-08-15T00:00:00.000Z" };

test("provider token usage is normalized and the legacy aliases stay exact", () => {
  const normalized = normalizeModelUsage({ input_units: 120, output_units: 45 });
  assert.equal(normalized.dimensions.input_tokens, 120);
  assert.equal(normalized.dimensions.output_tokens, 45);
  assert.equal(normalized.usage_source, "provider");

  const canonical = normalizeModelUsage({ input_tokens: 7, output_tokens: 3, cached_input_tokens: 2, reasoning_tokens: 5, total_tokens: 17, usage_source: "provider" });
  assert.deepEqual(canonical.dimensions, { input_tokens: 7, output_tokens: 3, cached_input_tokens: 2, reasoning_tokens: 5, total_tokens: 17 });
});

test("a provider that reports no usage yields unknown, never zero", () => {
  const normalized = normalizeModelUsage(undefined);
  assert.equal(normalized.usage_source, "unknown");
  assert.deepEqual(normalized.dimensions, {});
  assert.equal(normalized.dimensions.input_tokens, undefined);
  assert.notEqual(normalized.dimensions.input_tokens, 0);
});

test("summaries group by provider, model, operation, and role", () => {
  const usage = meter();
  usage.record(record({ record_id: "a" }));
  usage.record(record({ record_id: "b", role: "voice", operation: "realtime", dimensions: { input_audio_seconds: 30 } }));
  const summaries = usage.summarize({ ...window, groupBy: ["provider_id", "model", "operation", "role"] });
  assert.equal(summaries.length, 2);
  const delegation = summaries.find((entry) => entry.group.role === "delegation");
  assert.equal(delegation?.group.provider_id, "gemini");
  assert.equal(delegation?.group.operation, "chat");
  assert.equal(delegation?.calls, 1);
  const voice = summaries.find((entry) => entry.group.role === "voice");
  assert.equal(voice?.dimensions.input_audio_seconds, 30);
});

test("outcomes are counted separately so a failure is never read as a success", () => {
  const usage = meter();
  usage.record(record({ record_id: "a", outcome: "completed" }));
  usage.record(record({ record_id: "b", outcome: "failed" }));
  usage.record(record({ record_id: "c", outcome: "cancelled" }));
  usage.record(record({ record_id: "d", outcome: "timeout" }));
  const [summary] = usage.summarize({ ...window, groupBy: ["provider_id"] });
  assert.equal(summary?.calls, 4);
  assert.equal(summary?.successful_calls, 1);
  assert.equal(summary?.failed_calls, 1);
  assert.equal(summary?.cancelled_calls, 1);
});

test("a failed call that still returned billable usage keeps that usage", () => {
  const usage = meter();
  usage.record(record({ outcome: "failed", dimensions: { input_tokens: 1_000_000 } }));
  const [summary] = usage.summarize({ ...window, groupBy: ["model"] });
  assert.equal(summary?.dimensions.input_tokens, 1_000_000);
  assert.equal(summary?.cost.total_cost, 1);
});

test("each retry attempt is a separate billable record while logical calls stay distinguishable", () => {
  const usage = meter();
  usage.record(record({ record_id: "a", call_id: "call-1", attempt: 1, outcome: "failed", retry_count: 0 }));
  usage.record(record({ record_id: "b", call_id: "call-1", attempt: 2, outcome: "completed", retry_count: 1 }));
  const [summary] = usage.summarize({ ...window, groupBy: ["model"] });
  assert.equal(summary?.calls, 2, "physical attempts");
  assert.equal(summary?.logical_calls, 1, "one logical call behind both attempts");
  assert.equal(summary?.retries, 1);
  assert.equal(summary?.dimensions.input_tokens, 2_000_000, "both attempts consumed tokens");
});

test("unknown usage is excluded from totals but visible as an unknown count", () => {
  const usage = meter();
  usage.record(record({ record_id: "a", dimensions: { input_tokens: 1_000_000 }, usage_source: "provider" }));
  usage.record(record({ record_id: "b", dimensions: {}, usage_source: "unknown" }));
  const [summary] = usage.summarize({ ...window, groupBy: ["model"] });
  assert.equal(summary?.dimensions.input_tokens, 1_000_000);
  assert.equal(summary?.unknown_usage_calls, 1);
  assert.equal(summary?.cost.unknown_cost_calls, 1);
});

test("records outside the window are excluded", () => {
  const usage = meter();
  usage.record(record({ record_id: "old", occurred_at: "2026-08-01T00:00:00.000Z" }));
  usage.record(record({ record_id: "now" }));
  const [summary] = usage.summarize({ ...window, groupBy: ["model"] });
  assert.equal(summary?.calls, 1);
});

test("latency is summarized with count, average, p50, p95, and max", () => {
  const usage = meter();
  for (const latency of [10, 20, 30, 40, 1_000]) usage.record(record({ record_id: `r-${latency}`, latency_ms: latency }));
  const [summary] = usage.summarize({ ...window, groupBy: ["model"] });
  assert.equal(summary?.latency_ms.count, 5);
  assert.equal(summary?.latency_ms.max, 1_000);
  assert.equal(summary?.latency_ms.p50, 30);
  assert.equal(summary?.latency_ms.p95, 1_000);
  assert.equal(summary?.latency_ms.average, 220);
});

test("tool calls are aggregated without being confused with model calls", () => {
  const usage = meter();
  usage.record(record({ record_id: "a", model_calls: 1, tool_calls: 3 }));
  usage.record(record({ record_id: "b", model_calls: 1, tool_calls: 2 }));
  const [summary] = usage.summarize({ ...window, groupBy: ["model"] });
  assert.equal(summary?.tool_calls, 5);
});

test("correlation identifiers survive on the stored record", () => {
  const usage = meter();
  usage.record(record({ request_id: "req-1", session_id: "sess-1", interaction_id: "int-1", execution_id: "exec-1" }));
  const [stored] = usage.records();
  assert.equal(stored?.request_id, "req-1");
  assert.equal(stored?.session_id, "sess-1");
  assert.equal(stored?.interaction_id, "int-1");
  assert.equal(stored?.execution_id, "exec-1");
  assert.equal(stored?.redacted, true);
});

test("the meter refuses a record carrying prompt, completion, or credential content", () => {
  const usage = meter();
  assert.throws(() => usage.record({ ...record(), prompt: "tajne heslo" } as unknown as UsageRecord), /redact/i);
  assert.throws(() => usage.record({ ...record(), api_key: "secret" } as unknown as UsageRecord), /redact/i);
});

test("the in-memory sink stays bounded and keeps the newest records", () => {
  const usage = new InMemoryUsageMeter({ catalog: new PriceCatalog({ entries: [price] }), maxRecords: 3 });
  for (let index = 0; index < 10; index += 1) usage.record(record({ record_id: `r-${index}` }));
  assert.equal(usage.records().length, 3);
  assert.equal(usage.records().at(-1)?.record_id, "r-9");
});

test("forecast scales observed per-call cost and labels the scenario source", () => {
  const usage = meter();
  for (let index = 0; index < 4; index += 1) usage.record(record({ record_id: `r-${index}`, dimensions: { input_tokens: 1_000_000 } }));
  const forecast = usage.forecast({ ...window, projectedCalls: 100, scenario: "average" });
  assert.equal(forecast.status, "estimated");
  assert.equal(forecast.currency, "USD");
  assert.equal(forecast.total_cost, 100);
});

test("p95 forecasts are at least as expensive as p50 forecasts", () => {
  const usage = meter();
  for (const tokens of [1_000_000, 1_000_000, 1_000_000, 10_000_000]) {
    usage.record(record({ record_id: `r-${tokens}-${Math.round(tokens / 7)}`, dimensions: { input_tokens: tokens } }));
  }
  const p50 = usage.forecast({ ...window, projectedCalls: 10, scenario: "p50" });
  const p95 = usage.forecast({ ...window, projectedCalls: 10, scenario: "p95" });
  assert.ok((p95.total_cost ?? 0) >= (p50.total_cost ?? 0));
  assert.equal(p50.total_cost, 10);
});

test("a forecast with no priced history is unavailable rather than zero", () => {
  const usage = new InMemoryUsageMeter({ catalog: new PriceCatalog({ entries: [] }) });
  usage.record(record());
  const forecast = usage.forecast({ ...window, projectedCalls: 100 });
  assert.equal(forecast.status, "unavailable");
  assert.equal(forecast.total_cost, undefined);
  assert.equal(forecast.unknown_cost_calls, 1);
});

test("a forecast spanning two currencies refuses to merge them implicitly", () => {
  const usage = new InMemoryUsageMeter({ catalog: new PriceCatalog({ entries: [price, { ...price, provider_id: "other", model_pattern: "other-model", currency: "EUR" }] }) });
  usage.record(record({ record_id: "a" }));
  usage.record(record({ record_id: "b", provider_id: "other", model: "other-model" }));
  assert.throws(() => usage.forecast({ ...window, projectedCalls: 10 }), /currenc/i);
});

test("flush resolves and leaves the meter usable", async () => {
  const usage = meter();
  usage.record(record());
  await usage.flush();
  assert.equal(usage.records().length, 1);
});
