import type { HistoryItem } from "../api.ts";
import { modeInfo } from "../modes.ts";

type Props = { items: HistoryItem[] };

const LABELS: Record<HistoryItem["result"], string> = {
  cashed_out: "Encaissé",
  lost: "Perdu",
  playing: "En cours",
};

export function History({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="card">
        <div className="section-title">Historique</div>
        <p className="hist-empty">Aucune partie pour l'instant. Lance ton premier braquage !</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="section-title">Dernières parties</div>
      <div className="hist-list">
        {items.map((it) => {
          const won = it.result === "cashed_out" && it.payout > 0;
          const net = it.payout - it.betAmount;
          return (
            <div key={it.id} className="hist-row">
              <span
                className="hist-mode"
                style={{ color: modeInfo(it.mode).color }}
              >
                {modeInfo(it.mode).label}
              </span>
              <span className="hist-bet">mise {it.betAmount}</span>
              <span className={`hist-result ${won ? "win" : "loss"}`}>
                {LABELS[it.result]}
              </span>
              <span className={`hist-net ${net >= 0 ? "win" : "loss"}`}>
                {net >= 0 ? "+" : ""}
                {net}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
