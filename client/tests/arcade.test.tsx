import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { baseApi } from "./helpers/fake-api.ts";
import { renderApp } from "./helpers/render.tsx";

/**
 * L'arcade à SEPT jeux : ses groupes, son ordre, et son étiquette.
 *
 * Deux défauts que ces tests verrouillent, tous deux constatés le 13/09 :
 *   - l'étiquette pluralisait `labels.step` au jugé et affichait
 *     « Jeu 05 · 1 lâchers » pour Diamond Drop. C'est désormais le jeu qui
 *     écrit son format (`config.format`), et l'arcade l'affiche TEL QUEL ;
 *   - les sept tuiles se suivaient en vrac. Elles sont regroupées par genre,
 *     et un genre inconnu du client n'en fait pas disparaître une.
 */

/** Le catalogue complet, dans l'ordre que sert `GET /api/games`. */
const CATALOGUE = [
  { id: "vault-rush", kind: "ladder", name: "Vault Rush", format: "6 étages" },
  { id: "laser-grid", kind: "ladder", name: "Laser Grid", format: "8 lignes" },
  { id: "getaway", kind: "ladder", name: "Getaway", format: "5 tronçons" },
  { id: "bomb-squad", kind: "ladder", name: "Bomb Squad", format: "4 étapes" },
  { id: "vault-code", kind: "code", name: "Vault Code", format: "4 chiffres, 5 à 7 essais" },
  { id: "diamond-drop", kind: "drop", name: "Diamond Drop", format: "8 à 16 rangées" },
  {
    id: "blackjack-express",
    kind: "cards",
    name: "Blackjack Express",
    format: "contre le croupier",
  },
].map((jeu) => ({
  ...jeu,
  canCashout: jeu.kind === "ladder",
  tagline: `Tagline de ${jeu.name}`,
  steps: 1,
  maxPayoutCents: 1_000_000,
  minBetCents: 100,
  maxBetCents: 100_000,
  labels: { step: "lâcher", option: "case", safe: "case", danger: "case", cashout: "Encaisser" },
  modes: [{ id: "unique", label: "Unique" }],
}));

function arcade(games: unknown[] = CATALOGUE) {
  baseApi(true).on("GET /api/games", { json: { games } }).install();
  renderApp("/");
}

describe("arcade groupée par genre", () => {
  it("range les sept jeux dans quatre groupes, dans l'ordre", async () => {
    arcade();
    await screen.findByRole("heading", { name: "Arcade", level: 1 });

    const genres = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(genres).toEqual(["Monte et encaisse", "Réflexion", "Hasard pur", "Cartes"]);
  });

  it("chaque groupe ne contient que ses jeux", async () => {
    arcade();
    await screen.findByRole("heading", { name: "Arcade", level: 1 });

    const jeuxDe = (titre: string) =>
      within(screen.getByRole("region", { name: titre }))
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent);

    expect(jeuxDe("Monte et encaisse")).toEqual([
      "Vault Rush",
      "Laser Grid",
      "Getaway",
      "Bomb Squad",
    ]);
    expect(jeuxDe("Réflexion")).toEqual(["Vault Code"]);
    expect(jeuxDe("Hasard pur")).toEqual(["Diamond Drop"]);
    expect(jeuxDe("Cartes")).toEqual(["Blackjack Express"]);
  });

  it("affiche le format du jeu tel quel, sans pluriel deviné", async () => {
    arcade();
    await screen.findByRole("heading", { name: "Arcade", level: 1 });

    expect(screen.getByText("Jeu 01 · 6 étages")).toBeInTheDocument();
    expect(screen.getByText("Jeu 05 · 4 chiffres, 5 à 7 essais")).toBeInTheDocument();
    // Le défaut d'origine, mot pour mot : il ne doit plus exister.
    expect(screen.queryByText(/1 lâchers/)).not.toBeInTheDocument();
    expect(screen.getByText("Jeu 06 · 8 à 16 rangées")).toBeInTheDocument();
    expect(screen.getByText("Jeu 07 · contre le croupier")).toBeInTheDocument();
  });

  it("le numéro d'un jeu est son rang dans le catalogue, pas dans son groupe", async () => {
    arcade();
    await screen.findByRole("heading", { name: "Arcade", level: 1 });

    // Diamond Drop est seul dans « Hasard pur » et reste le sixième du catalogue.
    const hasard = screen.getByRole("region", { name: "Hasard pur" });
    expect(within(hasard).getByText(/^Jeu 06 ·/)).toBeInTheDocument();
  });

  it("un genre inconnu du client ne fait pas disparaître son jeu", async () => {
    arcade([...CATALOGUE, { ...CATALOGUE[0], id: "roulette", kind: "roue", name: "Roulette" }]);
    await screen.findByRole("heading", { name: "Arcade", level: 1 });

    const autres = screen.getByRole("region", { name: "Autres jeux" });
    expect(within(autres).getByRole("heading", { level: 3, name: "Roulette" })).toBeInTheDocument();
  });

  it("un groupe vide n'a pas de titre", async () => {
    arcade(CATALOGUE.filter((jeu) => jeu.kind === "ladder"));
    await screen.findByRole("heading", { name: "Arcade", level: 1 });

    expect(screen.getByRole("heading", { level: 2, name: "Monte et encaisse" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cartes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Autres jeux" })).not.toBeInTheDocument();
  });
});
