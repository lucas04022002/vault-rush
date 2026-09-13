import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GameConfig, Outcome, Round } from "../src/api.ts";
import {
  BombBoard,
  GetawayBoard,
  LaserBoard,
  VaultBoard,
  accentFor,
  boardFor,
} from "../src/games/boards/index.ts";
import {
  BOMB_SQUAD_CONFIG,
  GETAWAY_CONFIG,
  LASER_GRID_CONFIG,
  VAULT_RUSH_CONFIG,
} from "./helpers/fake-api.ts";

/**
 * Les plateaux : une identité par jeu (portes de coffre, grille laser) derrière
 * une interface commune. Ce qui est vérifié ici est ce qui casse en silence :
 * le nombre de cases cliquables, QUI est cliquable, le numéro remonté au hook,
 * et les libellés lus par un lecteur d'écran.
 */

const VAULT = VAULT_RUSH_CONFIG as unknown as GameConfig;
const LASER = LASER_GRID_CONFIG as unknown as GameConfig;
const GETAWAY = GETAWAY_CONFIG as unknown as GameConfig;
const BOMB = BOMB_SQUAD_CONFIG as unknown as GameConfig;

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
    expect(boardFor("getaway")).toBe(GetawayBoard);
    expect(boardFor("bomb-squad")).toBe(BombBoard);
  });

  it("retombe sur les portes pour un jeu inconnu", () => {
    expect(boardFor("jeu-futur")).toBe(VaultBoard);
  });
});

