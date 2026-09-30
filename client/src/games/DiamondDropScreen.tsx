import { type CSSProperties, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, type GameConfig, type Round } from "../api.ts";
import { Amount, Button, PageTitle, Toast } from "../components/index.ts";
import { formatCoins, formatMultiplier } from "../lib/format.ts";
import { playOutcome, playPeg } from "../lib/sound.ts";
import { dureeRangee, MS_RANGEE_3D } from "./diamond3d/rythme.ts";
import { useSession } from "../session.tsx";
import { Fallback } from "../three/Fallback.tsx";
import { RenderToggle } from "../three/RenderToggle.tsx";
import { prefersReducedMotion } from "../three/support.ts";
import { useRenderMode } from "../three/useRenderMode.ts";
import { BetForm, RewardPanel } from "./BetForm.tsx";
import { accentFor } from "./boards/index.ts";
import { DiamondBoard } from "./DiamondBoard.tsx";
import { Reperes, ToutesLesCases } from "./DiamondCases.tsx";
import { Refill, REFILL_THRESHOLD_CENTS } from "./Refill.tsx";
import type { GameScreenProps } from "./screens.ts";
import { dropModes, viewOf, type DropDrop, type DropModeView } from "./drop.ts";
import { heatOf } from "./heat.ts";
import { useRound } from "./useRound.ts";
import "./diamond-drop.css";

/** Le plateau 3D, chargé à la demande : c'est lui qui fait entrer `three` dans le site. */
const DiamondBoard3D = lazy(() => import("./diamond3d/DiamondBoard3D.tsx"));

/**
 * L'écran de Diamond Drop (genre `drop`).
 *
 * Un seul coup par partie : on mise, on lâche, le diamant tombe. Le chemin
 * vient du serveur d'un bloc, au moment du lâcher ; l'animation ne fait que le
 * rejouer rangée par rangée. Rien ici ne décide de rien.
 */

/** Durée d'une rangée de chute, en millisecondes. */
const MS_PAR_RANGEE = 90;

