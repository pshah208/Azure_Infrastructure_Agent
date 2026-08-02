import type { IqId, IqMeta } from "@/lib/types";

export interface IqCardState extends IqMeta {
  status: "idle" | "active" | "done";
  detail: string;
  data?: Record<string, unknown>;
  live?: boolean;
}

const ICON: Record<IqId, string> = { work: "📇", fabric: "🗄️", foundry: "🧠", web: "🌐" };

function formatValue(v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
  if (typeof v === "number") return v.toLocaleString();
  if (v === null || v === undefined) return "";
  return String(v);
}

export function IQCard({ iq }: { iq: IqCardState }) {
  const entries = iq.data ? Object.entries(iq.data).filter(([k]) => k !== "live") : [];
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
      {iq.data && (
        <>
          <div className={`iq-provenance ${iq.live ? "prov-live" : "prov-mock"}`}>
            {iq.live ? "● LIVE data" : "○ local/synthetic"}
          </div>
          {entries.length > 0 && (
            <div className="iq-data">
              {entries.map(([k, v]) => (
                <div className="iq-data-row" key={k}>
                  <span className="iq-data-key">{k.replace(/_/g, " ")}</span>
                  <span className="iq-data-val">{formatValue(v)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {iq.status === "active" && <div className="iq-pulse-bar" />}
    </div>
  );
}
