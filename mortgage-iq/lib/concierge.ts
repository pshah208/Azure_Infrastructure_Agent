/**
 * Loan Concierge orchestration. Produces a Server-Sent Events stream that the
 * browser renders as chat tokens + a live IQ activity panel.
 *
 * Two paths:
 *  - AGENT (isFoundryAgentEnabled): invokes the real Foundry `loan-concierge`
 *    agent; the model decides which IQ tools to call. `onToolCall` emits the
 *    iq_active / iq_data frames from the agent's *actual* tool calls.
 *  - LOCAL reasoner (default / fallback): deterministically calls the four IQ
 *    tools and applies the underwriting decision matrix, so the app runs with
 *    no Azure configured. Also used if the agent path throws.
 */

import { invokeAgent, ensureAgent } from "./azure/foundry";
import { IQ_TOOLS, TOOL_TO_IQ, IQ_METADATA } from "./iq";
import { CONCIERGE_INSTRUCTIONS, conciergeToolDefinitions } from "./agent-def";
import { getFabricIq } from "./iq/fabric-iq";
import { getWorkIq } from "./iq/work-iq";
import { getWebIq } from "./iq/web-iq";
import { lookupGuidelines } from "./iq/foundry-iq";
import { isFoundryAgentEnabled } from "./constants";
import { FOUNDRY_AGENTS, FOUNDRY_MODEL_DEPLOYMENT } from "./constants";
import type {
  BorrowerProfile,
  Guideline,
  IqId,
  IqToolResult,
  SseEvent,
  WebIqSnapshot,
  WorkIqRecord,
} from "./types";

const CONCIERGE_INSTRUCTIONS_HINT =
  "You are the Loan Concierge. Use the IQ tools to gather a named borrower's data and the underwriting guidelines, then recommend Approve / Approve (conditional) / Refer to underwriter with conditions, attributing each fact to its IQ. For general questions call only lookup_underwriting_guidelines.";