export function DiamondDropScreen({ gameId, config: jeu }: GameScreenProps) {
  const { balanceCents, setBalance } = useSession();
  const rendu = useRenderMode();
  /** La 3D a levé pendant cette partie : on montre le plateau 2D jusqu'à la partie suivante. */
  const [echec3d, setEchec3d] = useState(false);
  const en3d = rendu.mode === "3d" && !echec3d;

  /** La chute en cours : le chemin reçu du serveur et la case d'arrivée. */
  const [chute, setChute] = useState<DropDrop | null>(null);
  /** Nombre de rangées déjà franchies par le diamant. */
  const [rangee, setRangee] = useState(0);
  const [posee, setPosee] = useState(false);
  // En 3D, une rangée dure 140 ms (le temps de voir le rebond) et les dernières ralentissent
  // sur un gros gain : voir `diamond3d/rythme.ts`. La 2D garde son pas de 90 ms.
  const msParRangee = !en3d
    ? MS_PAR_RANGEE
    : chute
      ? dureeRangee(rangee, chute.path.length, chute.multiplier)
      : MS_RANGEE_3D;

  const onReset = useCallback(() => {
    setChute(null);
    setRangee(0);
    setPosee(false);
    setEchec3d(false);
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
      if (!en3d) {
        setPosee(true);
        return;
      }
      // En 3D, le diamant met encore une rangée à toucher sa case : le bilan, le toast et le son
      // attendent son arrivée au lieu de la devancer.
      const arrivee = setTimeout(() => setPosee(true), msParRangee);
      return () => clearTimeout(arrivee);
    }
    const minuteur = setTimeout(() => setRangee((r) => r + 1), msParRangee);
    return () => clearTimeout(minuteur);
  }, [chute, posee, rangee, msParRangee, en3d]);

  // Un tintement par clou franchi, de plus en plus aigu vers l'arrivée (son coupé par défaut).
  useEffect(() => {
    if (chute && !posee && rangee > 0 && rangee <= chute.path.length) {
      playPeg(rangee - 1, chute.path.length);
    }
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

  const plateau2D = vue ? (
    <DiamondBoard
      rows={vue.rows}
      slots={vue.slots}
      path={chute?.path ?? null}
      row={rangee}
      landedSlot={posee ? (chute?.slot ?? null) : null}
    />
  ) : null;

  return (
    <>
      <PageTitle eyebrow={`${config.format} · coins fictifs`} accent={accentFor(config.id)}>
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
        <BetForm
          config={config}
          pending={partie.pending}
          onStart={(coins, modeId) => void partie.start(coins, modeId)}
          submitVariant="accent-gem"
          footer={balanceCents < REFILL_THRESHOLD_CENTS ? <Refill onBalance={setBalance} /> : null}
          reward={(betCents, modeId) => (
            <CasesDuMode
              config={config}
              mode={modes.find((m) => m.id === modeId) ?? modes[0]}
              betCents={betCents}
            />
          )}
        />
      ) : null}

      {round && vue ? (
        <section className="panel gamepanel" data-game="diamond-drop" aria-label="Plateau">
          <div className="dd-head">
            <span className="dd-head__mode">{`Mode ${mode.label} · ${vue.rows} rangées`}</span>
            <span className="dd-head__bet">
              {`Mise `}
              <Amount cents={round.betCents} />
            </span>
            <RenderToggle
              mode={en3d ? "3d" : "2d"}
              possible={rendu.possible}
              // Après un échec de la 3D, le bouton décoché veut dire « réessaie la 3D » :
              // basculer la préférence la ferait passer en 2D, l'inverse de ce qui est demandé.
              onToggle={echec3d ? () => setEchec3d(false) : rendu.toggle}
            />
          </div>

          {/* Les deux chiffres qui comptent, avant même de regarder la bande. */}
          <Reperes slots={vue.slots} />

          {en3d ? (
            <Fallback
              fallback={plateau2D}
              resetKey={round.id}
              onError={() => setEchec3d(true)}
            >
              <Suspense fallback={plateau2D}>
                <DiamondBoard3D
                  rows={vue.rows}
                  slots={vue.slots}
                  path={chute?.path ?? null}
                  row={rangee}
                  landedSlot={posee ? (chute?.slot ?? null) : null}
                  rowMs={msParRangee}
                />
              </Suspense>
            </Fallback>
          ) : (
            plateau2D
          )}

          {/* La bande défile ; cette liste-ci, jamais : elle est verticale. */}
          <ToutesLesCases
            slots={vue.slots}
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

/* --------------------------- Le panneau des cases --------------------------- */

/**
 * Ce que Diamond Drop met en face de la mise : sa bande de cases. Le tableau
 * des récompenses de ce jeu, c'est le plateau lui-même.
 */
function CasesDuMode({
  config,
  mode,
  betCents,
}: {
  config: GameConfig;
  mode: DropModeView;
  betCents: number | null;
}) {
  const maxi = betCents === null ? null : Math.round(betCents * Math.max(...mode.slots));
  const plafonné = maxi !== null && maxi > config.maxPayoutCents;

  return (
    <RewardPanel
      titre={`Cases du mode ${mode.label} — ${mode.rows} rangées`}
      aria="Récompenses"
    >
      <Reperes slots={mode.slots} />
      <SlotStrip slots={mode.slots} />
      <ToutesLesCases slots={mode.slots} chances={mode.chances} />
      <ul className="prose__list">
        <li>{`La case du milieu est la plus probable : c'est elle qui rapporte le moins.`}</li>
        {maxi === null ? null : (
          <li>
            {`Gain maximum : `}
            <Amount cents={Math.min(maxi, config.maxPayoutCents)} />
            {plafonné ? " (plafond atteint)" : ` avec ${formatCoins(betCents ?? 0)} de mise`}
          </li>
        )}
        <li>{`Gain plafonné à ${formatCoins(config.maxPayoutCents)} par partie.`}</li>
      </ul>
    </RewardPanel>
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
