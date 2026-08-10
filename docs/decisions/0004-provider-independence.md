# ADR 0004: Providers remain outside the runtime

The runtime owns execution lifecycle and provider-independent results. Provider-specific payloads and SDKs must be implemented behind future model/provider adapters, so replacing a provider does not redesign `IntelligenceRuntime`.
