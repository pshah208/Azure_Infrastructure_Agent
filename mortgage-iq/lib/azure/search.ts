/**
 * Foundry IQ knowledge retrieval from Azure AI Search.
 *
 * Modelled on Lulu IQ's lib/azure/search.ts. Uses the AI Search key (resolved
 * from Key Vault or env) when configured; otherwise returns an empty list so
 * callers fall back to the local underwriting-guidelines JSON. Best-effort:
 * never throws.
 */

import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import { getAzureCredential } from "./identity";
import { getSecret } from "./key-vault";
import {
  AI_SEARCH_ENDPOINT,
  AI_SEARCH_INDEX,
  AI_SEARCH_KEY,
  AI_SEARCH_KEY_KV_SECRET,
  isSearchConfigured,
} from "../constants";
import type { Guideline } from "../types";

let cachedClient: SearchClient<Guideline> | undefined;

async function getClient(): Promise<SearchClient<Guideline> | undefined> {
  if (!isSearchConfigured()) return undefined;
  if (cachedClient) return cachedClient;

  const key = AI_SEARCH_KEY || (await getSecret(AI_SEARCH_KEY_KV_SECRET)) || "";
  cachedClient = key
    ? new SearchClient<Guideline>(AI_SEARCH_ENDPOINT, AI_SEARCH_INDEX, new AzureKeyCredential(key))
    : new SearchClient<Guideline>(AI_SEARCH_ENDPOINT, AI_SEARCH_INDEX, getAzureCredential());
  return cachedClient;
}

export async function searchGuidelines(query: string, top = 5): Promise<Guideline[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const results = await client.search(query, { top });
    const out: Guideline[] = [];
    for await (const r of results.results) {
      const d = r.document;
      out.push({ id: d.id, title: d.title, content: d.content, category: d.category });
    }
    return out;
  } catch (err) {
    console.warn(
      "[search] guideline retrieval failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
