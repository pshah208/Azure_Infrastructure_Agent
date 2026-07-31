import { useEffect, useMemo, useRef, useState } from "react";
import { fetchConfig, streamChat, type AppConfig } from "./api";
import { ChatPanel } from "./components/ChatPanel";
import { IQPanel } from "./components/IQPanel";
import type { ChatMessage, IQId, IQState } from "./types";

const FALLBACK_IQS: IQState[] = [
  { id: "work", name: "Work IQ", source: "Microsoft 365 + Graph",
    blurb: "Borrower documents, email, and collaboration context.", status: "idle", detail: "" },
  { id: "fabric", name: "Fabric IQ", source: "Microsoft Fabric (OneLake)",
    blurb: "Governed business data: credit, income, valuation.", status: "idle", detail: "" },
  { id: "foundry", name: "Foundry IQ", source: "Azure AI Foundry",
    blurb: "Agent reasoning + knowledge grounding (AI Search).", status: "idle", detail: "" },
  { id: "web", name: "Web IQ", source: "Grounding with Bing",
    blurb: "Live market rates and regulatory context from the web.", status: "idle", detail: "" },
];

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [iqs, setIqs] = useState<IQState[]>(FALLBACK_IQS);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const streamBuffer = useRef("");

  useEffect(() => {
    fetchConfig()
      .then((c) => {
        setConfig(c);
        setIqs(c.iqs.map((m) => ({ ...m, status: "idle", detail: "" })));
      })
      .catch(() => setConfig({ mode: "mock", model: "mock-reasoner", iqs: FALLBACK_IQS }));
  }, []);

  const resetIQs = () =>
    setIqs((prev) => prev.map((iq) => ({ ...iq, status: "idle", detail: "" })));

  const setIQ = (id: IQId, status: "active" | "done", detail: string) =>
    setIqs((prev) => prev.map((iq) => (iq.id === id ? { ...iq, status, detail } : iq)));

  const onSend = async (text: string) => {
    setMessages((m) => [...m, { role: "user", content: text }]);
    setStreaming(true);
    resetIQs();
    streamBuffer.current = "";
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      await streamChat(text, {
        onIQ: (e) => setIQ(e.iq as IQId, e.status as "active" | "done", e.detail),
        onToken: (t) => {
          streamBuffer.current += t;
          const content = streamBuffer.current;
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", content };
            return copy;
          });
        },
        onMessage: () => {},
        onError: (msg) => {
          setMessages((m) => [...m, { role: "assistant", content: `Error: ${msg}` }]);
        },
        onDone: () => setStreaming(false),
      });
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Connection error: ${err}` }]);
      setStreaming(false);
    }
  };

  const modeBadge = useMemo(() => {
    if (!config) return "connecting...";
    return config.mode === "foundry" ? `Foundry - ${config.model}` : "Mock mode (no Azure required)";
  }, [config]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Mortgage IQ</h1>
          <span className="tagline">Azure Container Apps + Foundry Agents - showcasing the 4 Microsoft IQs</span>
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
