import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { baseApi } from "./helpers/fake-api.ts";
import { renderApp } from "./helpers/render.tsx";
import { heatOf } from "../src/games/heat.ts";
import { offsetAt } from "../src/games/drop.ts";

/**
 * L'écran de Diamond Drop, dans l'application réelle (routeur + session + hook).
 *
 * Les corps de réponse sont ceux du serveur, copiés de
 * `server/tests/diamond-drop.test.ts` : les tables ne sont jamais réinventées ici.
 */

const DOUX = [6.03, 2.13, 1.14, 0.8, 0.72, 0.8, 1.14, 2.13, 6.03];

const CONFIG = {
  id: "diamond-drop",
  kind: "drop",
  name: "Diamond Drop",
  tagline: "Lâche le diamant, laisse les clous décider.",
  canCashout: false,
  steps: 1,
  format: "8 à 16 rangées",
  maxPayoutCents: 1_000_000,
  minBetCents: 100,
  maxBetCents: 100_000,
  labels: {
    step: "lâcher",
    option: "case",
    safe: "case",
    danger: "case",
    cashout: "Lâcher le diamant",
  },
  modes: [
    {
      id: "doux",
      label: "Doux",
      rows: 8,
      alpha: 0.5,
      houseEdge: 0.02,
      slots: DOUX,
      chances: [
        0.00390625, 0.03125, 0.109375, 0.21875, 0.2734375, 0.21875, 0.109375, 0.03125, 0.00390625,
      ],
    },
    {
      id: "nerveux",
      label: "Nerveux",
      rows: 12,
      alpha: 0.65,
      houseEdge: 0.04,
      slots: [50.54, 10.05, 3.31, 1.51, 0.89, 0.65, 0.59, 0.65, 0.89, 1.51, 3.31, 10.05, 50.54],
      chances: [
        0.000244140625, 0.0029296875, 0.01611328125, 0.0537109375, 0.120849609375, 0.193359375,
        0.2255859375, 0.193359375, 0.120849609375, 0.0537109375, 0.01611328125, 0.0029296875,
        0.000244140625,
      ],
    },
  ],
};

/** Une partie lâchée ou non, mise 10,00 coins, mode Doux. */
function partie(extra: Record<string, unknown> = {}) {
  return {
    id: 7,
    game: "diamond-drop",
    mode: "doux",
    status: "playing",
    step: 0,
    maxSteps: 1,
    betCents: 1000,
    multiplier: 1,
    nextMultiplier: null,
    cashoutCents: 0,
    payoutCents: 0,
    view: {
      mode: "doux",
      rows: 8,
      slots: DOUX,
      dropped: false,
      path: null,
      slot: null,
      multiplier: null,
    },
    createdAt: "2026-09-13 12:00:00",
    ...extra,
  };
}

/** Le chemin « toujours à gauche » : case 0, ×6,03. */
const GAUCHE = [false, false, false, false, false, false, false, false];