describe("accentFor", () => {
  it("donne une couleur par jeu, jamais deux fois la même", () => {
    expect(accentFor("vault-rush")).toBe("yellow");
    expect(accentFor("laser-grid")).toBe("cyan");
    expect(accentFor("getaway")).toBe("magenta");
    expect(accentFor("bomb-squad")).toBe("orange");
    const couleurs = ["vault-rush", "laser-grid", "getaway", "bomb-squad"].map(accentFor);
    expect(new Set(couleurs).size).toBe(4);
  });

  it("retombe sur le jaune pour un jeu inconnu", () => {
    expect(accentFor("jeu-futur")).toBe("yellow");
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
    // Les portes révélées s'ouvrent : le battant pivote et l'intérieur porte le mot.
    expect(piégée).toHaveAttribute("data-open", "true");
    expect(sûre).toHaveAttribute("data-open", "true");
    expect(sûre.querySelector(".vb-door__word")?.textContent).toBe("coffre");
    expect(piégée.querySelector(".vb-door__word")?.textContent).toBe("alarme");
    // Une porte non révélée reste fermée.
    const { unmount } = render(
      <VaultBoard config={VAULT} round={vaultRound(2)} pending={false} onPick={() => {}} />,
    );
    expect(screen.getAllByRole("button", { name: "Porte 1" })[0]).not.toHaveAttribute("data-open");
    unmount();
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

/** Une partie de Getaway en mode Cavale (4 routes), au tronçon voulu. */
function getawayRound(step: number, extra: Partial<Round> = {}): Round {
  const multipliers = [1, 1.88, 3.76, 7.52, 15.04, 30.08];
  return {
    id: 21,
    game: "getaway",
    mode: "cavale",
    status: "playing",
    step,
    maxSteps: 5,
    betCents: 2500,
    multiplier: multipliers[step],
    nextMultiplier: step < 5 ? multipliers[step + 1] : null,
    cashoutCents: Math.round(2500 * multipliers[step]),
    payoutCents: 0,
    createdAt: "2026-09-13 10:00:00",
    ...extra,
  };
}

/** Une partie de Bomb Squad en mode Confirmé (4 câbles), à l'étape voulue. */
function bombRound(step: number, extra: Partial<Round> = {}): Round {
  const multipliers = [1, 1.92, 3.84, 7.68, 15.36];
  return {
    id: 34,
    game: "bomb-squad",
    mode: "confirme",
    status: "playing",
    step,
    maxSteps: 4,
    betCents: 2500,
    multiplier: multipliers[step],
    nextMultiplier: step < 4 ? multipliers[step + 1] : null,
    cashoutCents: Math.round(2500 * multipliers[step]),
    payoutCents: 0,
    createdAt: "2026-09-13 10:00:00",
    ...extra,
  };
}

describe("GetawayBoard (la route qui défile)", () => {
  it("montre les tronçons et un panneau par route du mode", () => {
    render(
      <GetawayBoard config={GETAWAY} round={getawayRound(2)} pending={false} onPick={() => {}} />,
    );

    const tronçons = screen.getByRole("list", { name: "Étape 3 sur 5" });
    expect(within(tronçons).getAllByRole("listitem")).toHaveLength(5);

    const panneaux = screen.getByRole("group", { name: "Choisis une route" });
    const boutons = within(panneaux).getAllByRole("button");
    expect(boutons).toHaveLength(4);
    for (const bouton of boutons) expect(bouton).toBeEnabled();
    expect(screen.getByRole("button", { name: "Route 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Route 4" })).toBeInTheDocument();
  });

  it("pose la voiture sur le tronçon courant, un seul à la fois", () => {
    const { container } = render(
      <GetawayBoard config={GETAWAY} round={getawayRound(2)} pending={false} onPick={() => {}} />,
    );

    expect(container.querySelectorAll(".gb-seg__car")).toHaveLength(1);
    const tronçons = screen.getAllByRole("listitem");
    expect(tronçons[2].querySelector(".gb-seg__car")).not.toBeNull();
    expect(tronçons[2]).toHaveAttribute("data-state", "now");
    expect(tronçons[0]).toHaveAttribute("data-state", "done");
    expect(tronçons[4]).toHaveAttribute("data-state", "todo");
  });

  it("la jauge de poursuite monte d'un cran par tronçon franchi", () => {
    const { rerender, container } = render(
      <GetawayBoard config={GETAWAY} round={getawayRound(0)} pending={false} onPick={() => {}} />,
    );
    expect(screen.getByText("Poursuite 0 / 5")).toBeInTheDocument();
    expect(container.querySelectorAll('.gb-chase__pip[data-on="true"]')).toHaveLength(0);

    rerender(
      <GetawayBoard config={GETAWAY} round={getawayRound(3)} pending={false} onPick={() => {}} />,
    );
    expect(screen.getByText("Poursuite 3 / 5")).toBeInTheDocument();
    expect(container.querySelectorAll('.gb-chase__pip[data-on="true"]')).toHaveLength(3);
    expect(container.querySelector(".gb-chase")).not.toHaveAttribute("data-close");

    // Sur le dernier tronçon, la police est sur le pare-chocs : la jauge passe au rouge.
    rerender(
      <GetawayBoard config={GETAWAY} round={getawayRound(4)} pending={false} onPick={() => {}} />,
    );
    expect(container.querySelectorAll('.gb-chase__pip[data-on="true"]')).toHaveLength(4);
    expect(container.querySelector(".gb-chase")).toHaveAttribute("data-close", "true");

    rerender(
      <GetawayBoard
        config={GETAWAY}
        round={getawayRound(5, { status: "cashed_out", nextMultiplier: null })}
        pending={false}
        onPick={() => {}}
      />,
    );
    expect(container.querySelectorAll('.gb-chase__pip[data-on="true"]')).toHaveLength(5);
  });

  it("remonte le numéro de la route cliquée, à partir de 1", async () => {
    const onPick = vi.fn();
    render(
      <GetawayBoard config={GETAWAY} round={getawayRound(2)} pending={false} onPick={onPick} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Route 3" }));
    expect(onPick).toHaveBeenCalledWith(3);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("pendant une requête, aucune route ne part", async () => {
    const onPick = vi.fn();
    render(<GetawayBoard config={GETAWAY} round={getawayRound(2)} pending onPick={onPick} />);

    const route = screen.getByRole("button", { name: "Route 2" });
    expect(route).toBeDisabled();
    expect(route).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(route);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("révèle voie libre et barrage sur les bons panneaux", () => {
    const revealed: Outcome[] = ["danger", "safe", "safe", "danger"];
    render(
      <GetawayBoard
        config={GETAWAY}
        round={getawayRound(2, { status: "lost", cashoutCents: 0, nextMultiplier: null })}
        revealed={revealed}
        pending={false}
        onPick={() => {}}
      />,
    );

    const barrage = screen.getByRole("button", { name: "Route 1 — barrage" });
    expect(barrage).toHaveAttribute("data-reveal", "danger");
    const libre = screen.getByRole("button", { name: "Route 2 — voie libre" });
    expect(libre).toHaveAttribute("data-reveal", "safe");
    // Plus rien n'est cliquable une fois la partie finie.
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeDisabled();
    // Le tronçon perdu est marqué comme tel.
    expect(screen.getAllByRole("listitem")[2]).toHaveAttribute("data-state", "lost");
  });
});

describe("BombBoard (le boîtier)", () => {
  it("montre les étapes et un câble par option du mode", () => {
    render(<BombBoard config={BOMB} round={bombRound(1)} pending={false} onPick={() => {}} />);

    const étapes = screen.getByRole("list", { name: "Étape 2 sur 4" });
    expect(within(étapes).getAllByRole("listitem")).toHaveLength(4);

    const câbles = screen.getByRole("group", { name: "Choisis un câble" });
    const boutons = within(câbles).getAllByRole("button");
    expect(boutons).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Câble 1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Câble 4" })).toBeEnabled();
  });

  it("l'afficheur décompte les étapes restantes, sur deux chiffres", () => {
    const { rerender } = render(
      <BombBoard config={BOMB} round={bombRound(1)} pending={false} onPick={() => {}} />,
    );
    // 4 étapes, 1 franchie : il en reste 3.
    expect(screen.getByLabelText("Reste 3 étapes")).toHaveAttribute("data-value", "03");

    rerender(<BombBoard config={BOMB} round={bombRound(3)} pending={false} onPick={() => {}} />);
    expect(screen.getByLabelText("Reste 1 étape")).toHaveAttribute("data-value", "01");

    rerender(
      <BombBoard
        config={BOMB}
        round={bombRound(4, { status: "cashed_out", nextMultiplier: null })}
        pending={false}
        onPick={() => {}}
      />,
    );
    expect(screen.getByLabelText("Reste 0 étape")).toHaveAttribute("data-value", "00");
  });

  it("la couleur des gaines ne dépend pas du contenu : elle suit le rang", () => {
    const { container } = render(
      <BombBoard config={BOMB} round={bombRound(1)} pending={false} onPick={() => {}} />,
    );
    const gaines = [...container.querySelectorAll(".bb-cable")].map((c) =>
      c.getAttribute("data-gaine"),
    );
    expect(gaines).toEqual(["cyan", "magenta", "yellow", "orange"]);
  });

  it("remonte le numéro du câble coupé, à partir de 1", async () => {
    const onPick = vi.fn();
    render(<BombBoard config={BOMB} round={bombRound(1)} pending={false} onPick={onPick} />);

    await userEvent.click(screen.getByRole("button", { name: "Câble 2" }));
    expect(onPick).toHaveBeenCalledWith(2);
    expect(onPick).toHaveBeenCalledTimes(1);
    // Le câble choisi est sectionné à l'écran, tout de suite.
    expect(screen.getByRole("button", { name: "Câble 2" })).toHaveAttribute("data-cut", "true");
  });

  it("pendant une requête, aucun câble ne se coupe", async () => {
    const onPick = vi.fn();
    render(<BombBoard config={BOMB} round={bombRound(1)} pending onPick={onPick} />);

    const câble = screen.getByRole("button", { name: "Câble 3" });
    expect(câble).toBeDisabled();
    expect(câble).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(câble);
    expect(onPick).not.toHaveBeenCalled();
    expect(câble).not.toHaveAttribute("data-cut");
  });

  it("révèle neutralisé et explosion, et fait flasher le boîtier à la perte", () => {
    const revealed: Outcome[] = ["safe", "danger", "safe", "safe"];
    const { container } = render(
      <BombBoard
        config={BOMB}
        round={bombRound(1, { status: "lost", cashoutCents: 0, nextMultiplier: null })}
        revealed={revealed}
        pending={false}
        onPick={() => {}}
      />,
    );

    const explosif = screen.getByRole("button", { name: "Câble 2 — explosion" });
    expect(explosif).toHaveAttribute("data-reveal", "danger");
    const neutralisé = screen.getByRole("button", { name: "Câble 1 — neutralisé" });
    expect(neutralisé).toHaveAttribute("data-reveal", "safe");
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeDisabled();
    expect(container.querySelector(".bb-case")).toHaveAttribute("data-blast", "true");
    // L'étincelle est réservée à la partie perdue (CSS) : le marqueur est ici.
    expect(container.querySelector(".bb-cables")).toHaveAttribute("data-lost", "true");
  });

  it("une étape survécue révèle les câbles piégés sans les faire exploser", () => {
    const revealed: Outcome[] = ["danger", "safe", "safe", "danger"];
    const { container } = render(
      <BombBoard config={BOMB} round={bombRound(2)} revealed={revealed} pending={false} onPick={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "Câble 1 — explosion" })).toBeInTheDocument();
    expect(container.querySelector(".bb-cables")).not.toHaveAttribute("data-lost");
    expect(container.querySelector(".bb-case")).not.toHaveAttribute("data-blast");
  });
});
