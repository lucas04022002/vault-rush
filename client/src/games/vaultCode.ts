import { useCallback, useMemo, useState } from "react";
import { api, type GameConfig, type GameMode, type Round } from "../api.ts";
import { useRound, type RoundControl } from "./useRound.ts";

/**
 * Vault Code, côté client : les types que le serveur envoie, et le hook de
 * partie. Tout ce qui est commun (mise, reprise, verrou d'un coup en vol, 409
 * adoptés, solde) vit dans `useRound` ; il ne reste ici que l'essai — quatre
 * chiffres — et la lecture de la réponse du coffre.
 */

/** Un mode de Vault Code : le mode commun, plus son nombre d'essais. */
export type VaultCodeMode = GameMode & { essais: number };

/** La config de Vault Code : la config commune, plus la longueur du code. */
export type VaultCodeConfig = Omit<GameConfig, "modes"> & {
  digits: number;
  modes: VaultCodeMode[];
};

export type VaultCodeAttempt = { guess: number[]; verrous: number; echos: number };

/** L'état PUBLIC d'une partie : `code` vaut `null` tant qu'elle est en cours. */
export type VaultCodeView = {
  mode: string;
  digits: number;
  essais: number;
  essaisRestants: number;
  attempts: VaultCodeAttempt[];
  code: number[] | null;
};

type PlayResponse = {
  round: Round;
  verrous: number;
  echos: number;
  trouve: boolean;
  code: number[] | null;
};

/** La config typée pour Vault Code (le serveur l'envoie toujours complète). */
export function vaultCodeConfig(config: GameConfig): VaultCodeConfig {
  return config as unknown as VaultCodeConfig;
}

/** La vue d'une partie, ou une vue vide si la partie n'en porte pas encore. */
export function viewOf(round: Round | null, config: VaultCodeConfig): VaultCodeView {
  const vue = round?.view as VaultCodeView | undefined;
  if (vue) return vue;
  const mode = config.modes[0];
  return {
    mode: mode.id,
    digits: config.digits,
    essais: mode.essais,
    essaisRestants: mode.essais,
    attempts: [],
    code: null,
  };
}

/** Le mode d'une partie, ou le premier mode par défaut. */
export function modeOf(config: VaultCodeConfig, modeId: string | undefined): VaultCodeMode {
  return config.modes.find((m) => m.id === modeId) ?? config.modes[0];
}

/** « 2 verrous, 1 écho » — les deux nombres, au bon pluriel. */
export function indicesLabel(verrous: number, echos: number): string {
  const v = `${verrous} verrou${verrous > 1 ? "s" : ""}`;
  const e = `${echos} écho${echos > 1 ? "s" : ""}`;
  return `${v}, ${e}`;
}

/** Le code, lisible : « 4 7 0 2 ». */
export function codeLabel(code: number[]): string {
  return code.join(" ");
}

/** Bilan d'une partie terminée. */
export function finishedMessage(round: Round): string {
  const vue = round.view as VaultCodeView | undefined;
  const code = vue?.code ? ` Le code était ${codeLabel(vue.code)}.` : "";
  if (round.status === "lost") return `Essais épuisés.${code}`;
  const essais = round.step;
  return `Coffre ouvert en ${essais} essai${essais > 1 ? "s" : ""} !${code}`;
}

export type VaultCodeGame = Omit<RoundControl, "play"> & {
  /** La combinaison en cours de saisie, de 0 à 4 chiffres. */
  entree: number[];
  /** Ajoute un chiffre (ignoré s'il est déjà saisi ou si les quatre sont pris). */
  tape: (chiffre: number) => void;
  /** Retire le dernier chiffre saisi. */
  efface: () => void;
  /** Envoie la combinaison en cours. */
  valide: () => Promise<void>;
};

export function useVaultCode(gameId: string, config: VaultCodeConfig): VaultCodeGame {
  const [entree, setEntree] = useState<number[]>([]);

  const onReset = useCallback(() => setEntree([]), []);
  const partie = useRound(gameId, { config, onReset, finishedMessage });
  const { play: jouerUnCoup } = partie;

  const tape = useCallback(
    (chiffre: number) =>
      setEntree((actuel) =>
        actuel.length >= config.digits || actuel.includes(chiffre)
          ? actuel
          : [...actuel, chiffre],
      ),
    [config.digits],
  );

  const efface = useCallback(() => setEntree((actuel) => actuel.slice(0, -1)), []);

  const valide = useCallback(async () => {
    if (entree.length !== config.digits) return;
    const guess = [...entree];
    await jouerUnCoup(
      (round) =>
        // `games.play` envoie `{ option }` : Vault Code envoie `{ guess }`.
        api<PlayResponse>(`/games/${gameId}/play`, {
          method: "POST",
          body: { roundId: round.id, step: round.step, guess },
        }),
      (resultat, { adopt, setMessage }) => {
        setEntree([]);
        adopt(resultat.round);
        if (resultat.round.status !== "playing") {
          setMessage(finishedMessage(resultat.round));
          return;
        }
        const vue = resultat.round.view as VaultCodeView;
        setMessage(
          `${indicesLabel(resultat.verrous, resultat.echos)}. ` +
            `Il reste ${vue.essaisRestants} essai${vue.essaisRestants > 1 ? "s" : ""}.`,
        );
      },
    );
  }, [config.digits, entree, gameId, jouerUnCoup]);

  return useMemo(
    () => ({ ...partie, entree, tape, efface, valide }),
    [efface, entree, partie, tape, valide],
  );
}
