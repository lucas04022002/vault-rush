import { formatCoins } from "../lib/format.ts";

export type BalanceProps = {
  /** Solde en centimes de coin. */
  cents: number;
};

/** La pilule de solde, en Space Mono jaune. */
export function Balance({ cents }: BalanceProps) {
  return (
    <span className="balance">
      <span className="balance__label">Solde</span>
      <span className="balance__value">{formatCoins(cents)}</span>
    </span>
  );
}
