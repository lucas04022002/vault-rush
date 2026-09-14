import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, type Round } from "../api.ts";
import { Amount, Button, PageTitle, Toast } from "../components/index.ts";
import { formatCoins, formatMultiplier } from "../lib/format.ts";
import { playOutcome } from "../lib/sound.ts";
import { useSession } from "../session.tsx";
import {
  MOT_ISSUE,
  PIP,
  type BlackjackConfig,
  type Carte,
  type Issue,
  type Move,
  type ReponseCoup,
  type VueBlackjack,
  type VueCroupier,
  type VueMain,
  direMainCroupier,
  direMainJoueur,
  estRouge,
  vueDe,
} from "./blackjack.ts";
import { BetForm, RewardPanel } from "./BetForm.tsx";
import { accentFor } from "./boards/index.ts";
import { Refill, REFILL_THRESHOLD_CENTS } from "./Refill.tsx";
import type { GameScreenProps } from "./screens.ts";
import { useRound } from "./useRound.ts";
import "./blackjack.css";

/**
 * L'écran de Blackjack Express (`kind: "cards"`).
 *
 * Tout le déroulé d'une manche (mise, reprise, verrou du coup en vol, 409
 * adoptés, solde) vient de `useRound` ; il ne reste ici que le coup — tirer ou
 * rester — et la table : les cartes du croupier en haut, les tiennes en bas.
 *
 * Les cartes sont DESSINÉES (rectangle, rang aux coins, enseigne au centre) :
 * aucune image, aucun caractère décoratif hors du pip, et tout ce qui bouge
 * s'arrête sous `prefers-reduced-motion`.
 */

/** Une carte posée sur le tapis, ou son dos quand elle est encore cachée. */
function CarteDessin({ carte, index }: { carte: Carte | null; index: number }) {
  const style = { "--bj-carte": index } as CSSProperties;

  if (!carte) {
    return <span className="bj-carte" data-face="dos" style={style} aria-hidden="true" />;
  }

  const coin = (
    <span className="bj-carte__coin">
      <span className="bj-carte__rang">{carte.rang}</span>
      <span className="bj-carte__pip">{PIP[carte.enseigne]}</span>
    </span>
  );

  return (
    <span
      className="bj-carte"
      data-face="avant"
      data-teinte={estRouge(carte.enseigne) ? "rouge" : "noir"}
      style={style}
      aria-hidden="true"
    >
      {coin}
      <span className="bj-carte__centre">{PIP[carte.enseigne]}</span>
      <span className="bj-carte__coin bj-carte__coin--bas">
        <span className="bj-carte__rang">{carte.rang}</span>
        <span className="bj-carte__pip">{PIP[carte.enseigne]}</span>
      </span>
    </span>
  );
}

/**
 * Une rangée de la table : qui joue, ce qu'il montre, et son total.
 * La rangée entière porte le texte lu par un lecteur d'écran ; les cartes
 * dessinées en sont masquées, elles ne diraient rien de compréhensible.
 */
function Rangee({
  camp,
  titre,
  cartes,
  total,
  brulee,
  description,
  cachee = false,
}: {
  camp: "croupier" | "joueur";
  titre: string;
  cartes: Carte[];
  total: string | null;
  /** Main au-dessus de 21 : le total le DIT, il ne se contente pas d'une couleur. */
  brulee: boolean;
  description: string;
  /** Ajoute la carte face cachée du croupier à la fin de la rangée. */
  cachee?: boolean;
}) {
  return (
    <div className="bj-rangee" data-camp={camp}>
      <p className="bj-rangee__tete">
        <span className="bj-rangee__qui">{titre}</span>
        <span className="bj-rangee__total" data-brulee={brulee || undefined}>
          {total === null ? "?" : brulee ? `${total} · dépassé` : total}
        </span>
      </p>
      <div className="bj-main" role="img" aria-label={description}>
        {cartes.map((carte, index) => (
          <CarteDessin key={`${carte.rang}-${carte.enseigne}-${index}`} carte={carte} index={index} />
        ))}
        {cachee ? <CarteDessin key="dos" carte={null} index={cartes.length} /> : null}
      </div>
    </div>
  );
}

