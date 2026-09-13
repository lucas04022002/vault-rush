import { useState } from "react";
import { ApiError, wallet } from "../api.ts";
import { Button, Toast } from "../components/index.ts";
import { formatCoins } from "../lib/format.ts";
import { errorMessage } from "../lib/messages.ts";

/** Solde sous lequel la recharge gratuite est proposée (10,00 coins). */
export const REFILL_THRESHOLD_CENTS = 1000;
/** Montant de la recharge gratuite, côté serveur (`wallet.service.ts`). */
export const REFILL_AMOUNT_CENTS = 100_000;

/** La recharge gratuite : un bouton et son message, rien de plus. */
export function Refill({ onBalance }: { onBalance: (cents: number) => void }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function recharger() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const { balanceCents } = await wallet.refill();
      onBalance(balanceCents);
      setFailed(false);
      setMessage(`Recharge effectuée : nouveau solde ${formatCoins(balanceCents)}.`);
    } catch (err) {
      setFailed(true);
      setMessage(refillError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="refill">
      <Button variant="secondary" pending={pending} onClick={() => void recharger()}>
        {`Recharge gratuite (${formatCoins(REFILL_AMOUNT_CENTS)})`}
      </Button>
      {message ? <Toast kind={failed ? "bad" : "good"}>{message}</Toast> : null}
    </div>
  );
}

/** « Prochaine recharge possible dans … » quand le serveur donne l'heure. */
function refillError(err: unknown): string {
  if (err instanceof ApiError && err.code === "refill_cooldown") {
    const secondes = Number(err.payload.retryAfterSeconds);
    if (Number.isFinite(secondes) && secondes > 0) {
      const heures = Math.ceil(secondes / 3600);
      return `Prochaine recharge possible dans ${heures} h.`;
    }
    return "Prochaine recharge possible dans moins de 24 heures : une seule par jour.";
  }
  return errorMessage(err);
}
