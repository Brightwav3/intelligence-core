# ADR 0002: Core runtime is a narrow library

The Foundation exposes an in-process typed library rather than HTTP. Transport can be added by a future adapter; adding it now would broaden the Foundation without a process-boundary requirement.
