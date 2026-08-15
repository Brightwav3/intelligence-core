/**
 * Provider-neutral pricing. Prices live in configuration, never in a provider adapter:
 * an adapter that hardcodes a rate silently goes stale and there is no way to tell
 * afterwards which number a recorded cost was computed from. Every estimate therefore
 * carries the catalog version and the effective timestamp it used.
 */

export type UsageOperation = "chat" | "realtime" | "embedding" | "rerank" | "image" | "audio" | "other";
export type UsageOutcome = "completed" | "failed" | "cancelled" | "timeout";
/**
 * `compaction` is separate from `delegation` even though it runs through the same broker.
 * It is spend the user never asked for — the runtime buying itself headroom — and folding
 * it into delegation would make an unattended cost look like work someone requested.
 */
export type UsageRole = "voice" | "delegation" | "compaction" | "embedding" | "rerank" | "other";
/** What to do when a call has no matching price. Never "assume free". */
export type UnknownCostPolicy = "allow" | "warn" | "block";

export interface ModelUsageDimensions {
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
  input_audio_seconds?: number;
  output_audio_seconds?: number;
  input_audio_bytes?: number;
  output_audio_bytes?: number;
  input_images?: number;
  output_images?: number;
  input_characters?: number;
  output_characters?: number;
}

export interface UsageCostEstimate {
  currency: string;
  input_cost?: number;
  output_cost?: number;
  cached_input_cost?: number;
  reasoning_cost?: number;
  modality_cost?: number;
  total_cost?: number;
  status: "estimated" | "provider_reported" | "unavailable";
  price_catalog_version?: string;
  price_effective_at?: string;
  /** Calls that contributed no priceable usage. Kept beside the total so a cheap-looking number is never mistaken for a complete one. */
  unknown_cost_calls?: number;
}

export interface ModelPriceEntry {
  provider_id: string;
  /** Exact model id, or a `*` wildcard pattern. An exact match always wins. */
  model_pattern: string;
  currency: string;
  input_per_million?: number;
  output_per_million?: number;
  cached_input_per_million?: number;
  reasoning_per_million?: number;
  input_audio_per_minute?: number;
  output_audio_per_minute?: number;
  per_request?: number;
  effective_from: string;
  catalog_version: string;
}

export interface PriceCatalogOptions {
  entries: ModelPriceEntry[];
  unknown_cost_policy?: UnknownCostPolicy;
  /** Default currency reported when nothing can be priced at all. */
  default_currency?: string;
}

export interface PriceLookup {
  provider_id: string;
  model: string;
  at: string;
  dimensions: ModelUsageDimensions;
  providerReportedCost?: number;
}

export interface PriceAuthorization {
  allowed: boolean;
  reason?: "price_unknown";
  policy: UnknownCostPolicy;
}

const perMillion = (units: number | undefined, rate: number | undefined): number | undefined =>
  units === undefined || rate === undefined ? undefined : (units / 1_000_000) * rate;
const perMinute = (seconds: number | undefined, rate: number | undefined): number | undefined =>
  seconds === undefined || rate === undefined ? undefined : (seconds / 60) * rate;

function patternMatches(pattern: string, model: string): boolean {
  if (pattern === model) return true;
  if (!pattern.includes("*")) return false;
  const escaped = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${escaped}$`).test(model);
}

export class PriceCatalog {
  private readonly entries: ModelPriceEntry[];
  public readonly unknownCostPolicy: UnknownCostPolicy;
  private readonly defaultCurrency: string;

  public constructor(options: PriceCatalogOptions) {
    this.entries = [...options.entries];
    this.unknownCostPolicy = options.unknown_cost_policy ?? "block";
    this.defaultCurrency = options.default_currency ?? "USD";
  }

  /** The most specific entry effective at the call time, or nothing. */
  public entryFor(providerId: string, model: string, at: string): ModelPriceEntry | undefined {
    const candidates = this.entries
      .filter((entry) => entry.provider_id === providerId && patternMatches(entry.model_pattern, model) && entry.effective_from <= at)
      .sort((a, b) => {
        const exact = Number(b.model_pattern === model) - Number(a.model_pattern === model);
        return exact !== 0 ? exact : b.effective_from.localeCompare(a.effective_from);
      });
    return candidates[0];
  }

  public estimate(lookup: PriceLookup): UsageCostEstimate {
    const entry = this.entryFor(lookup.provider_id, lookup.model, lookup.at);
    if (lookup.providerReportedCost !== undefined) {
      return { currency: entry?.currency ?? this.defaultCurrency, total_cost: lookup.providerReportedCost, status: "provider_reported", ...(entry ? { price_catalog_version: entry.catalog_version, price_effective_at: entry.effective_from } : {}) };
    }
    if (!entry) return { currency: this.defaultCurrency, status: "unavailable" };

    const dimensions = lookup.dimensions;
    const input = perMillion(dimensions.input_tokens, entry.input_per_million);
    const output = perMillion(dimensions.output_tokens, entry.output_per_million);
    const cached = perMillion(dimensions.cached_input_tokens, entry.cached_input_per_million);
    const reasoning = perMillion(dimensions.reasoning_tokens, entry.reasoning_per_million);
    const inputAudio = perMinute(dimensions.input_audio_seconds, entry.input_audio_per_minute);
    const outputAudio = perMinute(dimensions.output_audio_seconds, entry.output_audio_per_minute);
    const modality = inputAudio === undefined && outputAudio === undefined ? undefined : (inputAudio ?? 0) + (outputAudio ?? 0);

    const priced = [input, output, cached, reasoning, modality].filter((value): value is number => value !== undefined);
    // A per-request charge alone is not evidence that the call happened as priced; it is
    // only added once some real usage was observed.
    if (!priced.length) return { currency: entry.currency, status: "unavailable", price_catalog_version: entry.catalog_version, price_effective_at: entry.effective_from };
    const total = priced.reduce((sum, value) => sum + value, 0) + (entry.per_request ?? 0);

    return {
      currency: entry.currency,
      ...(input !== undefined ? { input_cost: input } : {}),
      ...(output !== undefined ? { output_cost: output } : {}),
      ...(cached !== undefined ? { cached_input_cost: cached } : {}),
      ...(reasoning !== undefined ? { reasoning_cost: reasoning } : {}),
      ...(modality !== undefined ? { modality_cost: modality } : {}),
      total_cost: total,
      status: "estimated",
      price_catalog_version: entry.catalog_version,
      price_effective_at: entry.effective_from,
    };
  }

  /**
   * Decides whether the next attempt may run when its price is unknown. Fail-closed by
   * default: an unpriced call is unbounded spend, not free spend.
   */
  public authorize(lookup: PriceLookup): PriceAuthorization {
    const priced = this.entryFor(lookup.provider_id, lookup.model, lookup.at) !== undefined || lookup.providerReportedCost !== undefined;
    if (priced) return { allowed: true, policy: this.unknownCostPolicy };
    return { allowed: this.unknownCostPolicy !== "block", reason: "price_unknown", policy: this.unknownCostPolicy };
  }
}
