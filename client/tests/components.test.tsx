import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatCoins, formatMultiplier, formatPercent } from "../src/lib/format.ts";
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
} from "../src/components/index.ts";

/** fr-FR sépare les milliers par une espace fine insécable : on normalise pour comparer. */
const flat = (s: string) => s.replace(/[   ]/g, " ");

const MODES = [
  { id: "safe", label: "Safe", chancePerStep: 2 / 3, multipliers: [1.47, 2.16, 3.31, 5.06, 7.75, 11.16] },
  { id: "risk", label: "Risk", chancePerStep: 0.5, multipliers: [1.92, 3.84, 7.68, 15.36, 30.72, 61.44] },
  { id: "insane", label: "Insane", chancePerStep: 0.4, multipliers: [2.35, 5.88, 14.69, 36.73, 91.83, 229.5] },
];

describe("formatCoins", () => {
  it("formate en fr-FR avec deux décimales et l'unité coins", () => {
    expect(flat(formatCoins(469999))).toBe("4 699,99 coins");
    expect(flat(formatCoins(0))).toBe("0,00 coins");
    expect(flat(formatCoins(100000000))).toBe("1 000 000,00 coins");
  });

  it("préfixe le signe avec un vrai signe moins quand on le demande", () => {
    expect(formatCoins(-2500, { signed: true }).startsWith("−")).toBe(true);
    expect(flat(formatCoins(-2500, { signed: true }))).toBe("−25,00 coins");
    expect(flat(formatCoins(7100, { signed: true }))).toBe("+71,00 coins");
  });

  it("n'invente pas de signe sans l'option", () => {
    expect(flat(formatCoins(-2500))).toBe("−25,00 coins");
  });
});

describe("formatMultiplier / formatPercent", () => {
  it("affiche le multiplicateur avec deux décimales", () => {
    expect(formatMultiplier(3.84)).toBe("×3,84");
    expect(formatMultiplier(229.5)).toBe("×229,50");
  });

  it("affiche une chance en pourcentage entier", () => {
    expect(flat(formatPercent(2 / 3))).toBe("67 %");
    expect(flat(formatPercent(0.5))).toBe("50 %");
  });
});

describe("Amount", () => {
  it("rend le montant formaté", () => {
    render(<Amount cents={124750} />);
    expect(flat(screen.getByText(/coins/).textContent ?? "")).toBe("1 247,50 coins");
  });

  it("distingue visuellement un gain d'une perte", () => {
    const { rerender } = render(<Amount cents={7100} signed />);
    expect(screen.getByText(/coins/)).toHaveAttribute("data-tone", "good");
    rerender(<Amount cents={-2500} signed />);
    expect(screen.getByText(/coins/)).toHaveAttribute("data-tone", "bad");
  });
});

describe("Balance", () => {
  it("annonce le solde et l'affiche formaté", () => {
    render(<Balance cents={124750} />);
    expect(screen.getByText("Solde")).toBeInTheDocument();
    expect(flat(screen.getByText(/coins/).textContent ?? "")).toBe("1 247,50 coins");
  });
});

