# Issues

## Resolved — architecture simplification

The original A–J roadmap risked treating tightly coupled runtime concerns as ten independent projects.

Resolution: preserve those concepts as a checklist but implement through five practical layers: Runtime, Model, Context, Action, and Production.

## Guardrails for future phases

- Model output remains untrusted and non-authoritative.
- Provider capabilities must be discovered rather than assumed.
- Tool actions must cross validation and an external authorization boundary.
- Memory remains external to Intelligence Core.
- Provider adapters remain replaceable; no provider SDK belongs in `IntelligenceRuntime`.
