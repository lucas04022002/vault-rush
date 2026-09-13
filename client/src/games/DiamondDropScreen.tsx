import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, type GameConfig, type Round } from "../api.ts";
import { Amount, Button, Chip, Field, PageTitle, Toast } from "../components/index.ts";
import { formatCoins, formatMultiplier } from "../lib/format.ts";
import { playOutcome } from "../lib/sound.ts";
import { useSession } from "../session.tsx";
import { QUICK_BETS, checkBet, coinsOnly } from "./bets.ts";
import { DiamondBoard } from "./DiamondBoard.tsx";
import { Refill, REFILL_THRESHOLD_CENTS } from "./Refill.tsx";
import type { GameScreenProps } from "./screens.ts";
import { dropModes, viewOf, type DropDrop } from "./drop.ts";
import { heatOf } from "./heat.ts";
import { useRound } from "./useRound.ts";
import "./diamond-drop.css";

/**
 * L'écran de Diamond Drop (genre `drop`).
 *
 * Un seul coup par partie : on mise, on lâche, le diamant tombe. Le chemin
 * vient du serveur d'un bloc, au moment du lâcher ; l'animation ne fait que le
 * rejouer rangée par rangée. Rien ici ne décide de rien.
 */

/** Durée d'une rangée de chute, en millisecondes. */
const MS_PAR_RANGEE = 90;

