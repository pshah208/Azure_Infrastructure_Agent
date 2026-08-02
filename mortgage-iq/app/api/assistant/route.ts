/**
 * POST /api/assistant
 *
 * The Loan Concierge chat surface. Streams Server-Sent Events (iq_active,
 * iq_data, token, done) from lib/concierge.ts. When the Foundry agent is
 * enabled the events come from the agent's real tool calls; otherwise the local
 * reasoner drives them. Modelled on Lulu IQ's app/api/assistant/route.ts.
 */

import type { NextRequest } from "next/server";
import { runConcierge } from "@/lib/concierge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let message = "";
  try {
    const body = (await req.json()) as { message?: string };
    message = (body.message ?? "").trim();
  } catch {
    return new Response(JSON.stringify({ error: "request body must be JSON" }), { status: 400 });
  }
  if (!message) {
    return new Response(JSON.stringify({ error: "`message` is required" }), { status: 400 });
  }

  const stream = runConcierge(message);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
