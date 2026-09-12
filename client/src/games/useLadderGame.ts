import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, games, type GameConfig, type Outcome, type Round } from "../api.ts";
import { errorMessage } from "../lib/messages.ts";
import { useSession } from "../session.tsx";
import { coinsOnly } from "./bets.ts";
import { capitalize } from "./labels.ts";

/**
 * Le déroulé d'une partie, pour N'IMPORTE QUEL jeu d'échelle : tout ce qui
 * change entre Vault Rush et Laser Grid vient de `GET /api/games/:game/config`.
 *
 * Trois états seulement :
 *   idle     — on choisit sa mise et son mode
 *   active   — une partie est en cours (elle peut venir d'être reprise)
 *   finished — alarme, encaissement, ou dernière étape encaissée d'office
 *
 * Deux règles tenues ici, et nulle part ailleurs :
 * 1. le serveur a toujours raison — un 409 (`round_active`, `step_mismatch`)
 *    porte l'état réel de la partie, qu'on adopte au lieu de le deviner ;
 * 2. une seule requête à la fois (`pending`) — un double clic ne joue pas deux
 *    fois, et aucun bouton ne part pendant qu'une réponse est en vol.
 */

export type LadderState = "idle" | "active" | "finished";

export type LadderBet = { coins: string; mode: string };

export type LadderGame = {
  config: GameConfig | null;
  loading: boolean;
  state: LadderState;
  round: Round | null;
  /** Les options révélées par le serveur, gardées quand la partie se termine. */
  revealed: Outcome[] | null;
  /** Vrai quand la partie affichée a été reprise, pas lancée à l'instant. */
  resumed: boolean;
  pending: boolean;
  error: string | null;
  /**
   * Information, pas échec : un 409 dont l'état a été adopté (partie reprise,
   * partie déjà terminée ailleurs). Le joueur doit le lire en bleu, pas en rouge.
   */
  notice: string | null;
  /** Message de résultat (étape franchie, bilan) : un Toast « bon ». */
  message: string | null;
  lastBet: LadderBet | null;
  start: (coins: string, mode: string) => Promise<void>;
  /** `option` est numérotée à partir de 1 comme à l'écran ; le serveur part de 0. */
  play: (option: number) => Promise<void>;
  cashout: () => Promise<void>;
  replay: () => Promise<void>;
  /** Retour à l'écran de mise après un bilan. */
  changeBet: () => void;
};

