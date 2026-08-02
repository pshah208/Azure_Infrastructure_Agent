/**
 * Agent / surface roster. Metadata-driven, modelled on Lulu IQ's lib/agents.ts.
 * The `backend` column distinguishes the Foundry agent from the client-side
 * function tools and their underlying Azure surfaces.
 */

import type { Agent } from "./types";

export const AGENTS: Agent[] = [
  {
    id: "loan-concierge",
    name: "Loan Concierge",
    purpose:
      "Conversational mortgage assistant. Decides which IQ tools to call, then gives a grounded underwriting recommendation.",
    iq: "all",
    backend: "foundry-agent",
    model: "gpt-4o",
    surfaces: ["Azure AI Foundry", "Azure AI Search", "Microsoft Fabric", "Microsoft 365"],
  },
  {
    id: "fabric-iq",
    name: "Fabric IQ",
    purpose: "Borrower credit, income, loan and property valuation from OneLake.",
    iq: "fabric",
    backend: "fabric-sql",
    surfaces: ["Microsoft Fabric (OneLake)"],
  },
  {
    id: "work-iq",
    name: "Work IQ",
    purpose: "Borrower document intake, employment and correspondence from Microsoft 365.",
    iq: "work",
    backend: "graph",
    surfaces: ["Microsoft 365 + Graph"],
  },
  {
    id: "foundry-iq",
    name: "Foundry IQ",
    purpose: "Underwriting-guideline knowledge and agent reasoning.",
    iq: "foundry",
    backend: "ai-search",
    surfaces: ["Azure AI Foundry", "Azure AI Search"],
  },
  {
    id: "web-iq",
    name: "Web IQ",
    purpose: "Live mortgage market rates and regulatory context.",
    iq: "web",
    backend: "function-tool",
    surfaces: ["Grounding with Bing"],
  },
];

export function getAgent(id: string): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}
