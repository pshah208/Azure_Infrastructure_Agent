/** Foundry IQ - underwriting-guideline knowledge from Azure AI Search (or local JSON). */

import guidelines from "../../data/underwriting_guidelines.json";
import { searchGuidelines } from "../azure/search";
import { isSearchConfigured } from "../constants";
import type { Guideline, IqToolResult } from "../types";

function localSearch(query: string, top: number): Guideline[] {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter((t) => t.length > 3);
  const scored = (guidelines as Guideline[])
    .map((g) => {
      const hay = `${g.title} ${g.content} ${g.category ?? ""}`.toLowerCase();
      const score = terms.reduce((s, t) => (hay.includes(t) ? s + 1 : s), 0);
      return { g, score };
    })
    .sort((a, b) => b.score - a.score);
  const hits = scored.filter((s) => s.score > 0).map((s) => s.g);
  return (hits.length ? hits : (guidelines as Guideline[])).slice(0, top);
}

export async function lookupGuidelines(
  query: string,
  top = 5,
): Promise<IqToolResult<Guideline[]>> {
  if (isSearchConfigured()) {
    const results = await searchGuidelines(query, top);
    if (results.length) {
      return { data: results, detail: "Retrieved underwriting guidelines from Azure AI Search", live: true };
    }
  }
  return { data: localSearch(query, top), detail: "Retrieved underwriting guidelines (local knowledge base)", live: false };
}
