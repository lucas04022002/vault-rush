import { QUICK_BETS } from "../modes.ts";

type Props = {
  bet: number;
  balance: number;
  onChange: (bet: number) => void;
};

export function BetSelector({ bet, balance, onChange }: Props) {
  const clamp = (v: number) => Math.max(1, Math.min(v, balance || 1));

  return (
    <div className="card">
      <div className="section-title">Choisis ta mise</div>

      <div className="bet-stepper">
        <button className="step-btn" onClick={() => onChange(clamp(bet - 1))}>
          −
        </button>
        <div className="bet-amount">
          {bet} <span className="coins">coins</span>
        </div>
        <button className="step-btn" onClick={() => onChange(clamp(bet + 1))}>
          +
        </button>
      </div>

      <div className="quick-bets">
        {QUICK_BETS.map((v) => (
          <button
            key={v}
            className={`quick-bet ${bet === v ? "active" : ""}`}
            disabled={v > balance}
            onClick={() => onChange(v)}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
