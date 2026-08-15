# Intelligence Core — rules for agents

This file is loaded automatically. It carries rules, not description.
`README.md` says what this repository owns. `ARCHITECTURE.md` says how it is
shaped. [`docs/decisions/`](docs/decisions/README.md) says why — read it before
changing a boundary.

`AGENTS.md` is a byte-identical copy of this file. Change both or change neither.

## Ecosystem invariants that govern this repository

Quoted verbatim from [`INVARIANTS.md`](../INVARIANTS.md), which is the authority.
Do not paraphrase these sentences; a structure test compares them.

**INV-002 — Asynchronous capabilities are brokered**

> A capability that cannot produce its answer within the turn that requested it is
> routed through the Delegation Broker, which mints its execution identity before
> any work begins, so that a model holding the turn has something real to
> acknowledge and no silence to fill with an invented result.

Intelligence Core is the *executor* behind that broker, not its owner. Model
selection, limits, deadlines, cancellation, and delivery policy belong to
Assistant Runtime. See
[ecosystem ADR 0001](../docs/decisions/0001-capability-homes.md).

**INV-004 — A superseded result is dropped at the boundary, not delivered**

> Every asynchronous turn carries a monotonically increasing authority generation.
> Cancellation, barge-in, interruption, or supersession advances it, and a result
> belonging to an older generation is dropped at the last boundary before its
> effect. Cancellation stops work from starting; it cannot recall work already in
> flight.

Here that means request identity and execution identity stay distinct, so a result
names the attempt it came from and a stale one is recognisable. See
[ecosystem ADR 0002](../docs/decisions/0002-authority-generation.md).

## Rules in this repository

1. **`IntelligenceRuntime` must never depend on a provider SDK.** Provider
   payloads, SDKs, error shapes, and streaming mechanics live only inside their
   `ModelProvider` adapter. [ADR 0004](docs/decisions/0004-provider-independence.md)
2. **Do not expose provider-native objects to callers.** An escape hatch becomes
   the path consumers take, and every consumer that takes it is coupled.
3. **Model output is input, never authority.** Every tool request the model
   produces is validated, limited, submitted to an external `PolicyClient`, and
   only then executed through an external `ToolClient`.
   [ADR 0005](docs/decisions/0005-model-output-is-input-never-authority.md)
4. **Keep the refusing defaults.** `DenyAllPolicyClient` and `NullToolClient` exist
   so a deployment that forgot to wire a boundary fails closed. Do not replace
   either with something "reasonable".
5. **Keep the iteration bound.** A loop must not continue because the model keeps
   asking.
6. **Keep request and execution identity separate.** A request identifies the
   input; an execution identifies one attempt. Stale-result protection depends on
   the split. [ADR 0003](docs/decisions/0003-request-vs-execution.md)
7. **Do not add HTTP to the Foundation.** It is an in-process typed library.
   Transport is a future adapter, not a widening of this boundary.
   [ADR 0002](docs/decisions/0002-core-runtime-boundary.md)
8. **This repository does not persist memory, implement application tools, own
   authorization policy, or provide a GUI.** Memory Core and State Core supply
   narrow context-provider contracts; do not import them.
9. **Do not log user or model content by default.** Events carry ids, statuses, and
   timestamps.
10. **No assistant name, provider name, or model id** in any runtime contract,
    event name, or identifier.

## Before you finish

- Changed a boundary, chose between two homes for something, or rejected an
  approach a next agent would try? Write an ADR. The six triggers and the
  template are in [../docs/decisions/README.md](../docs/decisions/README.md).
- Edited this file? Copy it to `AGENTS.md` in the same change. They must stay
  byte-identical — Claude Code reads one, Codex reads the other, and a structure
  test compares them.
- Wrote an ADR? Add its identifier as a comment in every file listed under its
  `Enforced in`.
- Reasoning belongs in `docs/decisions/`, not in `ARCHITECTURE.md`.
