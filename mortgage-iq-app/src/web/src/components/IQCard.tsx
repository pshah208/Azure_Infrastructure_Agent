import type { IQState } from "../types";

const ICON: Record<string, string> = {
  work: "📇",
  fabric: "🗄️",
  foundry: "🧠",
  web: "🌐",
};

export function IQCard({ iq }: { iq: IQState }) {
  return (
    <div className={`iq-card iq-${iq.id} status-${iq.status}`}>
      <div className="iq-card-head">
        <span className="iq-icon">{ICON[iq.id]}</span>
        <div>
          <div className="iq-name">{iq.name}</div>
          <div className="iq-source">{iq.source}</div>
        </div>
        <span className={`iq-badge badge-${iq.status}`}>
          {iq.status === "active" ? "ACTIVE" : iq.status === "done" ? "DONE" : "IDLE"}
        </span>
      </div>
      <div className="iq-blurb">{iq.blurb}</div>
      <div className="iq-detail">{iq.detail || "\u00a0"}</div>
      {iq.status === "active" && <div className="iq-pulse-bar" />}
    </div>
  );
}
