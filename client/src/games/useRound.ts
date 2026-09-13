import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, games, type GameConfig, type Round } from "../api.ts";
import { errorMessage } from "../lib/messages.ts";
import { useSession } from "../session.tsx";
import { coinsOnly } from "./bets.ts";

/**
 * Le déroulé d'une partie, pour N'IMPORTE QUEL jeu : démarrage, reprise,
 * coup, encaissement, fin. Rien ici ne sait ce qu'est une porte, un code ou
 * une carte — la part propre au jeu tient dans la requête d'un coup et dans
 * la lecture de sa réponse, fournies par le hook du jeu (`useLadderGame`…).
 *
 * Trois états seulement :
 *   idle     — on choisit sa mise et son mode
 *   active   — une partie est en cours (elle peut venir d'être reprise)
 *   finished — perdue, encaissée, ou terminée d'office
 *
 * Deux règles tenues ici, et nulle part ailleurs :
 * 1. le serveur a toujours raison — un 409 (`round_active`, `step_mismatch`)
 *    porte l'état réel de la partie, qu'on adopte au lieu de le deviner ;
 * 2. une seule requête à la fois (`pending`) — un double clic ne joue pas deux
 *    fois, et aucun bouton ne part pendant qu'une réponse est en vol.
 */

export type RoundState = "idle" | "active" | "finished";

export type RoundBet = { coins: string; mode: string };

/** Ce qu'un jeu reçoit pour appliquer la réponse de son coup. */
export type PlayHelpers = {
  config: GameConfig;
  adopt: (round: Round, options?: { resumed?: boolean }) => void;
  setMessage: (message: string | null) => void;
};

export type UseRoundOptions = {
  /**
   * Config déjà chargée par l'écran (qui l'a lue pour choisir le genre de jeu) :
   * elle évite un second appel à `GET /api/games/:game/config`.
   */
  config?: GameConfig | null;
  /**
   * Remet à zéro l'affichage propre au jeu (options révélées, cartes posées…)
   * au montage, au coup d'envoi d'une partie, et au retour à l'écran de mise.
   */
  onReset?: () => void;
  /** Message de bilan, quand la partie se termine sans coup (encaissement). */
  finishedMessage?: (round: Round, config: GameConfig) => string;
};

export type RoundControl = {
  config: GameConfig | null;
  loading: boolean;
  state: RoundState;
  round: Round | null;
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
  lastBet: RoundBet | null;
  start: (coins: string, mode: string) => Promise<void>;
  /**
   * Joue un coup : `request` fabrique l'appel (le jeu sait quels champs il
   * ajoute à `{ roundId, step }`), `apply` lit la réponse. Le verrou, les 409
   * adoptés, les erreurs traduites et le rafraîchissement du solde sont ici.
   */
  play: <R extends { round: Round }>(
    request: (round: Round, config: GameConfig) => Promise<R>,
    apply: (result: R, helpers: PlayHelpers) => void,
  ) => Promise<void>;
  cashout: () => Promise<void>;
  replay: () => Promise<void>;
  /** Retour à l'écran de mise après un bilan. */
  changeBet: () => void;
};

export function useRound(gameId: string, options: UseRoundOptions = {}): RoundControl {
  const session = useSession();
  const [config, setConfig] = useState<GameConfig | null>(options.config ?? null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<RoundState>("idle");
  const [round, setRound] = useState<Round | null>(null);
  const [resumed, setResumed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastBet, setLastBet] = useState<RoundBet | null>(null);

  // Les rappels du jeu changent d'identité à chaque rendu : les garder en ref
  // évite de relancer le chargement de la partie à chaque fois.
  const opts = useRef(options);
  opts.current = options;

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
  const adopt = useCallback((next: Round, choix: { resumed?: boolean } = {}) => {
    setRound(next);
    setResumed(choix.resumed ?? false);
    setState(next.status === "playing" ? "active" : "finished");
    setLastBet({ coins: coinsOnly(next.betCents), mode: next.mode });
  }, []);

  useEffect(() => {
    let annulé = false;
    setLoading(true);
    setState("idle");
    setRound(null);
    setResumed(false);
    setMessage(null);
    setNotice(null);
    setError(null);
    opts.current.onReset?.();

    void (async () => {
      try {
        const préchargée = opts.current.config ?? null;
        const [jeu, { round: en_cours }] = await Promise.all([
          préchargée ?? games.config(gameId).then(({ game }) => game),
          games.current(gameId),
        ]);
        if (annulé || !alive.current) return;
        setConfig(jeu);
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
          opts.current.onReset?.();
          setMessage(null);
          adopt(nouvelle);
        } catch (err) {
          if (!alive.current) return;
          // Une partie était déjà ouverte : on la reprend au lieu d'en créer une.
          if (err instanceof ApiError && err.code === "round_active" && err.payload.round) {
            opts.current.onReset?.();
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
    <R extends { round: Round }>(
      request: (round: Round, config: GameConfig) => Promise<R>,
      apply: (result: R, helpers: PlayHelpers) => void,
    ) =>
      run(async () => {
        if (!round || !config || round.status !== "playing") return;
        try {
          const résultat = await request(round, config);
          if (!alive.current) return;
          apply(résultat, { config, adopt, setMessage });
          // La partie est finie : le gain est déjà crédité, le solde doit suivre.
          if (résultat.round.status !== "playing") await refreshBalance();
        } catch (err) {
          if (!alive.current) return;
          if (
            err instanceof ApiError &&
            (err.code === "step_mismatch" || err.code === "round_not_active") &&
            err.payload.round
          ) {
            const adoptée = err.payload.round as Round;
            opts.current.onReset?.();
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
    [adopt, config, refreshBalance, round, run],
  );

  const cashout = useCallback(
    () =>
      run(async () => {
        if (!round || !config || round.status !== "playing") return;
        try {
          const { round: fermée, balanceCents } = await games.cashout(gameId, round.id);
          if (!alive.current) return;
          opts.current.onReset?.();
          adopt(fermée);
          setMessage(opts.current.finishedMessage?.(fermée, config) ?? null);
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
    setResumed(false);
    setMessage(null);
    setNotice(null);
    setError(null);
    opts.current.onReset?.();
  }, []);

  return {
    config,
    loading,
    state,
    round,
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
