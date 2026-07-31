export type IQId = "work" | "fabric" | "foundry" | "web";
export type IQStatus = "idle" | "active" | "done";

export interface IQMeta {
  id: IQId;
  name: string;
  source: string;
  blurb: string;
}

export interface IQState extends IQMeta {
  status: IQStatus;
  detail: string;
  data?: Record<string, unknown>;
  live?: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Server-Sent Event payloads emitted by the orchestrator.
export interface IQActiveEvent {
  iq: IQId;
  status: "active" | "done";
  detail: string;
  source: string | null;
}
