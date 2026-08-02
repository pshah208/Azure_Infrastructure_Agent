/**
 * IQ tool registry. Maps the four Microsoft IQs to:
 *  - a `ToolFn` the Foundry agent (or local reasoner) calls at runtime, and
 *  - a function-tool definition used by scripts/foundry-agents-create.ts to
 *    register the tools on the Loan Concierge agent.
 */

import { getFabricIq } from "./fabric-iq";
import { getWorkIq } from "./work-iq";
import { getWebIq } from "./web-iq";
import { lookupGuidelines } from "./foundry-iq";
import type { IqId, IqMeta, ToolFn } from "../types";

export const IQ_METADATA: IqMeta[] = [
  { id: "work", name: "Work IQ", source: "Microsoft 365 + Graph", blurb: "Borrower documents, employment and last contact." },
  { id: "fabric", name: "Fabric IQ", source: "Microsoft Fabric (OneLake)", blurb: "Governed business data: credit, income, valuation." },
  { id: "foundry", name: "Foundry IQ", source: "Azure AI Foundry", blurb: "Agent reasoning + underwriting-guideline knowledge." },
  { id: "web", name: "Web IQ", source: "Grounding with Bing", blurb: "Live market rates and regulatory context." },
];

/** Runtime dispatch map passed to invokeAgent (and used by the local reasoner). */
export const IQ_TOOLS: Record<string, ToolFn> = {
  get_fabric_iq: (args) => getFabricIq(String(args.borrower ?? "")),
  get_work_iq: (args) => getWorkIq(String(args.borrower ?? "")),
  get_web_iq: (args) => getWebIq(String(args.query ?? ""), Number(args.loan_amount ?? 0)),
  lookup_underwriting_guidelines: (args) => lookupGuidelines(String(args.query ?? "")),
};

/** Which IQ card each tool lights up. */
export const TOOL_TO_IQ: Record<string, IqId> = {
  get_fabric_iq: "fabric",
  get_work_iq: "work",
  get_web_iq: "web",
  lookup_underwriting_guidelines: "foundry",
};

/** Function-tool definitions (name/description/JSON-schema) for agent creation. */
export const TOOL_DEFINITIONS = [
  {
    name: "get_fabric_iq",
    description:
      "Get a borrower's credit score, annual income, monthly debt, loan amount, property value, LTV and DTI from Microsoft Fabric (OneLake).",
    parameters: {
      type: "object",
      properties: { borrower: { type: "string", description: "Borrower full name" } },
      required: ["borrower"],
    },
  },
  {
    name: "get_work_iq",
    description:
      "Get a borrower's document-intake status, missing documents, employment verification and last contact from Microsoft 365 (Work IQ).",
    parameters: {
      type: "object",
      properties: { borrower: { type: "string", description: "Borrower full name" } },
      required: ["borrower"],
    },
  },
  {
    name: "get_web_iq",
    description:
      "Get today's mortgage market rates (30-yr and 15-yr fixed) and regulatory context from the web (Web IQ).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look up" },
        loan_amount: { type: "number", description: "Loan amount, optional" },
      },
      required: ["query"],
    },
  },
  {
    name: "lookup_underwriting_guidelines",
    description:
      "Look up the relevant mortgage underwriting guideline rules (credit score, DTI, LTV, PMI, documentation, decision matrix) from the Foundry IQ knowledge base.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Underwriting topic to look up" } },
      required: ["query"],
    },
  },
] as const;
