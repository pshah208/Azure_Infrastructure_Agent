import { IQCard, type IqCardState } from "./IQCard";

export function IQPanel({ iqs }: { iqs: IqCardState[] }) {
  return (
    <section className="iq-panel">
      <h2 className="panel-title">Active Microsoft IQ</h2>
      <p className="panel-sub">Each card lights up from the agent&apos;s real tool calls.</p>
      <div className="iq-grid">
        {iqs.map((iq) => (
          <IQCard key={iq.id} iq={iq} />
        ))}
      </div>
    </section>
  );
}
