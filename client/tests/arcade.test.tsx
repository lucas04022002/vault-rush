import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { baseApi } from "./helpers/fake-api.ts";
import { renderApp } from "./helpers/render.tsx";

/**
 * L'arcade à SEPT jeux : son ordre, son étiquette, et le genre de chaque tuile.
 *
 * Trois défauts que ces tests verrouillent :
 *   - l'étiquette pluralisait `labels.step` au jugé et affichait
 *     « Jeu 05 · 1 lâchers » pour Diamond Drop (13/09). C'est désormais le jeu
 *     qui écrit son format (`config.format`), et l'arcade l'affiche TEL QUEL ;
 *   - les sept tuiles se suivaient en vrac (13/09). Elles sont rangées par
 *     genre, et un genre inconnu du client n'en fait pas disparaître une ;
 *   - une section par genre coupait la page (17/09). Sur sept jeux répartis
 *     4/1/1/1, trois sections n'avaient qu'une tuile et occupaient une ligne
 *     entière pour une seule carte. La grille est unique, le genre s'affiche
 *     sur la tuile — l'ordre et l'information sont conservés, pas la coupure.
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
  return renderApp("/");
}

/** Les titres des tuiles, dans l'ordre où la grille les pose. */
const titresAffichés = () =>
  screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

describe("arcade en une grille", () => {
  it("pose les sept jeux dans une seule grille, rangés par genre", async () => {
    arcade();
    await screen.findByRole("heading", { name: "Arcade", level: 1 });

    expect(titresAffichés()).toEqual([
      "Vault Rush",
      "Laser Grid",
      "Getaway",
      "Bomb Squad",
      "Vault Code",
      "Diamond Drop",
      "Blackjack Express",
    ]);
  });

  it("ne coupe plus la page en sections : une seule région, une seule grille", async () => {
    const { container } = arcade();
    await screen.findByRole("heading", { name: "Arcade", level: 1 });

    // Le défaut du 17/09 : quatre grilles, dont trois ne portaient qu'une tuile.
    expect(container.querySelectorAll(".arcade__grid")).toHaveLength(1);
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("chaque tuile porte son genre", async () => {
    arcade();
    await screen.findByRole("heading", { name: "Arcade", level: 1 });

    const genreDeLaTuile = (titre: string) => {
      const tuile = screen.getByRole("heading", { level: 3, name: titre }).closest(".gamecard");
      return tuile?.querySelector(".gamecard__genre")?.textContent;
    };

    expect(genreDeLaTuile("Vault Rush")).toBe("Monte et encaisse");
    expect(genreDeLaTuile("Vault Code")).toBe("Réflexion");
    expect(genreDeLaTuile("Diamond Drop")).toBe("Hasard pur");
    expect(genreDeLaTuile("Blackjack Express")).toBe("Cartes");
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

  it("le numéro d'un jeu est son rang dans le catalogue, pas dans la grille", async () => {
    arcade();
    await screen.findByRole("heading", { name: "Arcade", level: 1 });

    // Diamond Drop est sixième du catalogue et le reste, où qu'il tombe.
    const tuile = screen.getByRole("heading", { level: 3, name: "Diamond Drop" }).closest(".gamecard");
    expect(within(tuile as HTMLElement).getByText(/^Jeu 06 ·/)).toBeInTheDocument();
  });

  it("un genre inconnu du client ne fait pas disparaître son jeu : il passe en dernier", async () => {
    arcade([...CATALOGUE, { ...CATALOGUE[0], id: "roulette", kind: "roue", name: "Roulette" }]);
    await screen.findByRole("heading", { name: "Arcade", level: 1 });

    expect(titresAffichés().at(-1)).toBe("Roulette");

    const tuile = screen.getByRole("heading", { level: 3, name: "Roulette" }).closest(".gamecard");
    expect(tuile?.querySelector(".gamecard__genre")?.textContent).toBe("Autres jeux");
  });

  it("un catalogue partiel n'affiche que ses jeux", async () => {
    arcade(CATALOGUE.filter((jeu) => jeu.kind === "ladder"));
    await screen.findByRole("heading", { name: "Arcade", level: 1 });

    expect(titresAffichés()).toEqual(["Vault Rush", "Laser Grid", "Getaway", "Bomb Squad"]);
    expect(screen.queryByText("Cartes")).not.toBeInTheDocument();
    expect(screen.queryByText("Autres jeux")).not.toBeInTheDocument();
  });
});
