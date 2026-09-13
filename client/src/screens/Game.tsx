import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, wallet } from "../api.ts";
import { Button, PageTitle, Toast } from "../components/index.ts";
import { Bilan } from "../games/Bilan.tsx";
import { BetForm } from "../games/BetForm.tsx";
import { accentFor } from "../games/boards/index.ts";
import { PlayPanel } from "../games/PlayPanel.tsx";
import { useLadderGame } from "../games/useLadderGame.ts";
import { formatCoins } from "../lib/format.ts";
import { errorMessage } from "../lib/messages.ts";
import { playOutcome } from "../lib/sound.ts";
import { useSession } from "../session.tsx";

/** Solde sous lequel la recharge gratuite est proposée (10,00 coins). */
const REFILL_THRESHOLD_CENTS = 1000;
/** Montant de la recharge gratuite, côté serveur (`wallet.service.ts`). */
const REFILL_AMOUNT_CENTS = 100_000;

/** L'écran de jeu, le même pour tous les jeux d'échelle. */
export function Game() {
  const { game = "" } = useParams();
  const { balanceCents, setBalance } = useSession();
  const partie = useLadderGame(game);
  const { config, round, state } = partie;

  const heading = useRef<HTMLHeadingElement>(null);
  const previousState = useRef<string | null>(null);
  const previousRound = useRef(round);

  // Le focus suit le changement d'écran (mise → jeu → bilan), jamais à l'arrivée.
  useEffect(() => {
    if (previousState.current !== null && previousState.current !== state) {
      heading.current?.focus();
    }
    previousState.current = state;
  }, [state]);

  // Le son ne part qu'APRÈS une réponse du serveur, et jamais sur une reprise.
  useEffect(() => {
    const avant = previousRound.current;
    previousRound.current = round;
    if (!round || !avant || avant.id !== round.id) return;
    if (round.status === "lost") playOutcome("danger");
    else if (round.status === "cashed_out") playOutcome("cashout");
    else if (round.step > avant.step) playOutcome("safe");
  }, [round]);

  if (partie.loading) {
    return (
      <p className="page__loading" role="status">
        Chargement du jeu…
      </p>
    );
  }

  if (!config) {
    return <Toast kind="bad">{partie.error ?? "Ce jeu n'existe pas."}</Toast>;
  }

  const titre =
    state === "idle"
      ? "Choisis ta mise"
      : state === "active" && round
        ? `Étape ${Math.min(round.step + 1, config.steps)} sur ${config.steps}`
        : "Fin de partie";

  return (
    <>
      <PageTitle
        eyebrow={`${config.steps} ${config.labels.step}s · coins fictifs`}
        accent={accentFor(config.id)}
      >
        {config.name}
      </PageTitle>

      <p className="screen__aside">
        <Link to={`/regles/${config.id}`}>Voir les règles de {config.name}</Link>
      </p>

      <h2 className="screen__state" ref={heading} tabIndex={-1}>
        {titre}
      </h2>

      {partie.resumed && state === "active" ? (
        <Toast kind="info">Partie en cours reprise.</Toast>
      ) : null}
      {partie.error ? <Toast kind="bad">{partie.error}</Toast> : null}
      {/* Un 409 adopté (reprise, partie déjà close) informe : il n'est pas rouge. */}
      {partie.notice && !partie.error ? <Toast kind="info">{partie.notice}</Toast> : null}
      {partie.message && !partie.error && !partie.notice ? (
        <Toast kind={round?.status === "lost" ? "bad" : "good"}>{partie.message}</Toast>
      ) : null}

      {state === "idle" ? (
        <BetForm
          config={config}
          pending={partie.pending}
          onStart={(coins, mode) => void partie.start(coins, mode)}
          footer={
            balanceCents < REFILL_THRESHOLD_CENTS ? (
              <Refill onBalance={setBalance} />
            ) : null
          }
        />
      ) : null}

      {state === "active" && round ? (
        <PlayPanel
          config={config}
          round={round}
          revealed={partie.revealed}
          pending={partie.pending}
          onPick={(option) => void partie.play(option)}
          onCashout={() => void partie.cashout()}
        />
      ) : null}

      {state === "finished" && round ? (
        <Bilan
          config={config}
          round={round}
          revealed={partie.revealed}
          balanceCents={balanceCents}
          pending={partie.pending}
          onReplay={() => void partie.replay()}
          onChangeBet={partie.changeBet}
        />
      ) : null}
    </>
  );
}

/** La recharge gratuite : un bouton et son message, rien de plus. */
function Refill({ onBalance }: { onBalance: (cents: number) => void }) {
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
