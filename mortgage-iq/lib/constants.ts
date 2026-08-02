/**
 * Central configuration surface. Endpoints come from env (non-secret);
 * secrets are resolved from Key Vault at runtime (see lib/azure/key-vault.ts).
 *
 * Modelled on Lulu IQ's lib/constants.ts. Every value has a safe default so the
 * app builds and runs locally with nothing configured (LOCAL mode).
 */

export const FOUNDRY_PROJECT_ENDPOINT = process.env.FOUNDRY_PROJECT_ENDPOINT ?? "";
export const FOUNDRY_MODEL_DEPLOYMENT = process.env.FOUNDRY_MODEL_DEPLOYMENT ?? "gpt-4o";
export const FOUNDRY_USE_AGENT = (process.env.FOUNDRY_USE_AGENT ?? "false").toLowerCase() === "true";

/** Display names of the Foundry agents this app invokes. */
export const FOUNDRY_AGENTS = {
  concierge: process.env.FOUNDRY_AGENT_CONCIERGE ?? "loan-concierge",
} as const;
export type FoundryAgentName = (typeof FOUNDRY_AGENTS)[keyof typeof FOUNDRY_AGENTS];

export const AI_SEARCH_ENDPOINT = process.env.AI_SEARCH_ENDPOINT ?? "";
export const AI_SEARCH_INDEX = process.env.AI_SEARCH_INDEX ?? "mortgage-knowledge";
export const AI_SEARCH_KEY_KV_SECRET = process.env.AI_SEARCH_KEY_KV_SECRET ?? "ai-search-key";
export const AI_SEARCH_KEY = process.env.AI_SEARCH_KEY ?? "";

export const FABRIC_SQL_ENDPOINT = process.env.FABRIC_SQL_ENDPOINT ?? "";
export const FABRIC_DATABASE = process.env.FABRIC_DATABASE ?? "";
export const FABRIC_BORROWER_TABLE = process.env.FABRIC_BORROWER_TABLE ?? "dbo.borrowers";
export const FABRIC_DOCUMENTS_TABLE = process.env.FABRIC_DOCUMENTS_TABLE ?? "dbo.borrower_documents";

// --- Work IQ via Microsoft Graph (M365) ---------------------------------
export const ENTRA_GRAPH_TENANT_ID = process.env.ENTRA_GRAPH_TENANT_ID ?? "";
export const ENTRA_GRAPH_APP_ID = process.env.ENTRA_GRAPH_APP_ID ?? "";
export const ENTRA_GRAPH_APP_SECRET_KV_SECRET = process.env.ENTRA_GRAPH_APP_SECRET_KV_SECRET ?? "entra-graph-app-secret";
/** SharePoint document-library drive ID that holds the per-borrower folders. */
export const GRAPH_DRIVE_ID = process.env.GRAPH_DRIVE_ID ?? "";
/** Parent folder (under the drive root) containing one subfolder per borrower. */
export const GRAPH_BORROWERS_FOLDER = process.env.GRAPH_BORROWERS_FOLDER ?? "Loan Applications";
/** Required-document checklist used to compute documents_missing. */
export const REQUIRED_DOCUMENTS = (process.env.GRAPH_REQUIRED_DOCUMENTS ?? "Pay stub;W-2;Bank statements")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

export const WEB_IQ_RATES_URL = process.env.WEB_IQ_RATES_URL ?? "";

/** True when the Foundry agent path should be used (endpoint + explicit opt-in). */
export function isFoundryAgentEnabled(): boolean {
  return FOUNDRY_USE_AGENT && FOUNDRY_PROJECT_ENDPOINT.length > 0;
}

/** True when a real Fabric SQL endpoint is configured (else JSON fallback). */
export function isFabricConfigured(): boolean {
  return FABRIC_SQL_ENDPOINT.length > 0 && FABRIC_DATABASE.length > 0;
}

/** True when a real AI Search endpoint is configured (else local guideline JSON). */
export function isSearchConfigured(): boolean {
  return AI_SEARCH_ENDPOINT.length > 0;
}

/** Overall runtime mode reported to the UI. */
export function runtimeMode(): "agent" | "foundry" | "local" {
  if (isFoundryAgentEnabled()) return "agent";
  if (FOUNDRY_PROJECT_ENDPOINT.length > 0) return "foundry";
  return "local";
}
