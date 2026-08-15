# ADR 0004: Provider SDKs live only inside adapters; the runtime never depends on one

- **Status:** Accepted
- **Date:** 2026-08-10
- **Decision owners:** M.A.R.K. II architecture
- **Expanded** on 2026-08-15 from a three-line record to the current ADR format.
  The decision is unchanged.

## Context

This ecosystem's founding constraint is that the best model available in five
years may be radically more capable than anything available now, and that
improvement must not require rebuilding the system. The model is a component.

Provider coupling does not usually arrive as a decision. It arrives as a
provider-shaped field on a result type, a provider's error taxonomy leaking into a
`catch`, a streaming abstraction shaped like one vendor's SSE format. Each is
small; together they mean replacing the provider is a redesign.

## Decision

`IntelligenceRuntime` **must never depend on a provider SDK.** Provider-specific
payloads, SDKs, error shapes, and streaming mechanics live only inside their
`ModelProvider` adapter, behind `ModelGateway`.

The runtime owns the execution lifecycle and provider-independent results.
Replacing a provider means implementing the same `ModelProvider` interface — not
touching `IntelligenceRuntime`.

`FakeModelProvider` exists so the whole path is exercisable with no credentials
and no network; the Gemini adapter is optional and reaches REST only through its
own module.

## Rejected alternatives

### Depend on one provider now and abstract later

Rejected. The abstraction that gets written later is shaped by the provider it was
extracted from, so it fits that one and fights every other. Writing it first costs
a day; extracting it later costs a redesign.

### Expose provider-native response objects for callers that want them

Rejected. An escape hatch becomes the path consumers take, and every consumer that
takes it is coupled. The gateway's value is that no such consumer can exist.

### Normalise to the union of all providers' features

Rejected. It grows the contract with capabilities most providers lack and makes
`ModelCapabilities` decorative. Declaring capabilities per model and keeping the
contract narrow is the smaller, honest shape.

## Consequences

### Positive

- A provider swap is an adapter, not a redesign.
- The full path is testable offline with `FakeModelProvider`.
- No assistant name, provider name, or model id appears in a runtime contract.

### Costs

- Provider-specific capabilities are reachable only after being expressed in the
  neutral contract.
- Each adapter re-implements normalisation for streaming, usage, and errors.

## Enforced in

- `src/models/model-boundary.ts`
- `src/models/model-gateway.ts`
- `src/models/gemini-model-provider.ts`
- `src/models/fake-model-provider.ts`

## Explicit non-decisions

This ADR does not choose a default provider, does not decide routing or fallback
order — that is the Production Layer's — and does not govern which provider
Assistant Runtime selects for a delegated execution.
