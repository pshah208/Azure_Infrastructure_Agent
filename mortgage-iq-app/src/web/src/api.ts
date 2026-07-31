import type { IQMeta } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface AppConfig {
  mode: "mock" | "foundry";
  model: string;
  iqs: IQMeta[];
}

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch(`${API_BASE}/api/config`);
  if (!res.ok) throw new Error(`config failed: ${res.status}`);
  return res.json();
}

export interface StreamHandlers {
  onIQ: (e: { iq: string; status: string; detail: string; source: string | null }) => void;
  onData: (e: { iq: string; data: Record<string, unknown>; live: boolean }) => void;
  onToken: (text: string) => void;
  onMessage: (role: string, content: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

/**
 * POST the message and parse the Server-Sent Events stream. We use fetch +
 * ReadableStream (not EventSource) because the endpoint is a POST.
 */
export async function streamChat(message: string, h: StreamHandlers): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.body) throw new Error("no response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const evLine = frame.split("\n").find((l) => l.startsWith("event:"));
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!evLine || !dataLine) continue;
      const event = evLine.slice(6).trim();
      const data = JSON.parse(dataLine.slice(5).trim());

      switch (event) {
        case "iq_active":
          h.onIQ(data);
          break;
        case "iq_data":
          h.onData(data);
          break;
        case "token":
          h.onToken(data.text);
          break;
        case "message":
          h.onMessage(data.role, data.content);
          break;
        case "error":
          h.onError(data.message);
          break;
        case "done":
          h.onDone();
          break;
      }
    }
  }
}
