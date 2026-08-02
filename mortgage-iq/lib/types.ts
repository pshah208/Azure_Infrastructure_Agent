/** Shared domain + wiring types for Mortgage IQ. */

/** The four Microsoft IQs, used as the id for tools, events and UI cards. */
export type IqId = "work" | "fabric" | "foundry" | "web";

/** How an agent/surface is backed (mirrors Lulu IQ's `backend` field). */
export type AgentBackend =
  | "foundry-agent"
  | "function-tool"
  | "aoai"
  | "fabric-sql"
  | "graph"
  | "ai-search";

/** Metadata-driven agent/surface roster entry. */
export interface Agent {
  id: string;
  name: string;
  purpose: string;
  iq: IqId | "all";
  backend: AgentBackend;
  model?: string;
  surfaces: string[];
}

/** IQ card metadata for the UI. */
export interface IqMeta {
  id: IqId;
  name: string;
  source: string;
  blurb: string;
}

/** A borrower's underwriting profile (Fabric IQ). */
export interface BorrowerProfile {
  full_name: string;
  credit_score: number;
  annual_income: number;
  monthly_debt: number;
  loan_amount: number;
  property_value: number;
  ltv: number;
  dti: number;
}

/** A borrower's document intake (Work IQ). */
export interface WorkIqRecord {
  full_name: string;
  documents_received: string[];
  documents_missing: string[];
  employment_status: string;
  last_contact: string;
}

/** Market snapshot (Web IQ). */
export interface WebIqSnapshot {
  avg_30yr_fixed: number;
  avg_15yr_fixed: number;
  rate_trend: string;
  regulatory_note: string;
}

/** A retrieved underwriting guideline (Foundry IQ knowledge). */
export interface Guideline {
  id?: string;
  title: string;
  content: string;
  category?: string;
}

/** Result envelope every IQ tool returns. */
export interface IqToolResult<T = unknown> {
  data: T;
  detail: string;
  live: boolean;
}

/** A function tool the agent can call; returns a JSON-serialisable result. */
export type ToolFn = (args: Record<string, unknown>) => Promise<IqToolResult>;

/** Server-Sent Event frames the assistant route streams to the browser. */
export type SseEvent =
  | { event: "iq_active"; iq: IqId; status: "active" | "done"; detail: string; source: string }
  | { event: "iq_data"; iq: IqId; data: Record<string, unknown>; live: boolean }
  | { event: "token"; text: string }
  | { event: "message"; role: "assistant"; content: string }
  | { event: "error"; message: string }
  | { event: "done"; traceId?: string };
