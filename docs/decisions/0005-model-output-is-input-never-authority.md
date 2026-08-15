# ADR 0005: Model output is untrusted input, never authorization

- **Status:** Accepted
- **Date:** 2026-08-15
- **Decision owners:** M.A.R.K. II architecture
- **Retroactive:** records a decision already implemented in
  `src/agent/action-runtime.ts` and `src/policy/policy-client.ts`

## Context

The action loop lets a model decide whether another step is useful and request an
available tool. That is the whole value of an agentic runtime, and it is also the
point at which a system usually acquires its worst security property: the model's
request becomes the authority to perform the action.

The pressure toward that mistake is practical rather than careless. The model
already chose the tool and the arguments; asking anything else to approve it looks
like ceremony. But a model's output is a function of its input, and its input
includes web pages, documents, and search results — content the user did not write
and an attacker may have.

A second, quieter version of the same failure is a default that permits. A tool
client or policy client that does something reasonable when unconfigured means a
deployment that forgot to configure one is running without the boundary, and
looks fine.

## Decision

**Model output is input to a decision, never the decision.** Every tool request a
model produces is validated, limited, and submitted to an external `PolicyClient`
before an external `ToolClient` is called.

**The unconfigured defaults refuse.** `DenyAllPolicyClient` denies with "No policy
is configured." `NullToolClient` executes nothing. A deployment that forgot to
wire either gets refusals, not silent capability.

**Iteration is bounded** by `maximum_iterations`, so a loop cannot continue
because the model keeps asking.

**Authority stays outside this repository.** Intelligence Core owns the
enforcement point; the decision belongs to the policy boundary and, in future, to
Security Core — the same split as
[Tool System ADR 0003](../../../tool-system/docs/decisions/0003-policy-enforcement-point.md).

Content from outside the host is marked at its source and travels marked; see
[Tool System ADR 0004](../../../tool-system/docs/decisions/0004-outcomes-are-a-union.md).
Untrusted content and privileged capability must not share one undifferentiated
channel.

## Rejected alternatives

### Trust the model's tool request when the tool is already registered

Rejected. Registration says a capability exists, not that this caller may use it
now with these arguments. Collapsing the two means the permission surface is
whatever happens to be installed.

### Permit by default and deny known-dangerous tools

Rejected. A denylist grants everything nobody has considered yet, which is exactly
the set most likely to contain something unexamined.

### Let the model include a justification the policy can weigh

Rejected. It lets the requester supply the evidence for its own approval, which is
the same failure with an extra step — and the justification is generated from the
same untrusted input as the request.

### Bound the loop by wall-clock time instead of iterations

Rejected as a weaker guarantee: a fast model reaches many more steps in the same
seconds, so the bound varies with hardware and provider rather than with the work.

## Consequences

### Positive

- A prompt-injected tool request is still refused by policy.
- A misconfigured deployment fails closed and says why.
- The enforcement point is testable before any policy engine exists.

### Costs

- Every deployment must supply a real `PolicyClient` and `ToolClient`, and
  forgetting presents as a runtime that will not act.
- `maximum_iterations` is a blunt bound and will cut off a legitimate long chain.

## Enforced in

- `src/agent/action-runtime.ts`
- `src/policy/policy-client.ts`
- `src/tools/tool-client.ts`

## Explicit non-decisions

This ADR does not define the policy language, does not decide who answers a
`confirm` decision, does not authorize identity or roles, and does not govern
which tools any deployment installs.