/** Vrai si le navigateur demande à ne pas animer (jsdom n'a pas `matchMedia`). */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function DiamondDropScreen({ gameId, config: jeu }: GameScreenProps) {
  const { balanceCents, setBalance } = useSession();

  /** La chute en cours : le chemin reçu du serveur et la case d'arrivée. */
  const [chute, setChute] = useState<DropDrop | null>(null);
  /** Nombre de rangées déjà franchies par le diamant. */
  const [rangee, setRangee] = useState(0);
  const [posee, setPosee] = useState(false);

  const onReset = useCallback(() => {
    setChute(null);
    setRangee(0);
    setPosee(false);
  }, []);

  const partie = useRound(gameId, { config: jeu, onReset });
  const { config, round, state } = partie;

  const heading = useRef<HTMLHeadingElement>(null);
  const previousState = useRef<string | null>(null);

  // Le focus suit le changement d'écran (mise → jeu → bilan), jamais à l'arrivée.
  useEffect(() => {
    if (previousState.current !== null && previousState.current !== state) {
      heading.current?.focus();
    }
    previousState.current = state;
  }, [state]);

  // La chute, rangée par rangée. Sous `prefers-reduced-motion`, rien ne tombe :
  // `lâcher` a déjà posé le diamant dans sa case.
  useEffect(() => {
    if (!chute || posee) return;
    if (rangee >= chute.path.length) {
      setPosee(true);
      return;
    }
    const minuteur = setTimeout(() => setRangee((r) => r + 1), MS_PAR_RANGEE);
    return () => clearTimeout(minuteur);
  }, [chute, posee, rangee]);

  // Le son ne part qu'une fois le diamant posé, pas au clic.
  useEffect(() => {
    if (posee) playOutcome("cashout");
  }, [posee]);

  function lâcher() {
    void partie.play(
      (encours) =>
        api<{ round: Round; path: boolean[]; slot: number; multiplier: number }>(
          `/games/${gameId}/play`,
          { method: "POST", body: { roundId: encours.id, step: encours.step } },
        ),
      (résultat, { adopt }) => {
        adopt(résultat.round);
        const tombe = { path: résultat.path, slot: résultat.slot, multiplier: résultat.multiplier };
        setChute(tombe);
        if (prefersReducedMotion()) {
          setRangee(tombe.path.length);
          setPosee(true);
        } else {
          setRangee(0);
          setPosee(false);
        }
      },
    );
  }

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

  const modes = dropModes(config);
  const vue = round ? viewOf(round) : null;
  const mode = modes.find((m) => m.id === round?.mode) ?? modes[0];

  const titre =
    state === "idle"
      ? "Choisis ta mise"
      : state === "active"
        ? "Prêt à lâcher"
        : posee
          ? "Fin de partie"
          : "Le diamant tombe…";

  return (
    <>
      <PageTitle eyebrow="1 lâcher · coins fictifs" accent="gem">
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
      {partie.notice && !partie.error ? <Toast kind="info">{partie.notice}</Toast> : null}
      {posee && round && !partie.error && !partie.notice ? (
        <Toast kind={round.payoutCents >= round.betCents ? "good" : "bad"}>
          {`Case ${(chute?.slot ?? 0) + 1} · ${formatMultiplier(round.multiplier)} — ${formatCoins(
            round.payoutCents,
          )} récupérés.`}
        </Toast>
      ) : null}

      {state === "idle" ? (
        <DiamondBet
          config={config}
          pending={partie.pending}
          onStart={(coins, modeId) => void partie.start(coins, modeId)}
          footer={balanceCents < REFILL_THRESHOLD_CENTS ? <Refill onBalance={setBalance} /> : null}
        />
      ) : null}

      {round && vue ? (
        <section className="panel gamepanel" data-game="diamond-drop" aria-label="Plateau">
          <p className="dd-head">
            <span className="dd-head__mode">{`Mode ${mode.label} · ${vue.rows} rangées`}</span>
            <span className="dd-head__bet">
              {`Mise `}
              <Amount cents={round.betCents} />
            </span>
          </p>

          <DiamondBoard
            rows={vue.rows}
            slots={vue.slots}
            path={chute?.path ?? null}
            row={rangee}
            landedSlot={posee ? (chute?.slot ?? null) : null}
          />

          {state === "active" ? (
            <div className="dd-actions">
              <Button variant="accent-gem" pending={partie.pending} onClick={lâcher}>
                Lâcher le diamant
              </Button>
            </div>
          ) : null}

          {posee && round ? (
            <>
              <table className="bilan">
                <caption>Bilan de la partie</caption>
                <tbody>
                  <tr>
                    <th scope="row">Mise</th>
                    <td>
                      <Amount cents={round.betCents} />
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Case</th>
                    <td>{`${(chute?.slot ?? 0) + 1} sur ${vue.slots.length}`}</td>
                  </tr>
                  <tr>
                    <th scope="row">Multiplicateur</th>
                    <td>{formatMultiplier(round.multiplier)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Récupéré</th>
                    <td>
                      <Amount cents={round.payoutCents} />
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Net</th>
                    <td>
                      <Amount cents={round.payoutCents - round.betCents} signed />
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Nouveau solde</th>
                    <td>
                      <Amount cents={balanceCents} />
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="bilan__actions">
                <Button
                  variant="accent-gem"
                  pending={partie.pending}
                  onClick={() => void partie.replay()}
                >
                  Rejouer (même mise, même mode)
                </Button>
                <Button variant="secondary" disabled={partie.pending} onClick={partie.changeBet}>
                  Changer la mise
                </Button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

/* ------------------------------- L'écran de mise ------------------------------- */

type DiamondBetProps = {
  config: GameConfig;
  pending: boolean;
  onStart: (coins: string, mode: string) => void;
  footer: React.ReactNode;
};

/**
 * Avant de miser : montant, mode, et la bande des cases du mode choisi — le
 * tableau des récompenses de ce jeu, c'est le plateau lui-même.
 */
function DiamondBet({ config, pending, onStart, footer }: DiamondBetProps) {
  const modes = dropModes(config);
  const [bet, setBet] = useState(() => coinsOnly(500));
  const [mode, setMode] = useState(modes[0].id);
  const [error, setError] = useState<string | null>(null);

  const check = checkBet(bet, config.minBetCents, config.maxBetCents);
  const choisi = modes.find((m) => m.id === mode) ?? modes[0];

  function lancer() {
    if (check.error) {
      setError(check.error);
      return;
    }
    setError(null);
    onStart(bet, mode);
  }

  const maxi = check.cents === null ? null : Math.round(check.cents * Math.max(...choisi.slots));
  const plafonné = maxi !== null && maxi > config.maxPayoutCents;

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

        <p className="label" id="mode-choix">
          Mode
        </p>
        <div className="chips" role="group" aria-labelledby="mode-choix">
          {modes.map((m) => (
            <Chip
              key={m.id}
              selected={m.id === mode}
              aria-label={`Mode ${m.label}`}
              disabled={pending}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </Chip>
          ))}
        </div>

        <Button variant="accent-gem" pending={pending} onClick={lancer}>
          Lancer la partie
        </Button>

        {footer}
      </section>

      <section className="panel" aria-label="Récompenses">
        <p className="label">{`Cases du mode ${choisi.label} — ${choisi.rows} rangées`}</p>
        <SlotStrip slots={choisi.slots} />
        <ul className="prose__list">
          <li>{`La case du milieu est la plus probable : c'est elle qui rapporte le moins.`}</li>
          {maxi === null ? null : (
            <li>
              {`Gain maximum : `}
              <Amount cents={Math.min(maxi, config.maxPayoutCents)} />
              {plafonné ? " (plafond atteint)" : ` avec ${formatCoins(check.cents ?? 0)} de mise`}
            </li>
          )}
          <li>{`Gain plafonné à ${formatCoins(config.maxPayoutCents)} par partie.`}</li>
        </ul>
      </section>
    </>
  );
}

/** La bande des cases, seule (aperçu avant la mise). Elle défile chez elle. */
function SlotStrip({ slots }: { slots: number[] }) {
  return (
    <div
      className="dd-scroll"
      role="region"
      aria-label="Multiplicateurs des cases"
      tabIndex={0}
      style={{ "--dd-cols": slots.length } as CSSProperties}
    >
      <ol className="dd-slots dd-slots--preview">
        {slots.map((multiplier, index) => (
          <li
            key={index}
            className="dd-slot"
            data-heat={heatOf(index, slots.length)}
            aria-label={`Case ${index + 1} : ${formatMultiplier(multiplier)}`}
          >
            <span aria-hidden="true">{formatMultiplier(multiplier)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
