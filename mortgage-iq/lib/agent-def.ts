/**
 * Single source of truth for the Loan Concierge agent definition — its
 * instructions and its function-tool schema. Used both by the app (to
 * ensure/create the agent at runtime) and by scripts/foundry-agents-create.ts.
 */

import { TOOL_DEFINITIONS } from "./iq";

export const CONCIERGE_INSTRUCTIONS = [
  "You are the Loan Concierge, a helpful mortgage assistant. Answer conversationally and concisely.",
  "Tools: get_fabric_iq (borrower credit/income/loan/valuation), get_work_iq (documents/employment from Microsoft 365),",
  "get_web_iq (current market rates and regulatory context), lookup_underwriting_guidelines (the underwriting rulebook).",
  "If the user names a specific borrower and wants an assessment, call get_fabric_iq, get_work_iq and",
  "lookup_underwriting_guidelines (plus get_web_iq if rates matter), then recommend Approve / Approve (conditional) /",
  "Refer to underwriter with conditions. If the question is GENERAL (no specific borrower), call ONLY",
  "lookup_underwriting_guidelines. Never invent borrower data; only use what the tools return. Attribute facts to",
  "the IQ/tool they came from.",
].join(" ");

/** The four IQ tools as Foundry function-tool definitions. */
export function conciergeToolDefinitions(): unknown[] {
  return TOOL_DEFINITIONS.map((d) => ({
    type: "function",
    function: { name: d.name, description: d.description, parameters: d.parameters },
  }));
}