function dropApi() {
  return baseApi()
    .on("GET /api/games/diamond-drop/config", { json: { game: CONFIG } })
    .on("GET /api/games/diamond-drop/current", { json: { round: null } });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Diamond Drop", () => {
  it("montre les cases et le mode avant de miser", async () => {
    dropApi().install();
    renderApp("/jeux/diamond-drop");

    expect(await screen.findByRole("heading", { name: "Diamond Drop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mode Doux" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mode Nerveux" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mise libre")).toBeInTheDocument();

    const bande = screen.getByRole("region", { name: "Multiplicateurs des cases" });
    expect(within(bande).getByLabelText("Case 1 : ×6,03")).toBeInTheDocument();
    expect(within(bande).getByLabelText("Case 5 : ×0,72")).toBeInTheDocument();
    // Aucun plateau tant qu'aucune partie n'est lancée.
    expect(screen.queryByRole("region", { name: "Plateau de clous" })).not.toBeInTheDocument();
  });

  it("propose le lâcher, et le plateau ne montre rien du chemin avant", async () => {
    dropApi().on("GET /api/games/diamond-drop/current", { json: { round: partie() } }).install();
    renderApp("/jeux/diamond-drop");

    expect(await screen.findByText("Partie en cours reprise.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Prêt à lâcher" })).toBeInTheDocument();

    const plateau = screen.getByRole("region", { name: "Plateau de clous" });
    expect(within(plateau).getByLabelText("Case 1 : ×6,03")).toBeInTheDocument();
    // Aucune case d'arrivée : rien du tirage n'est affiché.
    expect(within(plateau).queryByLabelText(/case d'arrivée/)).not.toBeInTheDocument();

    const bouton = screen.getByRole("button", { name: "Lâcher le diamant" });
    expect(bouton).toHaveAttribute("data-variant", "accent-gem");
  });

  it("lâche le diamant, l'anime rangée par rangée, puis affiche le bilan", async () => {
    const api = dropApi()
      .on("GET /api/games/diamond-drop/current", { json: { round: partie() } })
      .on("POST /api/games/diamond-drop/play", {
        json: {
          round: partie({
            status: "cashed_out",
            step: 1,
            multiplier: 6.03,
            payoutCents: 6030,
            cashoutCents: 6030,
            finishedAt: "2026-09-13 12:00:09",
            view: {
              mode: "doux",
              rows: 8,
              slots: DOUX,
              dropped: true,
              path: GAUCHE,
              slot: 0,
              multiplier: 6.03,
            },
          }),
          path: GAUCHE,
          slot: 0,
          multiplier: 6.03,
        },
      })
      .on("GET /api/wallet", { json: { balanceCents: 105_030 } });
    api.install();
    renderApp("/jeux/diamond-drop");

    await userEvent.click(await screen.findByRole("button", { name: "Lâcher le diamant" }));

    // Le corps du coup est l'enveloppe seule : le jeu n'ajoute aucun champ.
    await waitFor(() =>
      expect(api.callsTo("POST /api/games/diamond-drop/play")[0].body).toEqual({
        roundId: 7,
        step: 0,
      }),
    );

    // La chute dure 8 rangées × 90 ms : le bilan n'est pas là tout de suite.
    expect(screen.getByRole("heading", { name: "Le diamant tombe…" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Bilan de la partie" })).not.toBeInTheDocument();

    const bilan = await screen.findByRole("table", { name: "Bilan de la partie" }, {
      timeout: 4000,
    });
    expect(within(bilan).getByRole("row", { name: /^Mise\s.*10,00 coins$/ })).toBeInTheDocument();
    expect(within(bilan).getByRole("row", { name: /^Case\s.*1 sur 9$/ })).toBeInTheDocument();
    expect(
      within(bilan).getByRole("row", { name: /^Multiplicateur\s.*×6,03$/ }),
    ).toBeInTheDocument();
    expect(
      within(bilan).getByRole("row", { name: /^Récupéré\s.*60,30 coins$/ }),
    ).toBeInTheDocument();
    expect(within(bilan).getByRole("row", { name: /^Net\s.*\+50,30 coins$/ })).toBeInTheDocument();

    // La case d'arrivée s'allume, et elle seule.
    const plateau = screen.getByRole("region", { name: "Plateau de clous" });
    expect(within(plateau).getByLabelText("Case 1 : ×6,03 — case d'arrivée")).toBeInTheDocument();
    expect(within(plateau).getAllByLabelText(/case d'arrivée/)).toHaveLength(1);

    expect(
      screen.getByRole("button", { name: "Rejouer (même mise, même mode)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Changer la mise" })).toBeInTheDocument();
  });

  it("sous prefers-reduced-motion, le diamant apparaît directement dans sa case", async () => {
    // jsdom n'a pas matchMedia : on l'ajoute, en répondant « mouvement réduit ».
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );

    dropApi()
      .on("GET /api/games/diamond-drop/current", { json: { round: partie() } })
      .on("POST /api/games/diamond-drop/play", {
        json: {
          round: partie({
            status: "cashed_out",
            step: 1,
            multiplier: 0.72,
            payoutCents: 720,
            cashoutCents: 720,
            view: {
              mode: "doux",
              rows: 8,
              slots: DOUX,
              dropped: true,
              path: [true, false, true, false, true, false, true, false],
              slot: 4,
              multiplier: 0.72,
            },
          }),
          path: [true, false, true, false, true, false, true, false],
          slot: 4,
          multiplier: 0.72,
        },
      })
      .on("GET /api/wallet", { json: { balanceCents: 99_720 } })
      .install();
    renderApp("/jeux/diamond-drop");

    await userEvent.click(await screen.findByRole("button", { name: "Lâcher le diamant" }));

    // Aucune attente : le bilan est là au premier rendu qui suit la réponse.
    const bilan = await screen.findByRole("table", { name: "Bilan de la partie" }, { timeout: 300 });
    expect(within(bilan).getByRole("row", { name: /^Case\s.*5 sur 9$/ })).toBeInTheDocument();
    expect(within(bilan).getByRole("row", { name: /^Net\s.*−2,80 coins$/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Case 5 : ×0,72 — case d'arrivée")).toBeInTheDocument();
  });

  it("un lâcher en vol ne part pas deux fois", async () => {
    const api = dropApi()
      .on("GET /api/games/diamond-drop/current", { json: { round: partie() } })
      .on(
        "POST /api/games/diamond-drop/play",
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  json: {
                    round: partie({ status: "cashed_out", step: 1, multiplier: 6.03 }),
                    path: GAUCHE,
                    slot: 0,
                    multiplier: 6.03,
                  },
                }),
              50,
            );
          }),
      );
    api.install();
    renderApp("/jeux/diamond-drop");

    const bouton = await screen.findByRole("button", { name: "Lâcher le diamant" });
    await userEvent.click(bouton);
    // `pending` désactive le bouton : le second clic ne peut pas partir.
    expect(bouton).toBeDisabled();
    expect(api.callsTo("POST /api/games/diamond-drop/play").length).toBe(1);
  });

  it("les règles écrivent la table de chaque mode et le tirage côté serveur", async () => {
    dropApi().install();
    renderApp("/regles/diamond-drop");

    expect(
      await screen.findByRole("heading", { name: "Plus la case est rare, plus elle rapporte" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Le chemin est tiré avant la chute" }),
    ).toBeInTheDocument();

    const doux = screen.getByRole("region", { name: "Cases du mode Doux" });
    // La table est symétrique : ×6,03 aux deux bouts, ×0,72 au centre seulement.
    expect(within(doux).getAllByRole("cell", { name: "×6,03" })).toHaveLength(2);
    expect(within(doux).getByRole("cell", { name: "×0,72" })).toBeInTheDocument();
    expect(within(doux).getByRole("rowheader", { name: "Chance" })).toBeInTheDocument();

    const nerveux = screen.getByRole("region", { name: "Cases du mode Nerveux" });
    expect(within(nerveux).getAllByRole("cell", { name: "×50,54" })).toHaveLength(2);
    // Une case à 0,02 % s'écrit « < 1 % » et pas « 0 % ».
    expect(within(nerveux).getAllByRole("cell", { name: "< 1 %" }).length).toBeGreaterThan(0);
  });
});

describe("dérivations du plateau", () => {
  it("l'écart du diamant suit le chemin, une demi-case par rangée", () => {
    expect(offsetAt(null, 0)).toBe(0);
    expect(offsetAt(GAUCHE, 0)).toBe(0);
    expect(offsetAt(GAUCHE, 1)).toBe(-0.5);
    expect(offsetAt(GAUCHE, 8)).toBe(-4);
    expect(offsetAt([true, true, true, true, true, true, true, true], 8)).toBe(4);
    // Un chemin équilibré ramène le diamant au centre.
    expect(offsetAt([true, false, true, false, true, false, true, false], 8)).toBe(0);
    // L'écart final vaut toujours « case d'arrivée − centre ».
    const chemin = [true, true, false, true, false, false, true, false];
    const droites = chemin.filter(Boolean).length;
    expect(offsetAt(chemin, 8)).toBe(droites - 4);
  });

  it("les cases extrêmes sont les plus chaudes, le centre le plus froid", () => {
    expect(heatOf(0, 9)).toBe("chaud");
    expect(heatOf(8, 9)).toBe("chaud");
    expect(heatOf(1, 9)).toBe("tiede");
    expect(heatOf(4, 9)).toBe("froid");
    expect(heatOf(0, 17)).toBe("chaud");
    expect(heatOf(8, 17)).toBe("froid");
  });
});

describe("le mode Fou reste lisible sur un téléphone", () => {
  /*
   * Dix-sept cases ne tiennent pas sur 375 px : la bande défile dans sa zone,
   * et le ×604,39 des bords — la raison de jouer ce mode — n'était jamais à
   * l'écran. Deux blocs qui, eux, ne défilent pas, doivent le montrer.
   */

  // La vraie table du mode, copiée de `server/src/engine/drop.ts`.
  const FOU = [
    604.39, 75.54, 16.67, 5.25, 2.16, 1.12, 0.71, 0.54, 0.5, 0.54, 0.71, 1.12, 2.16, 5.25, 16.67,
    75.54, 604.39,
  ];

  const CONFIG_FOU = {
    ...CONFIG,
    modes: [
      {
        id: "fou",
        label: "Fou",
        rows: 16,
        alpha: 0.75,
        houseEdge: 0.06,
        slots: FOU,
        chances: FOU.map(() => 0.0588),
      },
    ],
  };

  function fouApi() {
    return baseApi()
      .on("GET /api/games/diamond-drop/config", { json: { game: CONFIG_FOU } })
      .on("GET /api/games/diamond-drop/current", { json: { round: null } });
  }

  it("annonce les bords et le milieu avant de miser, sans rien déplier", async () => {
    fouApi().install();
    renderApp("/jeux/diamond-drop");

    expect(await screen.findByRole("heading", { name: "Diamond Drop" })).toBeInTheDocument();
    const repères = screen.getByText(/Bords/).closest("p") as HTMLParagraphElement;
    expect(repères).toHaveTextContent("Bords ×604,39");
    expect(repères).toHaveTextContent("milieu ×0,50");
  });

  it("donne les dix-sept cases dans une liste verticale, repliée", async () => {
    fouApi().install();
    renderApp("/jeux/diamond-drop");

    const résumé = await screen.findByText("Toutes les cases (17)");
    const liste = résumé.closest("details") as HTMLDetailsElement;
    expect(liste.open).toBe(false);

    // Une LIGNE par case : aucune largeur d'écran ne peut la couper.
    expect(within(liste).getAllByRole("row")).toHaveLength(18); // 17 cases + l'entête
    expect(within(liste).getAllByRole("cell", { name: "×604,39" })).toHaveLength(2);
    expect(within(liste).getByRole("rowheader", { name: "9" })).toBeInTheDocument();
  });

  it("marque la case d'arrivée dans la liste, une fois le diamant posé", async () => {
    const chemin = Array.from({ length: 16 }, (_, i) => i < 3);
    const posée = {
      id: 9,
      game: "diamond-drop",
      mode: "fou",
      status: "cashed_out",
      step: 1,
      maxSteps: 1,
      betCents: 500,
      multiplier: 5.25,
      nextMultiplier: null,
      cashoutCents: 2625,
      payoutCents: 2625,
      createdAt: "2026-09-14 00:00:00",
      finishedAt: "2026-09-14 00:00:01",
      view: {
        mode: "fou",
        rows: 16,
        slots: FOU,
        dropped: true,
        path: chemin,
        slot: 3,
        multiplier: 5.25,
      },
    };

    fouApi()
      .on("GET /api/games/diamond-drop/current", {
        json: { round: { ...posée, status: "playing", step: 0, payoutCents: 0, view: { ...posée.view, dropped: false, path: null, slot: null, multiplier: null } } },
      })
      .on("POST /api/games/diamond-drop/play", {
        json: { round: posée, path: chemin, slot: 3, multiplier: 5.25 },
      })
      .on("GET /api/wallet", { json: { balanceCents: 102_625 } })
      .install();
    renderApp("/jeux/diamond-drop");

    await userEvent.click(await screen.findByRole("button", { name: "Lâcher le diamant" }));
    await screen.findByRole("table", { name: "Bilan de la partie" }, { timeout: 5000 });

    const résumé = screen.getByText("Toutes les cases (17)");
    const liste = résumé.closest("details") as HTMLDetailsElement;
    const arrivée = within(liste).getByRole("rowheader", { name: "4" }).closest("tr");
    expect(arrivée).toHaveAttribute("data-landed", "true");
    expect(arrivée).toHaveAttribute("aria-current", "true");
    // Une seule case marquée : celle où le diamant est tombé.
    expect(liste.querySelectorAll('tr[data-landed="true"]')).toHaveLength(1);
  });
});
