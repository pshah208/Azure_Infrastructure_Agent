/**
 * Create the AI Search index for underwriting guidelines and upload the docs.
 * Modelled on Lulu IQ's scripts/aisearch-index-*.ts.
 *
 *   npm run search:index-guidelines
 *
 * Requires AI_SEARCH_ENDPOINT and AI_SEARCH_KEY (or set AZURE_KEY_VAULT_URI +
 * the AI_SEARCH_KEY_KV_SECRET). Uploads data/underwriting_guidelines.json.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AzureKeyCredential } from "@azure/search-documents";
import { SearchIndexClient, SearchClient } from "@azure/search-documents";
import type { SearchIndex } from "@azure/search-documents";
import { AI_SEARCH_ENDPOINT, AI_SEARCH_INDEX, AI_SEARCH_KEY } from "../lib/constants";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!AI_SEARCH_ENDPOINT) throw new Error("AI_SEARCH_ENDPOINT is required");
  const key = AI_SEARCH_KEY || process.env.AI_SEARCH_ADMIN_KEY;
  if (!key) throw new Error("AI_SEARCH_KEY (admin key) is required to create the index");
  const cred = new AzureKeyCredential(key);

  const index: SearchIndex = {
    name: AI_SEARCH_INDEX,
    fields: [
      { name: "id", type: "Edm.String", key: true },
      { name: "title", type: "Edm.String", searchable: true },
      { name: "category", type: "Edm.String", searchable: true, filterable: true },
      { name: "content", type: "Edm.String", searchable: true },
    ],
  };

  const indexClient = new SearchIndexClient(AI_SEARCH_ENDPOINT, cred);
  await indexClient.createOrUpdateIndex(index);
  console.log(`Index '${AI_SEARCH_INDEX}' created/updated.`);

  const docs = JSON.parse(
    readFileSync(join(__dirname, "..", "data", "underwriting_guidelines.json"), "utf-8"),
  ) as Record<string, unknown>[];
  const searchClient = new SearchClient(AI_SEARCH_ENDPOINT, AI_SEARCH_INDEX, cred);
  const result = await searchClient.uploadDocuments(docs);
  console.log(`Uploaded ${result.results.length} guideline documents.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
