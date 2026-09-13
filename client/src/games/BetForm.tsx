import { useState, type ReactNode } from "react";
import type { GameConfig, GameMode } from "../api.ts";
import { Button, Chip, Field, type ButtonVariant } from "../components/index.ts";
import { formatCoins } from "../lib/format.ts";
import { QUICK_BETS, checkBet, coinsOnly } from "./bets.ts";

/**
 * Le formulaire de mise, commun aux SEPT jeux : montant, raccourcis, mode,
 * bouton de départ et erreurs de saisie.
 *
 * Chacun des trois jeux ajoutés le 13/09 en avait recopié une version (mêmes
 * puces, même champ, même contrôle) pour la seule raison que son panneau de
 * récompenses n'est pas une `RewardTable`. Ce panneau est donc devenu un
 * paramètre : `reward` reçoit la mise et le mode courants et rend ce que le
 * jeu veut — une table de gains, une bande de cases, rien du tout. Ce qui
 * reste ici est ce qui doit rester identique partout : la saisie de la mise et
 * son contrôle (`checkBet`, les mêmes règles que `server/src/money.ts`).
 */

export type BetFormProps = {
  /** Les bornes de mise et les modes ; le reste de la config ne sert pas ici. */
  config: Pick<GameConfig, "minBetCents" | "maxBetCents" | "modes">;
  pending: boolean;
  onStart: (coins: string, mode: string) => void;
  /** Le libellé du bouton de départ, propre au jeu (« Ouvrir le coffre »). */
  submitLabel?: string;
  /** La couleur du bouton : celle du jeu, jamais celle de l'arcade. */
  submitVariant?: ButtonVariant;
  /** Ce qu'écrit une puce de mode (Vault Code y ajoute ses essais). */
  modeLabel?: (mode: GameMode) => string;
  /** Ce que dit une puce de mode à un lecteur d'écran. */
  modeAria?: (mode: GameMode) => string;
  /** Une ligne libre sous les modes : un jeu à mode unique y dit sa règle. */
  note?: ReactNode;
  /** Bloc libre sous le bouton (la recharge gratuite, par exemple). */
  footer?: ReactNode;
  /**
   * Le panneau des récompenses, composé par l'écran. Il reçoit la mise saisie
   * (`null` si elle est invalide) et le mode choisi, parce que les deux
   * changent ici. Un jeu sans tableau ne le passe pas.
   */
  reward?: (betCents: number | null, modeId: string) => ReactNode;
};

/** Avant de miser : montant, mode, départ — et le panneau du jeu en face. */
export function BetForm({
  config,
  pending,
  onStart,
  submitLabel = "Lancer la partie",
  submitVariant = "primary",
  modeLabel,
  modeAria,
  note,
  footer,
  reward,
}: BetFormProps) {
  const [bet, setBet] = useState(() => coinsOnly(500));
  const [mode, setMode] = useState(config.modes[0].id);
  const [error, setError] = useState<string | null>(null);

  const check = checkBet(bet, config.minBetCents, config.maxBetCents);

  function lancer() {
    if (check.error) {
      setError(check.error);
      return;
    }
    setError(null);
    onStart(bet, mode);
  }

  return (
    <>
      <section className="panel betform" aria-label="Mise">
        <p className="label" id="mise-raccourcis">
          Mise
        </p>
        <div className="chips" role="group" aria-labelledby="mise-raccourcis">
          {QUICK_BETS.map((cents) => (
            <Chip
              key={cents}
              selected={check.cents === cents}
              aria-label={`Mise ${formatCoins(cents)}`}
              disabled={pending}
              onClick={() => {
                setBet(coinsOnly(cents));
                setError(null);
              }}
            >
              {coinsOnly(cents)}
            </Chip>
          ))}
        </div>

        <Field
          label="Mise libre"
          id="mise-libre"
          hint={`Entre ${coinsOnly(config.minBetCents)} et ${formatCoins(config.maxBetCents)}`}
          error={error}
        >
          <input
            inputMode="decimal"
            autoComplete="off"
            value={bet}
            disabled={pending}
            onChange={(event) => {
              setBet(event.target.value);
              setError(null);
            }}
          />
        </Field>

        {/* Un jeu à mode unique (Blackjack) n'affiche pas un choix qui n'en est pas un. */}
        {config.modes.length > 1 ? (
          <>
            <p className="label" id="mode-choix">
              Mode
            </p>
            <div className="chips" role="group" aria-labelledby="mode-choix">
              {config.modes.map((m) => (
                <Chip
                  key={m.id}
                  selected={m.id === mode}
                  aria-label={modeAria ? modeAria(m) : `Mode ${m.label}`}
                  disabled={pending}
                  onClick={() => setMode(m.id)}
                >
                  {modeLabel ? modeLabel(m) : m.label}
                </Chip>
              ))}
            </div>
          </>
        ) : null}

        {note ? <p className="gamepanel__line">{note}</p> : null}

        <Button variant={submitVariant} pending={pending} onClick={lancer}>
          {submitLabel}
        </Button>

        {footer}
      </section>

      {reward ? reward(check.cents, mode) : null}
    </>
  );
}

export type RewardPanelProps = {
  /** Le titre affiché en tête du panneau. */
  titre: string;
  /** Son nom pour un lecteur d'écran, quand il diffère du titre. */
  aria?: string;
  children: ReactNode;
};

/**
 * Le panneau des récompenses, FACULTATIF : chaque jeu y met ce qu'il a —
 * la table des multiplicateurs d'une échelle, la table des gains d'un code,
 * la bande des cases d'un plateau de clous, les issues d'une main de cartes.
 */
export function RewardPanel({ titre, aria, children }: RewardPanelProps) {
  return (
    <section className="panel" aria-label={aria ?? titre}>
      <p className="label">{titre}</p>
      {children}
    </section>
  );
}