/** La table : le croupier en haut, le joueur en bas. */
function Table({ vue }: { vue: VueBlackjack }) {
  const croupier: VueCroupier = vue.croupier;
  const joueur: VueMain = vue.joueur;

  return (
    <div className="bj-table">
      <Rangee
        camp="croupier"
        titre="Croupier"
        cartes={croupier.cartes ?? [croupier.visible]}
        total={croupier.texte}
        brulee={croupier.total !== null && croupier.total > 21}
        description={direMainCroupier(croupier)}
        cachee={croupier.cartes === null}
      />
      <Rangee
        camp="joueur"
        titre="Toi"
        cartes={joueur.cartes}
        total={joueur.texte}
        brulee={joueur.brulee}
        description={direMainJoueur(joueur)}
      />
    </div>
  );
}

/** Le tableau des gains, lisible avant de lancer la manche. */
function Gains({ config, betCents }: { config: BlackjackConfig; betCents: number | null }) {
  return (
    <table className="bilan bj-gains">
      <caption>Ce que rapporte chaque issue</caption>
      <thead>
        <tr>
          <th scope="col">Issue</th>
          <th scope="col">Gain</th>
          {betCents === null ? null : <th scope="col">Avec cette mise</th>}
        </tr>
      </thead>
      <tbody>
        {config.gains.map((gain) => (
          <tr key={gain.id}>
            <th scope="row">
              {gain.label}
              <span className="bj-gains__detail">{gain.detail}</span>
            </th>
            <td>{formatMultiplier(gain.multiplier)}</td>
            {betCents === null ? null : (
              <td>
                {formatCoins(
                  Math.min(Math.round(betCents * gain.multiplier), config.maxPayoutCents),
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Le bilan d'une manche : ce qui a été misé, récupéré, et où en est le solde. */
function BilanManche({
  round,
  balanceCents,
  issue,
  pending,
  onReplay,
  onChangeBet,
}: {
  round: Round;
  balanceCents: number;
  issue: Issue | null;
  pending: boolean;
  onReplay: () => void;
  onChangeBet: () => void;
}) {
  const net = round.payoutCents - round.betCents;

  return (
    <>
      <p className="bj-resultat" data-issue={issue ?? "perdu"}>
        {issue ? MOT_ISSUE[issue] : "Fin de manche"}
      </p>

      <table className="bilan">
        <caption>Bilan de la manche</caption>
        <tbody>
          <tr>
            <th scope="row">Mise</th>
            <td>
              <Amount cents={round.betCents} />
            </td>
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
              <Amount cents={net} signed />
            </td>
          </tr>
          <tr>
            <th scope="row">Nouveau solde</th>
            <td>
              <Amount cents={balanceCents} />
            </td>
          </tr>
          <tr>
            <th scope="row">Multiplicateur</th>
            <td>{formatMultiplier(round.multiplier)}</td>
          </tr>
        </tbody>
      </table>

      <div className="bilan__actions">
        <Button variant="accent-felt" pending={pending} onClick={onReplay}>
          Rejouer (même mise)
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onChangeBet}>
          Changer la mise
        </Button>
      </div>
    </>
  );
}

export function BlackjackScreen({ gameId, config }: GameScreenProps) {
  const jeu = config as BlackjackConfig;
  const { balanceCents, setBalance } = useSession();
  const [issue, setIssue] = useState<Issue | null>(null);

  const onReset = useCallback(() => setIssue(null), []);
  const partie = useRound(gameId, { config: jeu, onReset });
  const { play: jouerUnCoup, round, state } = partie;

  const heading = useRef<HTMLHeadingElement>(null);
  const previousState = useRef<string | null>(null);
  const previousRound = useRef(round);

  // Le focus suit le changement d'écran (mise → manche → bilan), jamais à l'arrivée.
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
    else if (round.status === "cashed_out") playOutcome(round.multiplier > 1 ? "cashout" : "safe");
  }, [round]);

  const jouer = useCallback(
    (move: Move) =>
      jouerUnCoup<ReponseCoup>(
        (partieEnCours) =>
          api<ReponseCoup>(`/games/${gameId}/play`, {
            method: "POST",
            body: { roundId: partieEnCours.id, step: partieEnCours.step, move },
          }),
        (résultat, { adopt, setMessage }) => {
          setIssue(résultat.issue);
          adopt(résultat.round);
          setMessage(résultat.issue ? MOT_ISSUE[résultat.issue] : null);
        },
      ),
    [gameId, jouerUnCoup],
  );

  if (partie.loading) {
    return (
      <p className="page__loading" role="status">
        Chargement du jeu…
      </p>
    );
  }

  if (!partie.config) {
    return <Toast kind="bad">{partie.error ?? "Ce jeu n'existe pas."}</Toast>;
  }

  const vue = round ? vueDe(round.view) : null;
  const titre =
    state === "idle" ? "Choisis ta mise" : state === "active" ? "À toi de jouer" : "Fin de manche";

  return (
    <>
      <PageTitle eyebrow={`${jeu.format} · coins fictifs`} accent={accentFor(jeu.id)}>
        {jeu.name}
      </PageTitle>

      <p className="screen__aside">
        <Link to={`/regles/${jeu.id}`}>Voir les règles de {jeu.name}</Link>
      </p>

      <h2 className="screen__state" ref={heading} tabIndex={-1}>
        {titre}
      </h2>

      {partie.resumed && state === "active" ? (
        <Toast kind="info">Manche en cours reprise.</Toast>
      ) : null}
      {partie.error ? <Toast kind="bad">{partie.error}</Toast> : null}
      {/* Un 409 adopté (reprise, manche déjà close) informe : il n'est pas rouge. */}
      {partie.notice && !partie.error ? <Toast kind="info">{partie.notice}</Toast> : null}
      {partie.message && !partie.error && !partie.notice ? (
        <Toast kind={round?.status === "lost" ? "bad" : "good"}>{partie.message}</Toast>
      ) : null}

      {state === "idle" ? (
        <BetForm
          config={jeu}
          pending={partie.pending}
          onStart={(coins, mode) => void partie.start(coins, mode)}
          submitLabel="Distribuer les cartes"
          submitVariant="accent-felt"
          note={`Mode ${jeu.modes[0].label} · deux cartes pour toi, une visible pour le croupier`}
          footer={balanceCents < REFILL_THRESHOLD_CENTS ? <Refill onBalance={setBalance} /> : null}
          reward={(betCents) => (
            <RewardPanel titre="Tableau des gains" aria="Gains">
              <Gains config={jeu} betCents={betCents} />
              <p className="gamepanel__line">{jeu.regleSabot}</p>
            </RewardPanel>
          )}
        />
      ) : null}

      {state !== "idle" && round && vue ? (
        <section
          className="panel gamepanel bj"
          data-game={jeu.id}
          aria-label={state === "active" ? "Manche en cours" : "Fin de manche"}
        >
          <Table vue={vue} />

          {state === "active" ? (
            <>
              <div className="bj-actions">
                <Button
                  variant="accent-felt"
                  pending={partie.pending}
                  disabled={!vue.peutTirer}
                  aria-label="Tirer une carte"
                  onClick={() => void jouer("hit")}
                >
                  Tirer
                </Button>
                <Button
                  variant="secondary"
                  pending={partie.pending}
                  aria-label="Rester"
                  onClick={() => void jouer("stand")}
                >
                  Rester
                </Button>
              </div>
              <p className="gamepanel__line">
                {`Mise ${formatCoins(round.betCents)}`}
                {vue.peutTirer ? "" : " · à 21, on ne tire plus"}
              </p>
            </>
          ) : (
            <BilanManche
              round={round}
              balanceCents={balanceCents}
              issue={issue ?? vue.issue}
              pending={partie.pending}
              onReplay={() => void partie.replay()}
              onChangeBet={partie.changeBet}
            />
          )}
        </section>
      ) : null}
    </>
  );
}
