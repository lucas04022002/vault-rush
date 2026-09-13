import { type ReactNode, useState } from "react";
import {
  Amount,
  Balance,
  Button,
  Chip,
  Field,
  GameCard,
  OptionGrid,
  PageTitle,
  RewardTable,
  StepTrack,
  Toast,
} from "../components/index.ts";
import type { GameConfig, Outcome, Round } from "../api.ts";
import { BombBoard, GetawayBoard, LaserBoard, VaultBoard } from "../games/boards/index.ts";
import { formatCoins } from "../lib/format.ts";

/**
 * Vitrine de la direction « Néon arcade ».
 * Rendue uniquement en dev, sur http://127.0.0.1:5173/#showcase.
 */

const MULTIPLIERS = [1.92, 3.84, 7.68, 15.36, 30.72, 61.44];

const MODES = [
  {
    id: "safe",
    label: "Safe",
    chancePerStep: 2 / 3,
    multipliers: [1.47, 2.16, 3.31, 5.06, 7.75, 11.16],
  },
  { id: "risk", label: "Risk", chancePerStep: 0.5, multipliers: MULTIPLIERS },
  {
    id: "insane",
    label: "Insane",
    chancePerStep: 0.4,
    multipliers: [2.35, 5.88, 14.69, 36.73, 91.83, 229.5],
  },
];

const BETS = [100, 500, 1000, 2500, 5000, 10000];

/* ---- Plateaux : deux jeux, quatre états chacun (données réalistes) ---- */

const LASER_MULTIPLIERS = [1.92, 3.84, 7.68, 15.36, 30.72, 61.44, 122.88, 245.76];

const VAULT_CONFIG: GameConfig = {
  id: "vault-rush",
  kind: "ladder",
  canCashout: true,
  name: "Vault Rush",
  tagline: "Monte, choisis une porte par étage, encaisse avant l'alarme.",
  steps: 6,
  labels: {
    step: "étage",
    option: "porte",
    safe: "coffre",
    danger: "alarme",
    cashout: "Encaisser",
  },
  maxPayoutCents: 1_000_000,
  minBetCents: 100,
  maxBetCents: 100_000,
  modes: [
    {
      id: "risk",
      label: "Risk",
      options: 4,
      safeOptions: 2,
      houseEdge: 0.04,
      chancePerStep: 0.5,
      multipliers: MULTIPLIERS,
    },
  ],
};

const LASER_CONFIG: GameConfig = {
  id: "laser-grid",
  kind: "ladder",
  canCashout: true,
  name: "Laser Grid",
  tagline: "Traverse la grille ligne par ligne sans toucher un laser.",
  steps: 8,
  labels: {
    step: "ligne",
    option: "case",
    safe: "passage",
    danger: "laser",
    cashout: "Sortir",
  },
  maxPayoutCents: 1_000_000,
  minBetCents: 100,
  maxBetCents: 100_000,
  modes: [
    {
      id: "tendu",
      label: "Tendu",
      options: 4,
      safeOptions: 2,
      houseEdge: 0.04,
      chancePerStep: 0.5,
      multipliers: LASER_MULTIPLIERS,
    },
  ],
};

const GETAWAY_MULTIPLIERS = [1.88, 3.76, 7.52, 15.04, 30.08];
const BOMB_MULTIPLIERS = [1.92, 3.84, 7.68, 15.36];

const GETAWAY_CONFIG: GameConfig = {
  id: "getaway",
  kind: "ladder",
  canCashout: true,
  name: "Getaway",
  tagline: "Choisis ta route à chaque tronçon, planque-toi avant le barrage.",
  steps: 5,
  labels: {
    step: "tronçon",
    option: "route",
    safe: "voie libre",
    danger: "barrage",
    cashout: "Se planquer",
  },
  maxPayoutCents: 1_000_000,
  minBetCents: 100,
  maxBetCents: 100_000,
  modes: [
    {
      id: "cavale",
      label: "Cavale",
      options: 4,
      safeOptions: 2,
      houseEdge: 0.06,
      chancePerStep: 0.5,
      multipliers: GETAWAY_MULTIPLIERS,
    },
  ],
};

