import assert from "node:assert/strict";
import test from "node:test";
import { PriceCatalog, type ModelPriceEntry } from "../../src/index.js";

const entry = (overrides: Partial<ModelPriceEntry> = {}): ModelPriceEntry => ({
  provider_id: "gemini",
  model_pattern: "gemini-2.5-flash",
  currency: "USD",
  input_per_million: 0.3,
  output_per_million: 2.5,
  effective_from: "2026-01-01T00:00:00.000Z",
  catalog_version: "2026-01",
  ...overrides,
});

const at = "2026-08-14T12:00:00.000Z";

test("cost is computed from dimensions and stamped with catalog version and effective time", () => {
  const catalog = new PriceCatalog({ entries: [entry()] });
  const cost = catalog.estimate({ provider_id: "gemini", model: "gemini-2.5-flash", at, dimensions: { input_tokens: 1_000_000, output_tokens: 200_000 } });
  assert.equal(cost.status, "estimated");
  assert.equal(cost.currency, "USD");
  assert.equal(cost.input_cost, 0.3);
  assert.equal(cost.output_cost, 0.5);
  assert.equal(cost.total_cost, 0.8);
  assert.equal(cost.price_catalog_version, "2026-01");
  assert.equal(cost.price_effective_at, "2026-01-01T00:00:00.000Z");
});

test("cached and reasoning tokens are priced separately from plain input and output", () => {
  const catalog = new PriceCatalog({ entries: [entry({ cached_input_per_million: 0.075, reasoning_per_million: 5 })] });
  const cost = catalog.estimate({ provider_id: "gemini", model: "gemini-2.5-flash", at, dimensions: { input_tokens: 1_000_000, cached_input_tokens: 1_000_000, reasoning_tokens: 1_000_000 } });
  assert.equal(cost.cached_input_cost, 0.075);
  assert.equal(cost.reasoning_cost, 5);
  assert.equal(cost.total_cost, 5.375);
});

test("audio minutes and per-request charges are priced for non-token models", () => {
  const catalog = new PriceCatalog({ entries: [entry({ model_pattern: "gemini-*-live-*", input_audio_per_minute: 0.06, output_audio_per_minute: 0.24, per_request: 0.001, input_per_million: undefined, output_per_million: undefined })] });
  const cost = catalog.estimate({ provider_id: "gemini", model: "gemini-3.1-flash-live-preview", at, dimensions: { input_audio_seconds: 60, output_audio_seconds: 30 } });
  assert.equal(cost.status, "estimated");
  assert.equal(cost.modality_cost, 0.18);
  assert.equal(cost.total_cost, 0.181);
});

test("an exact model wins over a wildcard pattern", () => {
  const catalog = new PriceCatalog({ entries: [entry({ model_pattern: "gemini-*", input_per_million: 99 }), entry()] });
  const cost = catalog.estimate({ provider_id: "gemini", model: "gemini-2.5-flash", at, dimensions: { input_tokens: 1_000_000 } });
  assert.equal(cost.input_cost, 0.3);
});

test("the newest entry effective at or before the call time is used", () => {
  const catalog = new PriceCatalog({ entries: [
    entry({ input_per_million: 0.3, effective_from: "2026-01-01T00:00:00.000Z", catalog_version: "2026-01" }),
    entry({ input_per_million: 0.5, effective_from: "2026-06-01T00:00:00.000Z", catalog_version: "2026-06" }),
    entry({ input_per_million: 9, effective_from: "2027-01-01T00:00:00.000Z", catalog_version: "2027-01" }),
  ] });
  const cost = catalog.estimate({ provider_id: "gemini", model: "gemini-2.5-flash", at, dimensions: { input_tokens: 1_000_000 } });
  assert.equal(cost.input_cost, 0.5);
  assert.equal(cost.price_catalog_version, "2026-06");
});

test("a missing price is unavailable, never a free call", () => {
  const catalog = new PriceCatalog({ entries: [entry()] });
  const cost = catalog.estimate({ provider_id: "openai", model: "gpt-x", at, dimensions: { input_tokens: 1_000 } });
  assert.equal(cost.status, "unavailable");
  assert.equal(cost.total_cost, undefined);
  assert.equal(cost.input_cost, undefined);
});

test("unknown dimensions are excluded from the total instead of counted as zero", () => {
  const catalog = new PriceCatalog({ entries: [entry()] });
  const cost = catalog.estimate({ provider_id: "gemini", model: "gemini-2.5-flash", at, dimensions: {} });
  assert.equal(cost.status, "unavailable");
  assert.equal(cost.total_cost, undefined);
});

test("provider-reported cost is preferred over a catalog estimate and labelled as such", () => {
  const catalog = new PriceCatalog({ entries: [entry()] });
  const cost = catalog.estimate({ provider_id: "gemini", model: "gemini-2.5-flash", at, dimensions: { input_tokens: 1_000_000 }, providerReportedCost: 0.42 });
  assert.equal(cost.status, "provider_reported");
  assert.equal(cost.total_cost, 0.42);
});

test("no implicit currency conversion happens across differing catalog currencies", () => {
  const catalog = new PriceCatalog({ entries: [entry({ currency: "EUR" })] });
  const cost = catalog.estimate({ provider_id: "gemini", model: "gemini-2.5-flash", at, dimensions: { input_tokens: 1_000_000 } });
  assert.equal(cost.currency, "EUR");
  assert.equal(cost.total_cost, 0.3);
});

test("the unknown-cost policy decides whether an unpriced call may proceed", () => {
  const dimensions = { input_tokens: 1_000 };
  const call = { provider_id: "openai", model: "gpt-x", at, dimensions };
  assert.equal(new PriceCatalog({ entries: [], unknown_cost_policy: "allow" }).authorize(call).allowed, true);
  const warned = new PriceCatalog({ entries: [], unknown_cost_policy: "warn" }).authorize(call);
  assert.equal(warned.allowed, true);
  assert.equal(warned.reason, "price_unknown");
  const blocked = new PriceCatalog({ entries: [], unknown_cost_policy: "block" }).authorize(call);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "price_unknown");
});

test("a priced call is authorized regardless of the unknown-cost policy", () => {
  const catalog = new PriceCatalog({ entries: [entry()], unknown_cost_policy: "block" });
  const decision = catalog.authorize({ provider_id: "gemini", model: "gemini-2.5-flash", at, dimensions: { input_tokens: 1_000 } });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, undefined);
});
