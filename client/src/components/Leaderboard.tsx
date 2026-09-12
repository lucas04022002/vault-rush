import { useEffect, useState } from "react";
import { api, type LeaderboardEntry } from "../api.ts";

type Props = { currentUsername: string };

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ currentUsername }: Props) {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    api.leaderboard().then(setRows).catch(() => {});
  }, []);

  if (rows.length === 0) return null;

  return (
    <div className="card">
      <div className="section-title">🏆 Classement</div>
      <div className="lb-list">
        {rows.map((r, i) => (
          <div
            key={r.username}
            className={`lb-row ${r.username === currentUsername ? "me" : ""}`}
          >
            <span className="lb-rank">{MEDALS[i] ?? `#${i + 1}`}</span>
            <span className="lb-name">{r.username}</span>
            <span className="lb-best" title="Plus gros gain">
              {r.bestPayout > 0 ? `💰 ${r.bestPayout}` : "—"}
            </span>
            <span className="lb-balance">
              {r.balance} <span className="coins">c</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
