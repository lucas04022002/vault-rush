import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GameConfig, Outcome, Round } from "../src/api.ts";
import { LaserBoard, VaultBoard, boardFor } from "../src/games/boards/index.ts";
import { LASER_GRID_CONFIG, VAULT_RUSH_CONFIG } from "./helpers/fake-api.ts";

/**
 * Les plateaux : une identité par jeu (portes de coffre, grille laser) derrière
 * une interface commune. Ce qui est vérifié ici est ce qui casse en silence :
 * le nombre de cases cliquables, QUI est cliquable, le numéro remonté au hook,
 * et les libellés lus par un lecteur d'écran.
 */

const VAULT = VAULT_RUSH_CONFIG as unknown as GameConfig;
const LASER = LASER_GRID_CONFIG as unknown as GameConfig;

/** Une partie de Vault Rush en mode Risk (4 portes), à l'étage voulu. */
function vaultRound(step: number, extra: Partial<Round> = {}): Round {
  const multipliers = [1, 1.92, 3.84, 7.68, 15.36, 30.72, 61.44];
  return {
    id: 1,
    game: "vault-rush",
    mode: "risk",
    status: "playing",
    step,
    maxSteps: 6,
    betCents: 2500,
    multiplier: multipliers[step],
    nextMultiplier: step < 6 ? multipliers[step + 1] : null,
    cashoutCents: Math.round(2500 * multipliers[step]),
    payoutCents: 0,
    createdAt: "2026-09-13 10:00:00",
    ...extra,
  };
}

/** Une partie de Laser Grid en mode Tendu (4 cases par ligne), à la ligne voulue. */
function laserRound(step: number, extra: Partial<Round> = {}): Round {
  const multipliers = [1, 1.92, 3.84, 7.68, 15.36, 30.72, 61.44, 122.88, 245.76];
  return {
    id: 9,
    game: "laser-grid",
    mode: "tendu",
    status: "playing",
    step,
    maxSteps: 8,
    betCents: 2500,
    multiplier: multipliers[step],
    nextMultiplier: step < 8 ? multipliers[step + 1] : null,
    cashoutCents: Math.round(2500 * multipliers[step]),
    payoutCents: 0,
    createdAt: "2026-09-13 10:00:00",
    ...extra,
  };
}

describe("boardFor", () => {
  it("donne le plateau du jeu demandé", () => {
    expect(boardFor("vault-rush")).toBe(VaultBoard);
    expect(boardFor("laser-grid")).toBe(LaserBoard);
  });

  it("retombe sur les portes pour un jeu inconnu", () => {
    expect(boardFor("jeu-futur")).toBe(VaultBoard);
  });
});