describe("Button", () => {
  it("appelle onClick et porte la variante", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        Encaisser
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Encaisser" });
    expect(button).toHaveAttribute("data-variant", "primary");
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("en attente : désactivé, aria-busy, et aucun clic ne passe", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" pending onClick={onClick}>
        Encaisser
      </Button>,
    );
    const button = screen.getByRole("button", { name: /encaisser/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("respecte disabled et le type soumis", () => {
    render(
      <Button variant="secondary" type="submit" disabled>
        Se connecter
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Se connecter" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("type", "submit");
    expect(button).not.toHaveAttribute("aria-busy", "true");
  });
});

describe("Chip", () => {
  it("porte aria-pressed et réagit au clic", async () => {
    const onClick = vi.fn();
    render(
      <Chip selected onClick={onClick}>
        25
      </Chip>,
    );
    const chip = screen.getByRole("button", { name: "25" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("non sélectionnée par défaut", () => {
    render(<Chip onClick={() => {}}>50</Chip>);
    expect(screen.getByRole("button", { name: "50" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Field", () => {
  it("associe le libellé, l'aide et l'erreur au champ", () => {
    render(
      <Field label="Mise" id="mise" hint="Entre 1 et 1 000 coins" error="Mise trop élevée">
        <input id="mise" />
      </Field>,
    );
    const input = screen.getByLabelText("Mise");
    const described = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(described).toContain("mise-hint");
    expect(described).toContain("mise-error");
    expect(screen.getByText("Mise trop élevée")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("sans erreur, le champ n'est pas invalide", () => {
    render(
      <Field label="Pseudo" id="pseudo">
        <input id="pseudo" />
      </Field>,
    );
    expect(screen.getByLabelText("Pseudo")).not.toHaveAttribute("aria-invalid", "true");
  });
});

describe("StepTrack", () => {
  const multipliers = [1.92, 3.84, 7.68, 15.36, 30.72, 61.44];

  it("annonce l'étape courante et marque les cellules", () => {
    render(<StepTrack steps={6} current={2} multipliers={multipliers} status="playing" />);
    const track = screen.getByLabelText("Étape 3 sur 6");
    const cells = within(track).getAllByRole("listitem");
    expect(cells).toHaveLength(6);
    expect(cells.map((c) => c.getAttribute("data-state"))).toEqual([
      "done",
      "done",
      "now",
      "todo",
      "todo",
      "todo",
    ]);
    expect(cells[2].textContent).toContain("×7,68");
  });

  it("partie perdue : l'étape fatale est marquée", () => {
    render(<StepTrack steps={6} current={3} multipliers={multipliers} status="lost" />);
    const cells = screen.getAllByRole("listitem");
    expect(cells.map((c) => c.getAttribute("data-state"))).toEqual([
      "done",
      "done",
      "done",
      "lost",
      "todo",
      "todo",
    ]);
  });

  it("partie encaissée : aucune étape courante", () => {
    render(<StepTrack steps={6} current={6} multipliers={multipliers} status="cashed_out" />);
    const states = screen.getAllByRole("listitem").map((c) => c.getAttribute("data-state"));
    expect(states).toEqual(["done", "done", "done", "done", "done", "done"]);
  });
});

describe("OptionGrid", () => {
  it("rend N options nommées et transmet le choix", async () => {
    const onPick = vi.fn();
    render(<OptionGrid count={4} labels={{ option: "Porte" }} onPick={onPick} disabled={false} />);
    const group = screen.getByRole("group", { name: "Choisis une porte" });
    expect(within(group).getAllByRole("button")).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Porte 3" }));
    expect(onPick).toHaveBeenCalledWith(3);
  });

  it("désactivé : aucun clic ne passe", async () => {
    const onPick = vi.fn();
    render(<OptionGrid count={4} labels={{ option: "Case" }} onPick={onPick} disabled />);
    expect(screen.getByRole("group", { name: "Choisis une case" })).toBeInTheDocument();
    const first = screen.getAllByRole("button")[0];
    expect(first).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(first);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("révélé : chaque option montre sa vraie nature", () => {
    render(
      <OptionGrid
        count={4}
        labels={{ option: "Porte" }}
        onPick={() => {}}
        disabled
        revealed={["safe", "danger", "safe", "danger"]}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("data-reveal"))).toEqual([
      "safe",
      "danger",
      "safe",
      "danger",
    ]);
    expect(screen.getByRole("button", { name: /Porte 2.*alarme/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Porte 1.*sûre/i })).toBeInTheDocument();
  });
});

describe("RewardTable", () => {
  it("montre les chances et les multiplicateurs de chaque mode", () => {
    render(<RewardTable modes={MODES} maxPayoutCents={1000000} />);
    const risk = screen.getByRole("row", { name: /Risk/ });
    expect(within(risk).getByText("×1,92")).toBeInTheDocument();
    expect(within(risk).getByText("×61,44")).toBeInTheDocument();
    expect(flat(within(risk).getByText(/%$/).textContent ?? "")).toBe("50 %");
  });

  it("avec une mise, ajoute le gain max plafonné", () => {
    render(<RewardTable modes={MODES} betCents={10000} maxPayoutCents={1000000} />);
    expect(screen.getByRole("columnheader", { name: "Gain max" })).toBeInTheDocument();
    // 100,00 coins × 61,44 = 6 144,00 coins (sous le plafond)
    const risk = screen.getByRole("row", { name: /Risk/ });
    expect(flat(within(risk).getByText(/6\D?144,00 coins/).textContent ?? "")).toBe("6 144,00 coins");
    // 100,00 coins × 229,50 = 22 950,00 coins → plafonné à 10 000,00 coins
    const insane = screen.getByRole("row", { name: /Insane/ });
    expect(flat(within(insane).getByText(/coins/).textContent ?? "")).toBe("10 000,00 coins");
  });

  it("rappelle le plafond en pied de tableau", () => {
    render(<RewardTable modes={MODES} maxPayoutCents={1000000} />);
    expect(flat(screen.getByText(/plafonné/i).textContent ?? "")).toContain(
      "Gain plafonné à 10 000,00 coins par partie",
    );
  });

  it("au-delà de 8 étapes, ne montre que la première, la médiane et la dernière", () => {
    const long = [
      {
        id: "calme",
        label: "Calme",
        chancePerStep: 0.75,
        multipliers: [1.31, 1.71, 2.24, 2.93, 3.83, 5.01, 6.55, 8.57, 11.21, 14.66],
      },
    ];
    render(<RewardTable modes={long} maxPayoutCents={1000000} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Mode", "Chance", "Étape 1", "Étape 5", "Étape 10"]);
  });
});

describe("Toast", () => {
  it("est une zone live polie", () => {
    render(<Toast kind="bad">Alarme ! Mise perdue.</Toast>);
    const toast = screen.getByRole("status");
    expect(toast).toHaveAttribute("aria-live", "polite");
    expect(toast).toHaveAttribute("data-kind", "bad");
    expect(toast).toHaveTextContent("Alarme ! Mise perdue.");
  });
});

describe("PageTitle", () => {
  it("rend un titre de niveau 1 avec son surtitre", () => {
    render(<PageTitle eyebrow="Jeu 01">Vault Rush</PageTitle>);
    expect(screen.getByRole("heading", { level: 1, name: "Vault Rush" })).toBeInTheDocument();
    expect(screen.getByText("Jeu 01")).toBeInTheDocument();
  });
});

describe("GameCard", () => {
  it("propose de jouer ou de lire les règles", async () => {
    const onPlay = vi.fn();
    const onRules = vi.fn();
    render(
      <GameCard
        tag="JEU 01 · 6 ÉTAGES"
        title="Vault Rush"
        tagline="Monte, choisis une porte par étage, encaisse avant l'alarme."
        accent="yellow"
        onPlay={onPlay}
        onRules={onRules}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Vault Rush" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Jouer à Vault Rush/i }));
    await userEvent.click(screen.getByRole("button", { name: /Règles de Vault Rush/i }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onRules).toHaveBeenCalledTimes(1);
  });
});