const BOMB_CONFIG: GameConfig = {
  id: "bomb-squad",
  kind: "ladder",
  canCashout: true,
  name: "Bomb Squad",
  tagline: "Coupe un câble par étape, retire-toi avant l'explosion.",
  steps: 4,
  labels: {
    step: "étape",
    option: "câble",
    safe: "neutralisé",
    danger: "explosion",
    cashout: "Se retirer",
  },
  maxPayoutCents: 1_000_000,
  minBetCents: 100,
  maxBetCents: 100_000,
  modes: [
    {
      id: "confirme",
      label: "Confirmé",
      options: 4,
      safeOptions: 2,
      houseEdge: 0.04,
      chancePerStep: 0.5,
      multipliers: BOMB_MULTIPLIERS,
    },
  ],
};

/** Une partie figée, telle que le serveur la renvoie. */
function fixtureRound(config: GameConfig, step: number, extra: Partial<Round> = {}): Round {
  const multipliers = config.modes[0].multipliers;
  const multiplier = step === 0 ? 1 : multipliers[step - 1];
  return {
    id: 1,
    game: config.id,
    mode: config.modes[0].id,
    status: "playing",
    step,
    maxSteps: config.steps,
    betCents: 2500,
    multiplier,
    nextMultiplier: step < config.steps ? multipliers[step] : null,
    cashoutCents: step === 0 ? 0 : Math.round(2500 * multiplier),
    payoutCents: 0,
    createdAt: "2026-09-13 10:00:00",
    ...extra,
  };
}

const SAFE_REVEAL: Outcome[] = ["danger", "safe", "safe", "danger"];
const DANGER_REVEAL: Outcome[] = ["danger", "safe", "safe", "safe"];

/** Un plateau dans un état, avec sa légende. */
function BoardState({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: "var(--sp-2)" }}>
      <p className="label">{legend}</p>
      <div className="panel">{children}</div>
    </div>
  );
}


