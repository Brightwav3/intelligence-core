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
