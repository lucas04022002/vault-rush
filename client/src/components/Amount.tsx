import { formatCoins } from "../lib/format.ts";

export type AmountProps = {
  /** Montant en centimes de coin. */
  cents: number;
  /** Préfixe le signe (+ ou −) et colore gain / perte. */
  signed?: boolean;
  className?: string;
};

/** Un montant en coins, toujours formaté de la même façon. */
export function Amount({ cents, signed = false, className }: AmountProps) {
  const tone = signed ? (cents < 0 ? "bad" : "good") : undefined;
  return (
    <span className={className ? `amount ${className}` : "amount"} data-tone={tone}>
      {formatCoins(cents, { signed })}
    </span>
  );
}
