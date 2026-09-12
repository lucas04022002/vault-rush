type Props = {
  floor: number;
  maxFloor: number;
  multiplier: number;
  potentialWin: number;
  balance: number;
};

export function GameHeader({ floor, maxFloor, multiplier, potentialWin, balance }: Props) {
  return (
    <div className="card game-header">
      <div className="gh-top">
        <span className="gh-balance">{balance} <span className="coins">coins</span></span>
        <span className="gh-floor">Étage {floor} / {maxFloor}</span>
      </div>

      <div className="gh-mult">x{multiplier.toFixed(2)}</div>

      <div className="gh-win">
        Gain potentiel : <b>{potentialWin}</b> coins
      </div>
    </div>
  );
}
