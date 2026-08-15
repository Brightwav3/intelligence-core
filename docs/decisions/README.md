# Intelligence Core decisions

Architecture Decision Records for choices contained within this repository.

A decision whose reasoning constrains code in another repository does not belong
here — it belongs in [the ecosystem decisions](../../../docs/decisions/README.md)
and, if it can be stated as a rule, in
[`INVARIANTS.md`](../../../INVARIANTS.md).

`ARCHITECTURE.md` describes **how this repository is shaped**. These records
describe **why**. Reasoning added to `ARCHITECTURE.md` instead of here is reasoning
nobody looks for, because an agent asking *why is this like this* opens a decision
record, not a diagram.

## Format

```
NNNN-slug.md          four digits, no gaps, no duplicates
```

Required sections: `Context`, `Decision`, `Rejected alternatives`,
`Consequences`, `Enforced in`, `Explicit non-decisions`.

Every path under `Enforced in` carries a comment at the declaration it constrains,
naming the ADR.

## Index

- [0001 — TypeScript on Node.js 22+](0001-runtime-and-language.md)
- [0002 — The Foundation is an in-process typed library, not a service](0002-core-runtime-boundary.md)
- [0003 — A request identifies input; an execution identifies one attempt](0003-request-vs-execution.md)
- [0004 — Provider SDKs live only inside adapters](0004-provider-independence.md)
- [0005 — Model output is untrusted input, never authorization](0005-model-output-is-input-never-authority.md)
