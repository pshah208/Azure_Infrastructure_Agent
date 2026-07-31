import type { IQState } from "../types";
import { IQCard } from "./IQCard";

export function IQPanel({ iqs }: { iqs: IQState[] }) {
  return (
    <section className="iq-panel">
      <h2 className="panel-title">Active Microsoft IQ</h2>
      <p className="panel-sub">Watch which intelligence layer lights up as the agent works.</p>
      <div className="iq-grid">
        {iqs.map((iq) => (
          <IQCard key={iq.id} iq={iq} />
        ))}
      </div>
    </section>
  );
}