export function useLadderGame(gameId: string): LadderGame {
  const session = useSession();
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<LadderState>("idle");
  const [round, setRound] = useState<Round | null>(null);
  const [revealed, setRevealed] = useState<Outcome[] | null>(null);
  const [resumed, setResumed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastBet, setLastBet] = useState<LadderBet | null>(null);

  // `pending` en ref : deux clics dans le même tick verraient le même état React.
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const { refreshBalance, setBalance } = session;

  /**
   * Adopte l'état de partie renvoyé par le serveur (réponse ou corps d'un 409).
   *
   * La mise à rejouer est TOUJOURS dérivée de la partie affichée : sinon
   * « Rejouer » ne ferait rien après une reprise (rechargement de page ou 409
   * `round_active`), où aucun `start` n'a eu lieu dans cet onglet.
   */
  const adopt = useCallback((next: Round, options: { resumed?: boolean } = {}) => {
    setRound(next);
    setResumed(options.resumed ?? false);
    setState(next.status === "playing" ? "active" : "finished");
    setLastBet({ coins: coinsOnly(next.betCents), mode: next.mode });
  }, []);

  useEffect(() => {
    let annulé = false;
    setLoading(true);
    setState("idle");
    setRound(null);
    setRevealed(null);
    setResumed(false);
    setMessage(null);
    setNotice(null);
    setError(null);

    void (async () => {
      try {
        const [{ game }, { round: en_cours }] = await Promise.all([
          games.config(gameId),
          games.current(gameId),
        ]);
        if (annulé || !alive.current) return;
        setConfig(game);
        if (en_cours) adopt(en_cours, { resumed: true });
      } catch (err) {
        if (!annulé && alive.current) setError(errorMessage(err));
      } finally {
        if (!annulé && alive.current) setLoading(false);
      }
    })();

    return () => {
      annulé = true;
    };
  }, [adopt, gameId]);

  /** Enveloppe commune : un seul vol à la fois, erreurs traduites. */
  const run = useCallback(async (action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }, []);

  const start = useCallback(
    (coins: string, mode: string) =>
      run(async () => {
        setLastBet({ coins, mode });
        try {
          const { round: nouvelle } = await games.start(gameId, coins, mode);
          if (!alive.current) return;
          setRevealed(null);
          setMessage(null);
          adopt(nouvelle);
        } catch (err) {
          if (!alive.current) return;
          // Une partie était déjà ouverte : on la reprend au lieu d'en créer une.
          if (err instanceof ApiError && err.code === "round_active" && err.payload.round) {
            setRevealed(null);
            setMessage(null);
            adopt(err.payload.round as Round, { resumed: true });
            // Reprise réussie : le bandeau « Partie en cours reprise. » suffit,
            // ce n'est pas un échec et ça ne doit pas s'afficher en rouge.
            return;
          }
          setError(errorMessage(err));
        } finally {
          await refreshBalance();
        }
      }),
    [adopt, gameId, refreshBalance, run],
  );

  const play = useCallback(
    (option: number) =>
      run(async () => {
        if (!round || !config || round.status !== "playing") return;
        try {
          const résultat = await games.play(gameId, round.id, round.step, option - 1);
          if (!alive.current) return;

          if (résultat.outcome === "danger" || résultat.round.status !== "playing") {
            setRevealed(résultat.revealed);
            adopt(résultat.round);
            setMessage(finishedMessage(résultat.round, config.labels.danger));
            await refreshBalance();
            return;
          }

          // Étape franchie : la révélation de l'étape précédente laisserait une
          // grille bariolée devant le choix suivant, on ne garde que le message.
          setRevealed(null);
          adopt(résultat.round);
          setMessage(
            `${capitalize(config.labels.safe)} ! Étape ${résultat.round.step} sur ${
              config.steps
            } franchie.`,
          );
        } catch (err) {
          if (!alive.current) return;
          if (
            err instanceof ApiError &&
            (err.code === "step_mismatch" || err.code === "round_not_active") &&
            err.payload.round
          ) {
            const adoptée = err.payload.round as Round;
            setRevealed(null);
            setMessage(null);
            adopt(adoptée);
            // La partie a pu se terminer ailleurs (second onglet, requête
            // doublée) : le gain est déjà crédité, le bilan doit le montrer.
            if (adoptée.status !== "playing") await refreshBalance();
            setNotice(
              adoptée.status === "playing"
                ? "Cette étape a déjà été jouée : l'écran a été remis à jour."
                : "Cette partie était déjà terminée.",
            );
            return;
          }
          setError(errorMessage(err));
        }
      }),
    [adopt, config, gameId, refreshBalance, round, run],
  );

  const cashout = useCallback(
    () =>
      run(async () => {
        if (!round || !config || round.status !== "playing") return;
        try {
          const { round: fermée, balanceCents } = await games.cashout(gameId, round.id);
          if (!alive.current) return;
          setRevealed(null);
          adopt(fermée);
          setMessage(finishedMessage(fermée, config.labels.danger));
          setBalance(balanceCents);
        } catch (err) {
          if (!alive.current) return;
          if (err instanceof ApiError && err.code === "round_not_active" && err.payload.round) {
            const adoptée = err.payload.round as Round;
            setMessage(null);
            adopt(adoptée);
            if (adoptée.status !== "playing") await refreshBalance();
            // L'encaissement était déjà passé (réseau coupé, second onglet) :
            // le crédit est acquis, c'est une information, pas une erreur.
            setNotice("Cette partie était déjà terminée.");
            return;
          }
          setError(errorMessage(err));
        }
      }),
    [adopt, config, gameId, refreshBalance, round, run, setBalance],
  );

  const replay = useCallback(async () => {
    if (!lastBet) return;
    await start(lastBet.coins, lastBet.mode);
  }, [lastBet, start]);

  const changeBet = useCallback(() => {
    setState("idle");
    setRound(null);
    setRevealed(null);
    setResumed(false);
    setMessage(null);
    setNotice(null);
    setError(null);
  }, []);

  return {
    config,
    loading,
    state,
    round,
    revealed,
    resumed,
    pending,
    error,
    notice,
    message,
    lastBet,
    start,
    play,
    cashout,
    replay,
    changeBet,
  };
}

function finishedMessage(round: Round, dangerLabel: string): string {
  if (round.status === "lost") return `${capitalize(dangerLabel)} ! La mise est perdue.`;
  return "Partie encaissée.";
}
