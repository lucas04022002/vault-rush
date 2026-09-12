import { useState } from "react";
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
      </section>

      <section style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
        <Button variant="primary" onClick={() => {}}>
          Principal
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
