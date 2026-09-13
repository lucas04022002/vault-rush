import { useEffect, useRef } from "react";
import { Link } from "react-router";
import type { Round } from "../api.ts";
import { Amount, Button, PageTitle, Toast } from "../components/index.ts";
import { formatMultiplier } from "../lib/format.ts";
import { playOutcome } from "../lib/sound.ts";
import { useSession } from "../session.tsx";
import { BetForm, RewardPanel } from "./BetForm.tsx";
import { accentFor } from "./boards/index.ts";
import { Refill, REFILL_THRESHOLD_CENTS } from "./Refill.tsx";
import type { GameScreenProps } from "./screens.ts";
import { VaultCodePayouts } from "./VaultCodePayouts.tsx";
import {
  codeLabel,
  indicesLabel,
  modeOf,
  useVaultCode,
  vaultCodeConfig,
  viewOf,
  type VaultCodeAttempt,
  type VaultCodeConfig,
  type VaultCodeMode,
} from "./vaultCode.ts";

/** Les essais accordés par un mode, lus dans la config du serveur. */
function essaisDe(config: VaultCodeConfig, modeId: string): number {
  return modeOf(config, modeId).essais;
}

/**
 * L'écran de VAULT CODE (`kind: "code"`).
 *
 * Un pavé numérique alimente quatre fentes, le journal des essais tient au
 * dessus : chaque ligne montre la combinaison tentée et la réponse du coffre —
 * un verrou plein par chiffre bien placé, un anneau creux par chiffre présent
 * mais mal placé. Les chiffres déjà écartés par la déduction ne sont PAS
 * calculés pour le joueur : c'est le jeu. Seul un chiffre déjà posé dans la
 * combinaison en cours est barré, parce que le code n'a pas deux fois le même.
 */
export function VaultCodeScreen({ gameId, config: brut }: GameScreenProps) {
  const config = vaultCodeConfig(brut);
  const { balanceCents, setBalance } = useSession();
  const partie = useVaultCode(gameId, config);
  const { round, state } = partie;

  const heading = useRef<HTMLHeadingElement>(null);
  const etatPrecedent = useRef<string | null>(null);
  const partiePrecedente = useRef(round);

  // Le focus suit le changement d'écran (mise → jeu → bilan), jamais à l'arrivée.
  useEffect(() => {
    if (etatPrecedent.current !== null && etatPrecedent.current !== state) {
      heading.current?.focus();
    }
    etatPrecedent.current = state;
  }, [state]);

  // Le son ne part qu'APRÈS une réponse du serveur, et jamais sur une reprise.
  useEffect(() => {
    const avant = partiePrecedente.current;
    partiePrecedente.current = round;
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

  const vue = viewOf(round, config);
  const mode = modeOf(config, round?.mode);
  const titre =
    state === "idle"
      ? "Choisis ta mise"
      : state === "active"
        ? `Essai ${Math.min(vue.attempts.length + 1, vue.essais)} sur ${vue.essais}`
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
        <Toast kind={round?.status === "lost" ? "bad" : round?.status === "playing" ? "info" : "good"}>
          {partie.message}
        </Toast>
      ) : null}

      {state === "idle" ? (
        <BetForm
          config={config}
          pending={partie.pending}
          onStart={(coins, modeId) => void partie.start(coins, modeId)}
          submitLabel="Ouvrir le coffre"
          submitVariant="accent-ice"
          modeLabel={(m) => `${m.label} · ${essaisDe(config, m.id)} essais`}
          modeAria={(m) => `Mode ${m.label}, ${essaisDe(config, m.id)} essais`}
          footer={
            balanceCents < REFILL_THRESHOLD_CENTS ? <Refill onBalance={setBalance} /> : null
          }
          reward={(betCents) => (
            <RewardPanel titre="Table des gains">
              <VaultCodePayouts config={config} betCents={betCents ?? undefined} />
            </RewardPanel>
          )}
        />
      ) : null}

      {state === "active" && round ? (
        <section className="panel vaultcode" aria-label="Coffre">
          <VaultCodeStatus vue={vue} mode={mode} />
          <VaultCodeLog attempts={vue.attempts} digits={config.digits} />
          <VaultCodeEntry entree={partie.entree} digits={config.digits} />
          <VaultCodeKeypad
            entree={partie.entree}
            digits={config.digits}
            pending={partie.pending}
            onDigit={partie.tape}
            onErase={partie.efface}
            onSubmit={() => void partie.valide()}
          />
        </section>
      ) : null}

      {state === "finished" && round ? (
        <VaultCodeBilan
          config={config}
          mode={mode}
          round={round}
          attempts={vue.attempts}
          code={vue.code}
          balanceCents={balanceCents}
          pending={partie.pending}
          onReplay={() => void partie.replay()}
          onChangeBet={partie.changeBet}
        />
      ) : null}
    </>
  );
}

/* -------------------------------- La partie -------------------------------- */

function VaultCodeStatus({
  vue,
  mode,
}: {
  vue: { essais: number; essaisRestants: number; attempts: VaultCodeAttempt[] };
  mode: VaultCodeMode;
}) {
  // Le multiplicateur que vaudrait le code trouvé à l'essai qui vient.
  const prochain = mode.multipliers[vue.attempts.length];

  return (
    <div className="vaultcode__status">
      <p className="vaultcode__restant">
        {"Essais restants : "}
        <strong>{vue.essaisRestants}</strong>
        {` sur ${vue.essais}`}
      </p>
      {prochain === undefined ? null : (
        <p className="vaultcode__prochain">
          {"Trouvé maintenant : "}
          <strong>{formatMultiplier(prochain)}</strong>
        </p>
      )}
    </div>
  );
}