function frame(e: SseEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`;
}

function sourceForIq(iq: IqId): string {
  return IQ_METADATA.find((m) => m.id === iq)?.source ?? "";
}

function extractBorrower(message: string): string | null {
  const m = message.match(/\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (m) return m[1];
  return null;
}

export function runConcierge(message: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: SseEvent) => controller.enqueue(encoder.encode(frame(e)));
      try {
        if (isFoundryAgentEnabled()) {
          await runAgentPath(message, send);
        } else {
          await runLocalPath(message, send);
        }
      } catch (err) {
        // Agent path failed - fall back to the local reasoner so the demo holds.
        try {
          await runLocalPath(message, send);
        } catch (inner) {
          send({ event: "error", message: inner instanceof Error ? inner.message : String(inner) });
        }
        console.error("[concierge] agent path failed:", err instanceof Error ? err.message : err);
      } finally {
        controller.close();
      }
    },
  });
}

// --- Agent path -----------------------------------------------------------

async function runAgentPath(message: string, send: (e: SseEvent) => void): Promise<void> {
  // Self-heal: register the agent (+ its four IQ tools) if the project lacks it.
  await ensureAgent(FOUNDRY_AGENTS.concierge, {
    model: FOUNDRY_MODEL_DEPLOYMENT,
    instructions: CONCIERGE_INSTRUCTIONS,
    tools: conciergeToolDefinitions(),
  });
  const result = await invokeAgent<string>(FOUNDRY_AGENTS.concierge, message, {
    tools: IQ_TOOLS,
    timeoutMs: 90_000,
    onToolCall: (phase, name, res) => {
      const iq = TOOL_TO_IQ[name];
      if (!iq) return;
      if (phase === "start") {
        send({ event: "iq_active", iq, status: "active", detail: `Calling ${name}`, source: sourceForIq(iq) });
      } else {
        const r = res as IqToolResult | undefined;
        if (r) {
          send({ event: "iq_data", iq, data: r.data as Record<string, unknown>, live: r.live });
          send({ event: "iq_active", iq, status: "done", detail: r.detail, source: sourceForIq(iq) });
        }
      }
    },
  });
  for (const chunk of tokenize(result.outputText || "(no answer)")) {
    send({ event: "token", text: chunk });
    await sleep(8);
  }
  send({ event: "done", traceId: result.traceId });
}

// --- Local reasoner path --------------------------------------------------

async function runLocalPath(message: string, send: (e: SseEvent) => void): Promise<void> {
  const borrower = extractBorrower(message);

  // General question (no named borrower): only consult the knowledge base.
  if (!borrower) {
    await runTool("foundry", "lookup_underwriting_guidelines", () => lookupGuidelines(message), send);
    const guidelinesResult = await lookupGuidelines(message);
    const g = guidelinesResult.data as Guideline[];
    const answer =
      `Based on the underwriting knowledge base:\n\n` +
      g.slice(0, 3).map((x) => `- ${x.title}: ${x.content}`).join("\n") +
      `\n\nSource: Foundry IQ knowledge base. ${CONCIERGE_INSTRUCTIONS_HINT}`;
    for (const chunk of tokenize(answer)) {
      send({ event: "token", text: chunk });
      await sleep(8);
    }
    send({ event: "done" });
    return;
  }

  const work = await runTool("work", "get_work_iq", () => getWorkIq(borrower), send);
  const fabric = await runTool("fabric", "get_fabric_iq", () => getFabricIq(borrower), send);
  const loanAmount = (fabric.data as BorrowerProfile)?.loan_amount ?? 0;
  const web = await runTool("web", "get_web_iq", () => getWebIq(message, loanAmount), send);
  const guidelines = await runTool("foundry", "lookup_underwriting_guidelines", () => lookupGuidelines("credit DTI LTV PMI documentation decision matrix"), send);

  const narrative = decide(
    borrower,
    fabric.data as BorrowerProfile | { note: string },
    work.data as WorkIqRecord | { note: string },
    web.data as WebIqSnapshot,
    guidelines.data as Guideline[],
  );
  for (const chunk of tokenize(narrative)) {
    send({ event: "token", text: chunk });
    await sleep(8);
  }
  send({ event: "done" });
}

async function runTool(
  iq: IqId,
  _name: string,
  fn: () => Promise<IqToolResult>,
  send: (e: SseEvent) => void,
): Promise<IqToolResult> {
  send({ event: "iq_active", iq, status: "active", detail: "Working", source: sourceForIq(iq) });
  await sleep(500);
  const result = await fn();
  send({ event: "iq_data", iq, data: result.data as Record<string, unknown>, live: result.live });
  send({ event: "iq_active", iq, status: "done", detail: result.detail, source: sourceForIq(iq) });
  return result;
}

function decide(
  borrower: string,
  fabric: BorrowerProfile | { note: string },
  work: WorkIqRecord | { note: string },
  web: WebIqSnapshot,
  _guidelines: Guideline[],
): string {
  if ("note" in fabric) {
    return `I could not find a borrower record for ${borrower}. ${fabric.note} (Fabric IQ)`;
  }
  const missing = "note" in work ? [] : work.documents_missing;
  const reasons: string[] = [];
  let decision = "Approve (conditional)";

  if (fabric.credit_score >= 680) reasons.push(`Credit score ${fabric.credit_score} meets the 680 threshold. (Fabric IQ)`);
  else {
    decision = "Refer to underwriter";
    reasons.push(`Credit score ${fabric.credit_score} is below the 680 threshold. (Fabric IQ)`);
  }
  if (fabric.ltv <= 0.8) reasons.push(`LTV ${(fabric.ltv * 100).toFixed(0)}% is within the 80% no-PMI limit. (Fabric IQ)`);
  else reasons.push(`LTV ${(fabric.ltv * 100).toFixed(0)}% exceeds 80% - PMI required. (Fabric IQ)`);
  if (fabric.dti <= 0.43) reasons.push(`DTI ${(fabric.dti * 100).toFixed(0)}% is within the 43% QM limit. (Fabric IQ)`);
  else {
    decision = "Refer to underwriter";
    reasons.push(`DTI ${(fabric.dti * 100).toFixed(0)}% exceeds the 43% QM limit. (Fabric IQ)`);
  }

  const conditions = missing.map((m) => `Collect: ${m} (Work IQ)`);
  conditions.push(`Lock quote referenced today's 30-yr fixed at ${web.avg_30yr_fixed}%. (Web IQ)`);

  return (
    `Recommendation for ${borrower}: ${decision}\n\n` +
    `Loan: $${fabric.loan_amount.toLocaleString()} on a $${fabric.property_value.toLocaleString()} property ` +
    `(LTV ${(fabric.ltv * 100).toFixed(0)}%, DTI ${(fabric.dti * 100).toFixed(0)}%, FICO ${fabric.credit_score}).\n` +
    `Today's 30-yr fixed benchmark: ${web.avg_30yr_fixed}%.\n\n` +
    `Why:\n${reasons.map((r) => `  - ${r}`).join("\n")}\n\n` +
    `Conditions:\n${(conditions.length ? conditions : ["None"]).map((c) => `  - ${c}`).join("\n")}\n\n` +
    `Sources: credit/income - Fabric IQ; documents/employment - Work IQ; rates/regulatory - Web IQ; rules + decision - Foundry IQ.`
  );
}

function tokenize(text: string): string[] {
  return text.replace(/\n/g, " \n ").split(" ").map((w) => w + " ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
