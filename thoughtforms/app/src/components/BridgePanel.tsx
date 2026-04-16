import type { BootstrapPayload, ChatMessage } from "../types";

type BridgePanelProps = {
  bootstrap: BootstrapPayload | null;
  messages: ChatMessage[];
  prompt: string;
  loading: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onResetTransient: () => void;
  onReload: () => void;
};

const SUGGESTIONS = [
  "today",
  "focus tasks",
  "goals",
  "notes about sleep",
  "projects"
];

export function BridgePanel({
  bootstrap,
  messages,
  prompt,
  loading,
  onPromptChange,
  onSubmit,
  onResetTransient,
  onReload
}: BridgePanelProps) {
  const counts = bootstrap?.context?.counts ?? {};
  const countEntries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const statusEntries = Object.entries(bootstrap?.context?.status ?? {}).slice(0, 6);

  return (
    <aside className="bridge-panel">
      <div className="bridge-hero">
        <p className="eyebrow">Thoughtforms / Sidecar Prototype</p>
        <h1>Whiteboard that lightly touches Chronos.</h1>
        <p className="hero-copy">
          This POC stays outside the engine. It reads Chronos through a tiny delegated API layer and turns query results into movable cards.
        </p>
        <div className="bridge-actions">
          <button type="button" className="primary" onClick={onReload}>
            Reload Chronos
          </button>
          <button type="button" onClick={onResetTransient}>
            Clear Query Cards
          </button>
        </div>
      </div>

      <div className="bridge-section">
        <div className="section-title-row">
          <h2>Bridge</h2>
          {loading ? <span className="status-pill">Querying</span> : null}
        </div>
        <div className="composer">
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Ask for a Chronos slice, like 'today', 'focus tasks', or 'goals'."
            rows={4}
          />
          <button type="button" className="primary" onClick={onSubmit} disabled={loading}>
            Surface Cards
          </button>
        </div>
        <div className="suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => onPromptChange(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div className="bridge-section">
        <h2>Transcript</h2>
        <div className="transcript">
          {messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <span className="message-role">{message.role}</span>
              <p>{message.text}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="bridge-section">
        <h2>Chronos Snapshot</h2>
        <div className="snapshot-grid">
          <div className="snapshot-card">
            <span className="snapshot-label">Profile</span>
            <strong>{bootstrap?.context?.profile?.nickname || "Unknown"}</strong>
            <span>{bootstrap?.context?.profile?.theme || "No theme set"}</span>
          </div>
          <div className="snapshot-card">
            <span className="snapshot-label">Today</span>
            <strong>{bootstrap?.context?.today?.blockCount ?? 0} blocks</strong>
            <span>{bootstrap?.context?.today?.date || "No schedule loaded"}</span>
          </div>
        </div>
        <div className="mini-list">
          <h3>Status</h3>
          {statusEntries.length ? (
            statusEntries.map(([key, value]) => (
              <div key={key} className="mini-row">
                <span>{key}</span>
                <strong>{value}</strong>
              </div>
            ))
          ) : (
            <p className="empty-copy">No current status snapshot was found.</p>
          )}
        </div>
        <div className="mini-list">
          <h3>Top Item Types</h3>
          {countEntries.length ? (
            countEntries.map(([key, value]) => (
              <div key={key} className="mini-row">
                <span>{key}</span>
                <strong>{value}</strong>
              </div>
            ))
          ) : (
            <p className="empty-copy">No item counts available.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
