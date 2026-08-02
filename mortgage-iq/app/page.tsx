"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChatPanel, type ChatMessage } from "@/components/ChatPanel";
import { IQPanel } from "@/components/IQPanel";
import type { IqCardState } from "@/components/IQCard";
import type { IqId, IqMeta } from "@/lib/types";

interface AppConfig {
  mode: "agent" | "foundry" | "local";
  model: string;
  iqs: IqMeta[];
}

const FALLBACK_IQS: IqMeta[] = [
  { id: "work", name: "Work IQ", source: "Microsoft 365 + Graph", blurb: "Borrower documents, employment and last contact." },
  { id: "fabric", name: "Fabric IQ", source: "Microsoft Fabric (OneLake)", blurb: "Governed business data: credit, income, valuation." },
  { id: "foundry", name: "Foundry IQ", source: "Azure AI Foundry", blurb: "Agent reasoning + underwriting-guideline knowledge." },
  { id: "web", name: "Web IQ", source: "Grounding with Bing", blurb: "Live market rates and regulatory context." },
];

function toCards(iqs: IqMeta[]): IqCardState[] {
  return iqs.map((m) => ({ ...m, status: "idle", detail: "", data: undefined, live: undefined }));
}

export default function Home() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [iqs, setIqs] = useState<IqCardState[]>(toCards(FALLBACK_IQS));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const buffer = useRef("");

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c: AppConfig) => {
        setConfig(c);
        if (c.iqs?.length) setIqs(toCards(c.iqs));
      })
      .catch(() => setConfig({ mode: "local", model: "local-reasoner", iqs: FALLBACK_IQS }));
  }, []);

  const resetIQs = () =>
    setIqs((prev) => prev.map((iq) => ({ ...iq, status: "idle", detail: "", data: undefined, live: undefined })));
  const setIQ = (id: IqId, status: "active" | "done", detail: string) =>
    setIqs((prev) => prev.map((iq) => (iq.id === id ? { ...iq, status, detail } : iq)));
  const setIQData = (id: IqId, data: Record<string, unknown>, live: boolean) =>
    setIqs((prev) => prev.map((iq) => (iq.id === id ? { ...iq, data, live } : iq)));

  async function onSend(text: string) {
    setMessages((m) => [...m, { role: "user", content: text }]);
    setStreaming(true);
    resetIQs();
    buffer.current = "";
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.body) throw new Error("no response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        const frames = sseBuf.split("\n\n");
        sseBuf = frames.pop() ?? "";
        for (const f of frames) {
          const dataLine = f.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const evt = JSON.parse(dataLine.slice(5).trim());
          handleEvent(evt);
        }
      }
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Connection error: ${String(err)}` }]);
    } finally {
      setStreaming(false);
    }
  }

  function handleEvent(evt: Record<string, unknown>) {
    switch (evt.event) {
      case "iq_active":
        setIQ(evt.iq as IqId, evt.status as "active" | "done", String(evt.detail ?? ""));
        break;
      case "iq_data":
        setIQData(evt.iq as IqId, evt.data as Record<string, unknown>, Boolean(evt.live));
        break;
      case "token": {
        buffer.current += String(evt.text ?? "");
        const content = buffer.current;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content };
          return copy;
        });
        break;
      }
      case "error":
        setMessages((m) => [...m, { role: "assistant", content: `Error: ${String(evt.message)}` }]);
        break;
    }
  }

  const modeBadge = useMemo(() => {
    if (!config) return "connecting...";
    if (config.mode === "agent") return `Foundry Agent - ${config.model}`;
    if (config.mode === "foundry") return `Foundry - ${config.model}`;
    return "Local mode (no Azure required)";
  }, [config]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Mortgage IQ</h1>
          <span className="tagline">Azure Container Apps + Foundry agent - the 4 Microsoft IQs</span>
        </div>
        <span className="mode-badge">{modeBadge}</span>
      </header>
      <main className="layout">
        <ChatPanel messages={messages} streaming={streaming} onSend={onSend} />
        <IQPanel iqs={iqs} />
      </main>
    </div>
  );
}