/** Le journal des essais : la combinaison tentée, et la réponse du coffre. */
function VaultCodeLog({ attempts, digits }: { attempts: VaultCodeAttempt[]; digits: number }) {
  if (attempts.length === 0) {
    return (
      <p className="vaultcode__vide">{`Aucun essai pour l'instant : compose ${digits} chiffres tous différents.`}</p>
    );
  }

  return (
    <ol className="vclog" aria-label="Essais déjà joués">
      {attempts.map((essai, index) => (
        <li className="vclog__row" key={`${essai.guess.join("")}-${index}`}>
          <span className="vclog__rank" aria-hidden="true">
            {index + 1}
          </span>
          <span className="vclog__digits">
            {essai.guess.map((chiffre, place) => (
              <span className="vclog__digit" key={place}>
                {chiffre}
              </span>
            ))}
          </span>
          <span className="vclog__marks" aria-hidden="true">
            {Array.from({ length: essai.verrous }, (_, i) => (
              <span className="vcmark" data-kind="verrou" key={`v${i}`} />
            ))}
            {Array.from({ length: essai.echos }, (_, i) => (
              <span className="vcmark" data-kind="echo" key={`e${i}`} />
            ))}
            {essai.verrous + essai.echos === 0 ? (
              <span className="vclog__rien">rien</span>
            ) : null}
          </span>
          <span className="sr-only">
            {`Essai ${index + 1} : ${codeLabel(essai.guess)} — ${indicesLabel(
              essai.verrous,
              essai.echos,
            )}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Les quatre fentes de l'afficheur : la combinaison en cours de saisie. */
function VaultCodeEntry({ entree, digits }: { entree: number[]; digits: number }) {
  return (
    <p className="vcslots" aria-live="polite">
      <span className="sr-only">
        {entree.length === 0
          ? "Aucun chiffre composé"
          : `Composé : ${codeLabel(entree)}`}
      </span>
      {Array.from({ length: digits }, (_, i) => (
        <span className="vcslot" key={i} data-filled={i < entree.length || undefined} aria-hidden="true">
          {i < entree.length ? entree[i] : ""}
        </span>
      ))}
    </p>
  );
}

type KeypadProps = {
  entree: number[];
  digits: number;
  pending: boolean;
  onDigit: (chiffre: number) => void;
  onErase: () => void;
  onSubmit: () => void;
};

/** Le pavé : dix chiffres, effacer, valider. Que de vrais boutons. */
function VaultCodeKeypad({ entree, digits, pending, onDigit, onErase, onSubmit }: KeypadProps) {
  const complet = entree.length === digits;

  return (
    <div className="vckeys" role="group" aria-label="Pavé numérique">
      {Array.from({ length: 10 }, (_, chiffre) => {
        const dejaPose = entree.includes(chiffre);
        return (
          <button
            type="button"
            key={chiffre}
            className="vckey"
            data-used={dejaPose || undefined}
            aria-label={
              dejaPose ? `Chiffre ${chiffre}, déjà composé` : `Composer le chiffre ${chiffre}`
            }
            disabled={pending || complet || dejaPose}
            onClick={() => onDigit(chiffre)}
          >
            {chiffre}
          </button>
        );
      })}

      <div className="vckeys__actions">
        <Button
          variant="secondary"
          aria-label="Effacer le dernier chiffre"
          disabled={pending || entree.length === 0}
          onClick={onErase}
        >
          Effacer
        </Button>
        <Button
          variant="accent-ice"
          aria-label="Valider la combinaison"
          pending={pending}
          disabled={!complet}
          onClick={onSubmit}
        >
          Valider
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------- Le bilan -------------------------------- */

type BilanProps = {
  config: VaultCodeConfig;
  mode: VaultCodeMode;
  round: Round;
  attempts: VaultCodeAttempt[];
  code: number[] | null;
  balanceCents: number;
  pending: boolean;
  onReplay: () => void;
  onChangeBet: () => void;
};

/** Fin de partie : le code enfin montré, et ce que la partie a coûté ou rapporté. */
function VaultCodeBilan({
  config,
  mode,
  round,
  attempts,
  code,
  balanceCents,
  pending,
  onReplay,
  onChangeBet,
}: BilanProps) {
  const net = round.payoutCents - round.betCents;
  const trouve = round.status === "cashed_out";

  return (
    <section className="panel vaultcode" aria-label="Fin de partie">
      <div className="vccode" data-found={trouve || undefined}>
        <p className="label">{trouve ? "Coffre ouvert" : "Le code était"}</p>
        <p className="vcslots" data-reveal="true">
          <span className="sr-only">{code ? `Le code était ${codeLabel(code)}` : ""}</span>
          {(code ?? []).map((chiffre, i) => (
            <span className="vcslot" key={i} data-filled="true" aria-hidden="true">
              {chiffre}
            </span>
          ))}
        </p>
      </div>

      <VaultCodeLog attempts={attempts} digits={config.digits} />

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
            <th scope="row">Essais utilisés</th>
            <td>{`${attempts.length} sur ${mode.essais}`}</td>
          </tr>
          <tr>
            <th scope="row">Multiplicateur</th>
            <td>{formatMultiplier(round.multiplier)}</td>
          </tr>
        </tbody>
      </table>

      <div className="bilan__actions">
        <Button variant="accent-ice" pending={pending} onClick={onReplay}>
          Rejouer (même mise, même mode)
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onChangeBet}>
          Changer la mise
        </Button>
      </div>
    </section>
  );
}