export function Showcase() {
  const [bet, setBet] = useState(2500);
  const [mode, setMode] = useState("risk");
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState<("safe" | "danger")[] | undefined>(undefined);

  return (
    <div className="page">
      <div className="row" style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="brand">VAULT RUSH</span>
        <Balance cents={124750} />
      </div>

      <PageTitle eyebrow="Jeu 01 · 6 étages">Vault Rush</PageTitle>

      <section style={{ display: "grid", gap: "var(--sp-4)" }}>
        <p className="label">Plateau · Vault Rush — portes de coffre</p>

        <BoardState legend="Avant le choix (étage 3 sur 6)">
          <VaultBoard
            config={VAULT_CONFIG}
            round={fixtureRound(VAULT_CONFIG, 2)}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <BoardState legend="Révélation : coffre trouvé">
          <VaultBoard
            config={VAULT_CONFIG}
            round={fixtureRound(VAULT_CONFIG, 3)}
            revealed={SAFE_REVEAL}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <BoardState legend="Révélation : alarme (gyrophare)">
          <VaultBoard
            config={VAULT_CONFIG}
            round={fixtureRound(VAULT_CONFIG, 2, {
              status: "lost",
              cashoutCents: 0,
              payoutCents: 0,
              nextMultiplier: null,
            })}
            revealed={DANGER_REVEAL}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <BoardState legend="Fin de partie : encaissé au dernier étage">
          <VaultBoard
            config={VAULT_CONFIG}
            round={fixtureRound(VAULT_CONFIG, 6, {
              status: "cashed_out",
              payoutCents: 153_600,
              nextMultiplier: null,
            })}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <p className="label">Plateau · Laser Grid — grille laser</p>

        <BoardState legend="Avant le choix (ligne 3 sur 8)">
          <LaserBoard
            config={LASER_CONFIG}
            round={fixtureRound(LASER_CONFIG, 2)}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <BoardState legend="Révélation : passage trouvé">
          <LaserBoard
            config={LASER_CONFIG}
            round={fixtureRound(LASER_CONFIG, 3)}
            revealed={SAFE_REVEAL}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <BoardState legend="Révélation : laser touché">
          <LaserBoard
            config={LASER_CONFIG}
            round={fixtureRound(LASER_CONFIG, 2, {
              status: "lost",
              cashoutCents: 0,
              payoutCents: 0,
              nextMultiplier: null,
            })}
            revealed={DANGER_REVEAL}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <BoardState legend="Fin de partie : sortie atteinte">
          <LaserBoard
            config={LASER_CONFIG}
            round={fixtureRound(LASER_CONFIG, 8, {
              status: "cashed_out",
              payoutCents: 614_400,
              nextMultiplier: null,
            })}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <p className="label">Plateau · Getaway — la route qui défile</p>

        <BoardState legend="Avant le choix (tronçon 3 sur 5)">
          <GetawayBoard
            config={GETAWAY_CONFIG}
            round={fixtureRound(GETAWAY_CONFIG, 2)}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <BoardState legend="Révélation : voie libre">
          <GetawayBoard
            config={GETAWAY_CONFIG}
            round={fixtureRound(GETAWAY_CONFIG, 3)}
            revealed={SAFE_REVEAL}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <BoardState legend="Révélation : barrage (jauge de poursuite au rouge)">
          <GetawayBoard
            config={GETAWAY_CONFIG}
            round={fixtureRound(GETAWAY_CONFIG, 4, {
              status: "lost",
              cashoutCents: 0,
              payoutCents: 0,
              nextMultiplier: null,
            })}
            revealed={DANGER_REVEAL}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <BoardState legend="Fin de partie : planqué au dernier tronçon">
          <GetawayBoard
            config={GETAWAY_CONFIG}
            round={fixtureRound(GETAWAY_CONFIG, 5, {
              status: "cashed_out",
              payoutCents: 75_200,
              nextMultiplier: null,
            })}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <p className="label">Plateau · Bomb Squad — le boîtier</p>

        <BoardState legend="Avant le choix (étape 2 sur 4, afficheur « 03 »)">
          <BombBoard
            config={BOMB_CONFIG}
            round={fixtureRound(BOMB_CONFIG, 1)}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <BoardState legend="Révélation : câble neutralisé">
          <BombBoard
            config={BOMB_CONFIG}
            round={fixtureRound(BOMB_CONFIG, 2)}
            revealed={SAFE_REVEAL}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <BoardState legend="Révélation : explosion (boîtier en rouge)">
          <BombBoard
            config={BOMB_CONFIG}
            round={fixtureRound(BOMB_CONFIG, 1, {
              status: "lost",
              cashoutCents: 0,
              payoutCents: 0,
              nextMultiplier: null,
            })}
            revealed={DANGER_REVEAL}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>

        <BoardState legend="Fin de partie : retiré après la dernière étape">
          <BombBoard
            config={BOMB_CONFIG}
            round={fixtureRound(BOMB_CONFIG, 4, {
              status: "cashed_out",
              payoutCents: 38_400,
              nextMultiplier: null,
            })}
            pending={false}
            onPick={() => {}}
          />
        </BoardState>
      </section>

      <section className="panel" style={{ display: "grid", gap: "var(--sp-4)" }}>
        <div style={{ display: "grid", gap: "var(--sp-2)" }}>
          <p className="label">Étape 3 sur 6 · ×3,84 encaissables</p>
          <StepTrack steps={6} current={2} multipliers={MULTIPLIERS} status="playing" />
        </div>

        <div style={{ display: "grid", gap: "var(--sp-2)" }}>
          <p className="label">Choisis une porte</p>
          <OptionGrid
            count={4}
            labels={{ option: "Porte" }}
            onPick={() => setRevealed(["safe", "danger", "safe", "danger"])}
            disabled={pending}
            revealed={revealed}
          />
        </div>

        <Button variant="primary" onClick={() => setPending((p) => !p)} pending={pending}>
          Encaisser {formatCoins(9600)}
        </Button>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-2)" }}>
          <span className="label">Mise {formatCoins(bet)}</span>
          <span className="label">2 coffres / 4</span>
        </div>
      </section>

      <section className="panel" style={{ display: "grid", gap: "var(--sp-3)" }}>
        <p className="label">Mise</p>
        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
          {BETS.map((value) => (
            <Chip key={value} selected={value === bet} onClick={() => setBet(value)}>
              {formatCoins(value).replace(" coins", "")}
            </Chip>
          ))}
        </div>
        <p className="label">Mode</p>
        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
          {MODES.map((m) => (
            <Chip key={m.id} selected={m.id === mode} onClick={() => setMode(m.id)}>
              {m.label}
            </Chip>
          ))}
        </div>
        <Field label="Mise libre" id="bet" hint="Entre 1,00 et 1 000,00 coins">
          <input inputMode="decimal" defaultValue="25,00" />
        </Field>
        <Field label="Pseudo" id="pseudo" error="Ce pseudo est déjà pris.">
          <input defaultValue="lucas" />
        </Field>
      </section>

      <section className="panel" style={{ display: "grid", gap: "var(--sp-3)" }}>
        <p className="label">Tableau des récompenses</p>
        <RewardTable modes={MODES} betCents={bet} maxPayoutCents={1000000} />
      </section>

      <section style={{ display: "grid", gap: "var(--sp-3)" }}>
        <Toast kind="good">
          Bilan : mise <Amount cents={2500} /> · récupéré <Amount cents={9600} /> · net{" "}
          <Amount cents={7100} signed />
        </Toast>
        <Toast kind="bad">
          Alarme ! Porte 2, étape 4. Mise perdue : <Amount cents={-2500} signed />
        </Toast>
        <Toast kind="info">
          Coins fictifs, sans valeur. Recharge gratuite de 1 000 coins sous 10 coins.
        </Toast>
      </section>

      <section style={{ display: "grid", gap: "var(--sp-3)", gridTemplateColumns: "1fr 1fr" }}>
        <GameCard
          tag="JEU 01 · 6 ÉTAGES"
          title="Vault Rush"
          tagline="Monte, choisis une porte par étage, encaisse avant l'alarme."
          accent="yellow"
          onPlay={() => {}}
          onRules={() => {}}
        />
        <GameCard
          tag="JEU 02 · 8 LIGNES"
          title="Laser Grid"
          tagline="Traverse la grille ligne par ligne sans toucher un laser."
          accent="cyan"
          onPlay={() => {}}
          onRules={() => {}}
        />
        <GameCard
          tag="JEU 03 · 5 TRONÇONS"
          title="Getaway"
          tagline="Choisis ta route à chaque tronçon, planque-toi avant le barrage."
          accent="magenta"
          onPlay={() => {}}
          onRules={() => {}}
        />
        <GameCard
          tag="JEU 04 · 4 ÉTAPES"
          title="Bomb Squad"
          tagline="Coupe un câble par étape, retire-toi avant l'explosion."
          accent="orange"
          onPlay={() => {}}
          onRules={() => {}}
        />
      </section>

      <section style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
        <Button variant="primary" onClick={() => {}}>
          Principal
        </Button>
        <Button variant="accent-cyan" onClick={() => {}}>
          Sortir
        </Button>
        <Button variant="accent-magenta" onClick={() => {}}>
          Se planquer
        </Button>
        <Button variant="accent-orange" onClick={() => {}}>
          Se retirer
        </Button>
        <Button variant="secondary" onClick={() => {}}>
          Secondaire
        </Button>
        <Button variant="danger" onClick={() => {}}>
          Abandonner
        </Button>
        <Button variant="quiet" onClick={() => {}}>
          Discret
        </Button>
        <Button variant="primary" pending onClick={() => {}}>
          En attente
        </Button>
      </section>

      <section style={{ display: "grid", gap: "var(--sp-2)" }}>
        <p className="label">Fin de partie</p>
        <StepTrack steps={6} current={3} multipliers={MULTIPLIERS} status="lost" />
        <StepTrack steps={6} current={6} multipliers={MULTIPLIERS} status="cashed_out" />
        <OptionGrid
          count={4}
          labels={{ option: "Porte" }}
          onPick={() => {}}
          disabled
          revealed={["safe", "danger", "safe", "safe"]}
        />
      </section>
    </div>
  );
}
