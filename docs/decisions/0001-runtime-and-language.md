# ADR 0001: TypeScript on Node.js 22+

- **Status:** Accepted
- **Date:** 2026-08-10
- **Decision owners:** M.A.R.K. II architecture
- **Expanded** on 2026-08-15 from a nine-line record to the current ADR format.
  The decision is unchanged.

## Context

Intelligence Core is one repository in an ecosystem of eleven that a single agent
must be able to move between without relearning the shape. Its own requirements —
a headless runtime, explicit asynchronous contracts, no AI dependency in the
foundation — are satisfied by several stacks. What is not satisfied by several
stacks is consistency with the repositories it sits next to.

## Decision

Strict TypeScript, native ESM, Node.js 22 or newer. Matching the ecosystem's
existing core repositories.

Strictness is load-bearing rather than stylistic: the consumers of these contracts
are software agents, and a type error caught at compile time is a contract
violation that never reaches a model. Runtime validation remains the authority for
untrusted input; types are the authority for internal call sites.

## Rejected alternatives

### Python, for proximity to the model ecosystem

Rejected. The provider surface here is REST behind an adapter, so the model
ecosystem's libraries buy nothing at this boundary — and the cost would be a
second language in a system whose repositories are meant to be navigable as one.

### A compiled language for the runtime

Rejected. Nothing in this component is compute-bound; it waits on providers. The
gain is theoretical and the loss — a second toolchain, a second package model, and
a boundary between it and every sibling repository — is not.

### Loose TypeScript, to move faster early

Rejected. The types are the contract that agent consumers read. A contract the
compiler does not enforce is documentation, and this ecosystem already has enough
evidence that documentation alone is not followed.

## Consequences

### Positive

- One agent can move between repositories without relearning the stack.
- Contracts are compiler-checked at every internal call site.
- No AI dependency in the foundation.

### Costs

- Node's own release cadence sets the floor; a Node 22 feature used here raises the
  requirement for every consumer.
- ESM plus NodeNext resolution requires file extensions in imports, which is a
  recurring small friction.

## Enforced in

- `package.json`
- `tsconfig.json`

## Explicit non-decisions

This ADR does not choose a test runner beyond the ecosystem default, does not
authorize a bundler, and does not decide the runtime floor for any sibling
repository.
