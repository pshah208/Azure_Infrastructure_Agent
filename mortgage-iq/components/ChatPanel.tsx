"use client";

import { useState } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SAMPLE = "Assess the mortgage application for Priya Nair";

export function ChatPanel({
  messages,
  streaming,
  onSend,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState(SAMPLE);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || streaming) return;
    onSend(text.trim());
  };

  return (
    <section className="chat-panel">
      <h2 className="panel-title">Loan Concierge</h2>
      <p className="panel-sub">Ask anything about a mortgage application - the agent calls the IQ tools it needs.</p>
      <div className="chat-log">
        {messages.length === 0 && (
          <div className="chat-empty">Try: &quot;Assess the mortgage application for Priya Nair&quot; or &quot;What is the max DTI?&quot;</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <pre>{m.content}</pre>
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask the Loan Concierge..."
          disabled={streaming}
        />
        <button type="submit" disabled={streaming}>
          {streaming ? "Working..." : "Send"}
        </button>
      </form>
    </section>
  );
}
