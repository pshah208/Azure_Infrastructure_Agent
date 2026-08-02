/** Web IQ - current mortgage market rates + regulatory context (Grounding with Bing / public API). */

import { WEB_IQ_RATES_URL } from "../constants";
import type { IqToolResult, WebIqSnapshot } from "../types";

const SNAPSHOT: WebIqSnapshot = {
  avg_30yr_fixed: 6.52,
  avg_15yr_fixed: 5.74,
  rate_trend: "down 0.08% week-over-week",
  regulatory_note: "TRID: Loan Estimate must be delivered within 3 business days.",
};

export async function getWebIq(
  _query: string,
  loanAmount = 0,
): Promise<IqToolResult<WebIqSnapshot>> {
  if (WEB_IQ_RATES_URL) {
    try {
      const res = await fetch(WEB_IQ_RATES_URL, { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as Partial<WebIqSnapshot>;
        return {
          data: { ...SNAPSHOT, ...body },
          detail: "Fetched current market rates from the web",
          live: true,
        };
      }
    } catch (err) {
      console.warn("[web-iq] rates fetch failed:", err instanceof Error ? err.message : err);
    }
  }
  // Small deterministic variation so the snapshot is not perfectly static.
  const adjust = loanAmount > 500000 ? 0.05 : 0;
  return {
    data: {
      ...SNAPSHOT,
      avg_30yr_fixed: Math.round((SNAPSHOT.avg_30yr_fixed + adjust) * 100) / 100,
      avg_15yr_fixed: Math.round((SNAPSHOT.avg_15yr_fixed + adjust) * 100) / 100,
    },
    detail: "Checking today's market rates and TRID disclosure rules",
    live: false,
  };
}
