import { MODES } from "../modes.ts";
import type { GameMode } from "../api.ts";

type Props = {
  selected: GameMode;
  onChange: (mode: GameMode) => void;
};

export function ModeSelector({ selected, onChange }: Props) {
  return (
    <div className="card">
      <div className="section-title">Mode</div>
      <div className="modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`mode-card ${selected === m.id ? "active" : ""}`}
            style={{ "--mode-color": m.color } as React.CSSProperties}
            onClick={() => onChange(m.id)}
          >
            <div className="mode-label">{m.label}</div>
            <div className="mode-meta">{m.doors} portes</div>
            <div className="mode-meta">
              {m.safe} coffres · {m.alarm} alarme{m.alarm > 1 ? "s" : ""}
            </div>
            <div className="mode-risk">Risque : {m.risk}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
