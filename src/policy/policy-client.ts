/**
 * The external policy boundary.
 *
 * ADR 0005 — docs/decisions/0005-model-output-is-input-never-authority.md
 *   `DenyAllPolicyClient` is the unconfigured default on purpose: a deployment
 *   that forgot to wire a policy must fail closed, not run without a boundary
 *   and look fine.
 */

import type { ToolRequest } from "../tools/tool-client.js";

export type PolicyDecision =
  | { decision: "allow" }
  | { decision: "confirm"; reason?: string }
  | { decision: "deny"; reason?: string };

export interface PolicyClient {
  evaluate(request: ToolRequest): Promise<PolicyDecision>;
}

export class DenyAllPolicyClient implements PolicyClient {
  public async evaluate(): Promise<PolicyDecision> { return { decision: "deny", reason: "No policy is configured." }; }
}
