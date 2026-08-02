/**
 * Register (or update) the Loan Concierge agent in the Foundry project with the
 * four IQ function tools. Modelled on Lulu IQ's scripts/foundry-agents-create.ts.
 *
 *   npm run foundry:create-agents
 *
 * Requires FOUNDRY_PROJECT_ENDPOINT and an identity with the agents data-plane
 * role. If FOUNDRY_SEARCH_CONNECTION_ID is set, an Azure AI Search knowledge
 * tool is attached too (works in tenants that support server-side agent tools).
 */

import { AgentsClient, ToolUtility } from "@azure/ai-agents";
import { DefaultAzureCredential } from "@azure/identity";
import { TOOL_DEFINITIONS } from "../lib/iq";
import { FOUNDRY_AGENTS, FOUNDRY_MODEL_DEPLOYMENT, AI_SEARCH_INDEX } from "../lib/constants";

const INSTRUCTIONS = [
  "You are the Loan Concierge, a helpful mortgage assistant. Answer conversationally and concisely.",
  "Tools: get_fabric_iq (borrower credit/income/loan/valuation), get_work_iq (documents/employment from Microsoft 365),",
  "get_web_iq (current market rates and regulatory context), lookup_underwriting_guidelines (the underwriting rulebook).",
  "If the user names a specific borrower and wants an assessment, call get_fabric_iq, get_work_iq and",
  "lookup_underwriting_guidelines (plus get_web_iq if rates matter), then recommend Approve / Approve (conditional) /",
  "Refer to underwriter with conditions. If the question is GENERAL (no specific borrower), call ONLY",
  "lookup_underwriting_guidelines. Never invent borrower data; only use what the tools return. Attribute facts to",
  "the IQ/tool they came from.",
].join(" ");

async function main() {
  const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
  if (!endpoint) throw new Error("FOUNDRY_PROJECT_ENDPOINT is required");
  const client = new AgentsClient(endpoint, new DefaultAzureCredential());

  const tools: unknown[] = TOOL_DEFINITIONS.map((d) => ({
    type: "function",
    function: { name: d.name, description: d.description, parameters: d.parameters },
  }));

  const searchConnectionId = process.env.FOUNDRY_SEARCH_CONNECTION_ID;
  if (searchConnectionId) {
    const searchTool = ToolUtility.createAzureAISearchTool(searchConnectionId, AI_SEARCH_INDEX);
    tools.push(searchTool.definition);
    console.log(`Attached AI Search knowledge tool (index=${AI_SEARCH_INDEX}).`);
  }

  const name = FOUNDRY_AGENTS.concierge;
  let existingId: string | undefined;
  for await (const a of client.listAgents()) {
    if (a.name === name) existingId = a.id;
  }

  if (existingId) {
    await client.updateAgent(existingId, {
      model: FOUNDRY_MODEL_DEPLOYMENT,
      instructions: INSTRUCTIONS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: tools as any,
    });
    console.log(`Updated agent '${name}' (${existingId}) with ${tools.length} tools.`);
  } else {
    const agent = await client.createAgent(FOUNDRY_MODEL_DEPLOYMENT, {
      name,
      instructions: INSTRUCTIONS,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: tools as any,
    });
    console.log(`Created agent '${name}' (${agent.id}) with ${tools.length} tools.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
