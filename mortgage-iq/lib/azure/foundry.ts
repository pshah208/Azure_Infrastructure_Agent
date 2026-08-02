/**
 * Node-side Azure AI Foundry agent invocation client.
 *
 * Modelled on Lulu IQ's lib/azure/foundry.ts, extended with a client-side
 * function-tool loop so the Loan Concierge agent can call the four IQ tools
 * (Fabric IQ, Work IQ, Web IQ, Foundry IQ knowledge) live. Lulu's invokeAgent
 * treats `requires_action` as terminal because its agents use server-side tools;
 * ours resolves `requires_action` by dispatching to the provided tool map and
 * submitting the outputs, then continues the run.
 *
 * Surface:
 *  - `invokeAgent(agentName, input, { tools, onToolCall, ... })` — resolves the
 *    agent ID by display name (cached), creates a thread, posts the message,
 *    runs, drives the tool loop, and returns an `InvokeAgentResult` envelope.
 *
 * Auth: the shared credential from lib/azure/identity.ts. The identity needs
 * `Cognitive Services OpenAI User` + the agents data-plane role on the project.
 */

import { AgentsClient } from "@azure/ai-agents";
import { getAzureCredential } from "./identity";
import { FOUNDRY_PROJECT_ENDPOINT } from "../constants";
import type { ToolFn } from "../types";

let cachedAgentsClient: AgentsClient | undefined;

/** Minimal shape of a required-action tool call (SDK union is awkward to narrow). */
interface RawToolCall {
  id: string;
  type: string;
  function?: { name: string; arguments: string };
}

/** Lazily-instantiated `AgentsClient` for the project endpoint. */
export function getAgentsClient(
  endpoint: string = process.env.FOUNDRY_PROJECT_ENDPOINT ?? FOUNDRY_PROJECT_ENDPOINT,
): AgentsClient {
  if (!cachedAgentsClient) {
    cachedAgentsClient = new AgentsClient(endpoint, getAzureCredential());
  }
  return cachedAgentsClient;
}

/** Cache of agent-display-name -> agent-ID, populated on first lookup. */
const agentIdCache = new Map<string, string>();

async function resolveAgentId(name: string): Promise<string> {
  const cached = agentIdCache.get(name);
  if (cached) return cached;
  const client = getAgentsClient();
  for await (const a of client.listAgents()) {
    if (a.name) agentIdCache.set(a.name, a.id);
  }
  const found = agentIdCache.get(name);
  if (!found) {
    throw new Error(
      `Foundry agent '${name}' not found in project. Available: ` +
        Array.from(agentIdCache.keys()).join(", "),
    );
  }
  return found;
}

export interface InvokeAgentOptions {
  /** Continue an existing conversation; default is a fresh thread per call. */
  threadId?: string;
  /** Function tools the agent may call, keyed by tool name. */
  tools?: Record<string, ToolFn>;
  /** Called just before a tool runs and just after, for live IQ telemetry. */
  onToolCall?: (phase: "start" | "end", name: string, result?: unknown) => void;
  pollIntervalMs?: number;
  timeoutMs?: number;
  endpoint?: string;
}

export interface InvokeAgentResult<TOutput = string> {
  output: TOutput;
  outputText: string;
  traceId: string;
  threadId: string;
  latencyMs: number;
  status: string;
  /** Names of the tools the agent invoked, in call order. */
  toolsCalled: string[];
}

/** Invoke a Foundry agent by display-name with a single user-message input. */
export async function invokeAgent<TOutput = string>(
  agentName: string,
  input: unknown,
  options: InvokeAgentOptions = {},
): Promise<InvokeAgentResult<TOutput>> {
  const client = getAgentsClient(options.endpoint);
  const startedAt = Date.now();
  const agentId = await resolveAgentId(agentName);
  const userMessage = typeof input === "string" ? input : JSON.stringify(input);

  const thread = options.threadId
    ? { id: options.threadId }
    : await client.threads.create();
  await client.messages.create(thread.id, "user", userMessage);

  let run = await client.runs.create(thread.id, agentId);
  const pollInterval = options.pollIntervalMs ?? 700;
  const deadline = startedAt + (options.timeoutMs ?? 90_000);
  const toolsCalled: string[] = [];
  const tools = options.tools ?? {};

  const isTerminal = (s: string) =>
    s === "completed" || s === "failed" || s === "cancelled" || s === "expired";

  while (!isTerminal(run.status)) {
    if (Date.now() > deadline) {
      throw new Error(
        `Foundry agent '${agentName}' run ${run.id} exceeded timeout (status=${run.status})`,
      );
    }

    if (run.status === "requires_action") {
      const action = run.requiredAction as
        | { submitToolOutputs?: { toolCalls: RawToolCall[] } }
        | undefined;
      const calls: RawToolCall[] = action?.submitToolOutputs?.toolCalls ?? [];
      const outputs: { toolCallId: string; output: string }[] = [];
      for (const call of calls) {
        if (call.type !== "function" || !call.function) continue;
        const name = call.function.name;
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(call.function.arguments || "{}");
        } catch {
          parsedArgs = {};
        }
        const fn = tools[name];
        let outputStr: string;
        if (!fn) {
          outputStr = JSON.stringify({ error: `unknown tool '${name}'` });
        } else {
          options.onToolCall?.("start", name);
          try {
            const result = await fn(parsedArgs);
            options.onToolCall?.("end", name, result);
            outputStr = JSON.stringify(result.data);
          } catch (err) {
            outputStr = JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        toolsCalled.push(name);
        outputs.push({ toolCallId: call.id, output: outputStr });
      }
      run = await client.runs.submitToolOutputs(thread.id, run.id, outputs);
      continue;
    }

    await new Promise((r) => setTimeout(r, pollInterval));
    run = await client.runs.get(thread.id, run.id);
  }

  if (run.status !== "completed") {
    const errMsg = run.lastError
      ? `${run.lastError.code}: ${run.lastError.message}`
      : `status=${run.status}`;
    throw new Error(
      `Foundry agent '${agentName}' run ${run.id} did not complete: ${errMsg}`,
    );
  }

  let assistantText = "";
  for await (const m of client.messages.list(thread.id, {
    order: "desc",
    runId: run.id,
  })) {
    if (m.role === "assistant") {
      assistantText = m.content
        .filter((c): c is Extract<typeof c, { type: "text" }> => c.type === "text")
        .map((c) => c.text.value)
        .join("\n");
      break;
    }
  }

  let parsed: TOutput;
  try {
    const trimmed = assistantText.trim();
    parsed =
      trimmed.startsWith("{") || trimmed.startsWith("[")
        ? (JSON.parse(trimmed) as TOutput)
        : (assistantText as unknown as TOutput);
  } catch {
    parsed = assistantText as unknown as TOutput;
  }

  return {
    output: parsed,
    outputText: assistantText,
    traceId: run.id,
    threadId: thread.id,
    latencyMs: Date.now() - startedAt,
    status: run.status,
    toolsCalled,
  };
}