describe("VaultBoard (portes de coffre)", () => {
  it("montre les étages et une porte par option du mode", () => {
    render(
      <VaultBoard config={VAULT} round={vaultRound(2)} pending={false} onPick={() => {}} />,
    );

    // La progression garde le nom accessible de l'ancienne frise.
    const étages = screen.getByRole("list", { name: "Étape 3 sur 6" });
    expect(within(étages).getAllByRole("listitem")).toHaveLength(6);

    const portes = screen.getByRole("group", { name: "Choisis une porte" });
    const boutons = within(portes).getAllByRole("button");
    expect(boutons).toHaveLength(4);
    for (const bouton of boutons) expect(bouton).toBeEnabled();
    expect(screen.getByRole("button", { name: "Porte 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Porte 4" })).toBeInTheDocument();
  });

  it("remonte le numéro de la porte cliquée, à partir de 1", async () => {
    const onPick = vi.fn();
    render(<VaultBoard config={VAULT} round={vaultRound(2)} pending={false} onPick={onPick} />);

    await userEvent.click(screen.getByRole("button", { name: "Porte 2" }));
    expect(onPick).toHaveBeenCalledWith(2);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("pendant une requête, aucune porte ne s'ouvre", async () => {
    const onPick = vi.fn();
    render(<VaultBoard config={VAULT} round={vaultRound(2)} pending onPick={onPick} />);

    const porte = screen.getByRole("button", { name: "Porte 3" });
    expect(porte).toBeDisabled();
    expect(porte).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(porte);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("révèle coffres et alarme sur les bonnes portes", () => {
    const revealed: Outcome[] = ["danger", "safe", "safe", "danger"];
    render(
      <VaultBoard
        config={VAULT}
        round={vaultRound(2, { status: "lost", cashoutCents: 0, nextMultiplier: null })}
        revealed={revealed}
        pending={false}
        onPick={() => {}}
      />,
    );

    const piégée = screen.getByRole("button", { name: "Porte 1 — alarme" });
    expect(piégée).toHaveAttribute("data-reveal", "danger");
    const sûre = screen.getByRole("button", { name: "Porte 2 — coffre" });
    expect(sûre).toHaveAttribute("data-reveal", "safe");
    // Plus rien n'est cliquable une fois la partie finie.
    expect(piégée).toBeDisabled();
    expect(sûre).toBeDisabled();
  });
});

describe("LaserBoard (grille laser)", () => {
  it("montre les 8 lignes d'un coup, seule la ligne courante étant cliquable", () => {
    render(<LaserBoard config={LASER} round={laserRound(2)} pending={false} onPick={() => {}} />);

    const lignes = screen.getByRole("list", { name: "Étape 3 sur 8" });
    expect(within(lignes).getAllByRole("listitem")).toHaveLength(8);

    const toutes = screen.getAllByRole("button");
    expect(toutes).toHaveLength(32);
    expect(toutes.filter((b) => !b.hasAttribute("disabled"))).toHaveLength(4);
    expect(toutes.filter((b) => b.hasAttribute("disabled"))).toHaveLength(28);

    const courante = screen.getByRole("group", { name: "Choisis une case" });
    expect(within(courante).getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Case 3, ligne 3" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Case 3, ligne 4" })).toBeDisabled();
  });

  it("affiche le compteur de ligne et les multiplicateurs", () => {
    render(<LaserBoard config={LASER} round={laserRound(2)} pending={false} onPick={() => {}} />);

    expect(screen.getByText("Ligne 3 / 8")).toBeInTheDocument();
    expect(screen.getByText("×3,84 → ×7,68")).toBeInTheDocument();
  });

  it("remonte le numéro de la case cliquée, à partir de 1", async () => {
    const onPick = vi.fn();
    render(<LaserBoard config={LASER} round={laserRound(2)} pending={false} onPick={onPick} />);

    await userEvent.click(screen.getByRole("button", { name: "Case 3, ligne 3" }));
    expect(onPick).toHaveBeenCalledWith(3);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("pendant une requête, aucune case ne part", async () => {
    const onPick = vi.fn();
    render(<LaserBoard config={LASER} round={laserRound(2)} pending onPick={onPick} />);

    const case3 = screen.getByRole("button", { name: "Case 3, ligne 3" });
    expect(case3).toBeDisabled();
    expect(case3).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(case3);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("révèle passages et laser sur la ligne jouée", () => {
    const revealed: Outcome[] = ["safe", "danger", "safe", "safe"];
    render(
      <LaserBoard
        config={LASER}
        round={laserRound(2, { status: "lost", cashoutCents: 0, nextMultiplier: null })}
        revealed={revealed}
        pending={false}
        onPick={() => {}}
      />,
    );

    const laser = screen.getByRole("button", { name: "Case 2, ligne 3 — laser" });
    expect(laser).toHaveAttribute("data-reveal", "danger");
    const passage = screen.getByRole("button", { name: "Case 1, ligne 3 — passage" });
    expect(passage).toHaveAttribute("data-reveal", "safe");
    expect(screen.getAllByRole("button").filter((b) => !b.hasAttribute("disabled"))).toHaveLength(
      0,
    );
  });
});
