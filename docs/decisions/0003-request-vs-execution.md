# ADR 0003: A request identifies input; an execution identifies one attempt at it

- **Status:** Accepted
- **Date:** 2026-08-10
- **Decision owners:** M.A.R.K. II architecture
- **Expanded** on 2026-08-15 from a three-line record to the current ADR format.
  The decision is unchanged.

## Context

The natural first design gives each call one identifier. It works until the call
is retried, falls back to a second provider, is replayed for evaluation, or is
cancelled while a second attempt is already running.

At that point one identifier has to mean two things — *what was asked* and *which
attempt at answering it* — and every consumer downstream has to guess which sense
a given log line, event, or trace entry is using. Retries become indistinguishable
from new questions, and a late result from a superseded attempt cannot be told
apart from the current one.

## Decision

Two identities, both immutable:

- **Request identity** — the input. Stable across every retry, fallback, replay,
  and evaluation run of the same question.
- **Execution identity** — one processing attempt. Every attempt is observable and
  cancellable independently.

Session identity is optional and separate again, because a session groups requests
and neither of the other two identities implies it.

Stale-result protection depends on this split: a result arriving from an execution
that is no longer current is recognisable as such, because the execution it came
from is named.

## Rejected alternatives

### One identifier per call

Rejected. It cannot express a retry without either reusing the id — losing the
ability to distinguish attempts — or minting a new one, losing the link to the
original question. Both losses show up first in traces and last in correctness.

### Derive the execution id from the request id plus an attempt counter

Rejected. It encodes a relationship in a string that consumers then parse, and it
assumes attempts are ordered and countable, which fallback across providers makes
untrue.

### Track attempts only in the trace, not in the contract

Rejected. Cancellation and stale-result protection are behaviours of the contract,
not of the observability layer. A property needed for correctness cannot live only
where it is being observed.

## Consequences

### Positive

- Retries, fallback, and replay preserve the link to the original question.
- A stale result is recognisable rather than merely late.
- Traces and evaluations can group by question or by attempt, as needed.

### Costs

- Consumers must know which identity they mean, and the two are easy to confuse in
  logs if either is printed without its label.
- Every event carries both, which makes the event shape wider.

## Enforced in

- `src/contracts/intelligence.ts`
- `src/runtime/intelligence-runtime.ts`
- `src/events/intelligence-events.ts`

## Explicit non-decisions

This ADR does not define the retry or fallback policy, does not decide how
sessions are created or scoped, and does not govern how Assistant Runtime
correlates a delegated execution — that is the Delegation Broker's, under
[ecosystem ADR 0001](../../../docs/decisions/0001-capability-homes.md).
