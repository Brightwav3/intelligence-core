# ADR 0002: The Foundation is an in-process typed library, not a service

- **Status:** Accepted
- **Date:** 2026-08-10
- **Decision owners:** M.A.R.K. II architecture
- **Expanded** on 2026-08-15 from a three-line record to the current ADR format.
  The decision is unchanged.

## Context

An intelligence runtime is the kind of component that attracts an HTTP interface
early. It is the part other systems want to call, it is the part that benefits
visibly from being scaled separately, and every reference architecture draws it as
a service.

Adding transport now would mean serialisation contracts, a wire protocol version,
error mapping across a boundary, authentication for that boundary, and a
deployment story — all before anything in this ecosystem runs in a second process.

## Decision

The Foundation exposes an **in-process typed library**: `start`, `stop`, `health`,
`capabilities`, `execute`, `cancel`, and typed lifecycle events. Consumers import
it and call it.

Transport can be added by a future adapter, on top of the same contracts, when a
real process boundary exists. Adding it now would broaden the Foundation without a
process-boundary requirement.

## Rejected alternatives

### Expose HTTP from the start

Rejected. It buys nothing while every consumer is in the same process, and it
costs a wire contract that must then be maintained across every change to the
typed one. Two contracts for one boundary is the expensive part, not the server.

### Expose both, sharing types

Rejected as the same cost with an extra failure mode: the two paths drift, and the
one exercised less is the one that breaks silently.

### Design the types for future serialisation

Partially adopted rather than rejected — contracts stay plain and structural, so a
future adapter is a mapping rather than a redesign. What is rejected is letting
hypothetical wire concerns shape the in-process API now.

## Consequences

### Positive

- One contract, checked by the compiler at every call site.
- No serialisation, versioning, or auth boundary to maintain before one is needed.
- Cancellation and lifecycle events work directly, rather than through a protocol
  that has to model them.

### Costs

- Consumers must run in the same process, or wait for an adapter.
- Independent scaling of intelligence execution is not available today.

## Enforced in

- `src/index.ts`
- `src/runtime/intelligence-runtime.ts`

## Explicit non-decisions

This ADR does not forbid a future transport adapter, does not decide which
protocol such an adapter would use, and does not govern how Core Runtime exposes
its own local JSON API.
