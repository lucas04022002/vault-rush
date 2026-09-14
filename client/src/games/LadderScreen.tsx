import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { PageTitle, RewardTable, Toast } from "../components/index.ts";
import { playOutcome } from "../lib/sound.ts";
import { useSession } from "../session.tsx";
import { Bilan } from "./Bilan.tsx";
import { BetForm, RewardPanel } from "./BetForm.tsx";
import { accentFor } from "./boards/index.ts";
import { PlayPanel } from "./PlayPanel.tsx";
import { Refill, REFILL_THRESHOLD_CENTS } from "./Refill.tsx";
import { useLadderGame } from "./useLadderGame.ts";
import type { GameScreenProps } from "./screens.ts";

/** L'écran des jeux d'ÉCHELLE : Vault Rush, Laser Grid, Getaway, Bomb Squad. */
export function LadderScreen({ gameId, config: jeu }: GameScreenProps) {
  const { balanceCents, setBalance } = useSession();
  const partie = useLadderGame(gameId, jeu);
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
        eyebrow={`${config.format} · coins fictifs`}
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
            balanceCents < REFILL_THRESHOLD_CENTS ? <Refill onBalance={setBalance} /> : null
          }
          reward={(betCents) => (
            <RewardPanel titre="Tableau des récompenses" aria="Récompenses">
              <RewardTable
                modes={config.modes}
                betCents={betCents ?? undefined}
                maxPayoutCents={config.maxPayoutCents}
              />
            </RewardPanel>
          )}
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
