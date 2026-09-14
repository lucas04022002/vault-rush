import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { baseApi } from "./helpers/fake-api.ts";
import { renderApp } from "./helpers/render.tsx";

/**
 * L'écran de Blackjack Express, dans l'application réelle (routeur, session,
 * `useRound`). Le faux réseau décrit le SERVEUR : les corps ci-dessous sont
 * ceux que rend vraiment `engine/blackjack.ts`.
 */

const BJ = "blackjack-express";

const CONFIG = {
  id: BJ,
  kind: "cards",
  name: "Blackjack Express",
  tagline: "Tire ou reste, bats le croupier sans dépasser 21.",
  canCashout: false,
  steps: 10,
  format: "contre le croupier",
  maxPayoutCents: 1_000_000,
  minBetCents: 100,
  maxBetCents: 100_000,
  modes: [{ id: "express", label: "Express" }],
  labels: { step: "coup", option: "carte", safe: "gagné", danger: "perdu", cashout: "Rester" },
  gains: [
    { id: "blackjack", label: "Blackjack", multiplier: 2.5, detail: "21 en deux cartes" },
    { id: "gagne", label: "Gagné", multiplier: 2, detail: "ton total bat le sien" },
    { id: "egalite", label: "Égalité", multiplier: 1, detail: "mise rendue" },
    { id: "perdu", label: "Perdu", multiplier: 0, detail: "il te bat, ou tu dépasses 21" },
  ],
  valeurs: "Les figures valent 10, l'as vaut 11 tant que la main ne dépasse pas 21, sinon 1.",
  regleCroupier: "Le croupier tire jusqu'à 17 inclus, puis il reste — même sur un 17 souple.",
  regleSabot: "Un jeu de 52 cartes neuf, mélangé à chaque manche.",
};

const ROI = { rang: "R", enseigne: "coeur" };
const SEPT = { rang: "7", enseigne: "pique" };
const NEUF = { rang: "9", enseigne: "trefle" };
const DAME = { rang: "D", enseigne: "carreau" };
const QUATRE = { rang: "4", enseigne: "pique" };

/** Une manche en cours : deux cartes visibles, une seule pour le croupier. */
function enCours(extra: Record<string, unknown> = {}) {
  return {
    id: 7,
    game: BJ,
    mode: "express",
    status: "playing",
    step: 0,
    maxSteps: 10,
    betCents: 2500,
    multiplier: 0,
    nextMultiplier: null,
    cashoutCents: 0,
    payoutCents: 0,
    view: {
      fini: false,
      joueur: { cartes: [ROI, SEPT], total: 17, texte: "17", brulee: false },
      croupier: { visible: NEUF, cartes: null, total: null, texte: null },
      peutTirer: true,
      issue: null,
      coups: 0,
    },
    createdAt: "2026-09-13 21:10:00",
    ...extra,
  };
}

/** La même manche, finie : le croupier s'est découvert. */
function finie(extra: Record<string, unknown> = {}) {
  return {
    ...enCours(),
    status: "cashed_out",
    step: 1,
    multiplier: 2,
    payoutCents: 5000,
    view: {
      fini: true,
      joueur: { cartes: [ROI, SEPT], total: 17, texte: "17", brulee: false },
      croupier: { visible: NEUF, cartes: [NEUF, QUATRE], total: 13, texte: "13" },
      peutTirer: false,
      issue: "gagne",
      coups: 1,
    },
    finishedAt: "2026-09-13 21:10:20",
    ...extra,
  };
}

function api(current: unknown = null) {
  return baseApi()
    .on(`GET /api/games/${BJ}/config`, { json: { game: CONFIG } })
    .on(`GET /api/games/${BJ}/current`, { json: { round: current } });
}

describe("écran Blackjack Express", () => {
  it("montre le tableau des gains avant la donne", async () => {
    api().install();
    renderApp(`/jeux/${BJ}`);

    const gains = await screen.findByRole("region", { name: "Gains" });
    expect(within(gains).getByRole("rowheader", { name: /Blackjack/ })).toBeInTheDocument();
    expect(within(gains).getByText("×2,50")).toBeInTheDocument();
    expect(within(gains).getByText(/52 cartes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Distribuer les cartes/ })).toBeInTheDocument();
    // Pas de table tant qu'aucune carte n'est distribuée.
    expect(screen.queryByRole("img", { name: /Tes cartes/ })).not.toBeInTheDocument();
  });

  it("en manche : les deux mains, les totaux et les deux boutons", async () => {
    api(enCours()).install();
    renderApp(`/jeux/${BJ}`);

    expect(await screen.findByText("Manche en cours reprise.")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Tes cartes : roi de cœur, 7 de pique, total 17" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Cartes du croupier : 9 de trèfle, et une carte cachée" }),
    ).toBeInTheDocument();

    const table = screen.getByRole("region", { name: "Manche en cours" });
    expect(within(table).getByText("17")).toBeInTheDocument();
    // Le total du croupier reste inconnu tant qu'il ne s'est pas découvert.
    expect(within(table).getByText("?")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Tirer une carte" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Rester" })).toBeEnabled();
  });

  it("la carte cachée est dessinée sans rien montrer", async () => {
    api(enCours()).install();
    const { container } = renderApp(`/jeux/${BJ}`);

    await screen.findByRole("img", { name: /Tes cartes/ });
    const dos = container.querySelectorAll('[data-face="dos"]');
    expect(dos).toHaveLength(1);
    // Ni rang, ni enseigne : le dos ne porte aucun texte.
    expect(dos[0].textContent).toBe("");
    // Deux cartes du joueur, une seule du croupier : rien ne fuit à l'écran.
    expect(container.querySelectorAll('[data-face="avant"]')).toHaveLength(3);
  });

  it("« Tirer » envoie le coup et pose la carte reçue", async () => {
    const tiree = { rang: "4", enseigne: "pique" };
    const reseau = api(enCours()).on(`POST /api/games/${BJ}/play`, {
      json: {
        round: enCours({
          step: 1,
          view: {
            fini: false,
            joueur: { cartes: [ROI, SEPT, tiree], total: 21, texte: "21", brulee: false },
            croupier: { visible: NEUF, cartes: null, total: null, texte: null },
            peutTirer: false,
            issue: null,
            coups: 1,
          },
        }),
        tiree,
        issue: null,
      },
    });
    reseau.install();
    renderApp(`/jeux/${BJ}`);

    await userEvent.click(await screen.findByRole("button", { name: "Tirer une carte" }));

    await waitFor(() =>
      expect(reseau.callsTo(`POST /api/games/${BJ}/play`)[0].body).toEqual({
        roundId: 7,
        step: 0,
        move: "hit",
      }),
    );
    expect(
      await screen.findByRole("img", {
        name: "Tes cartes : roi de cœur, 7 de pique, 4 de pique, total 21",
      }),
    ).toBeInTheDocument();
    // À 21 on ne tire plus : le bouton se ferme de lui-même.
    expect(screen.getByRole("button", { name: "Tirer une carte" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rester" })).toBeEnabled();
  });

  it("« Rester » découvre le croupier, annonce l'issue et donne le bilan", async () => {
    const reseau = api(enCours())
      .on(`POST /api/games/${BJ}/play`, {
        json: { round: finie(), tiree: null, issue: "gagne" },
      })
      .on("GET /api/wallet", { json: { balanceCents: 102_500 } });
    reseau.install();
    renderApp(`/jeux/${BJ}`);

    await userEvent.click(await screen.findByRole("button", { name: "Rester" }));

    await waitFor(() =>
      expect(reseau.callsTo(`POST /api/games/${BJ}/play`)[0].body).toEqual({
        roundId: 7,
        step: 0,
        move: "stand",
      }),
    );

    expect(
      await screen.findByRole("img", {
        name: "Cartes du croupier : 9 de trèfle, 4 de pique, total 13",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Gagné").length).toBeGreaterThan(0);

    const bilan = await screen.findByRole("table", { name: "Bilan de la manche" });
    expect(within(bilan).getByRole("row", { name: /^Mise\s.*25,00 coins$/ })).toBeInTheDocument();
    expect(
      within(bilan).getByRole("row", { name: /^Récupéré\s.*50,00 coins$/ }),
    ).toBeInTheDocument();
    expect(within(bilan).getByRole("row", { name: /^Net\s.*\+25,00 coins$/ })).toBeInTheDocument();
    expect(
      within(bilan).getByRole("row", { name: /^Multiplicateur\s.*×2,00$/ }),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Rejouer (même mise)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Changer la mise" })).toBeInTheDocument();
    // Plus aucun coup à jouer.
    expect(screen.queryByRole("button", { name: "Tirer une carte" })).not.toBeInTheDocument();
  });

  it("un blackjack naturel s'annonce comme tel", async () => {
    const as = { rang: "A", enseigne: "pique" };
    api(
      finie({
        multiplier: 2.5,
        payoutCents: 6250,
        view: {
          fini: true,
          joueur: { cartes: [as, ROI], total: 21, texte: "21", brulee: false },
          croupier: { visible: NEUF, cartes: [NEUF, DAME], total: 19, texte: "19" },
          peutTirer: false,
          issue: "blackjack",
          coups: 1,
        },
      }),
    ).install();
    renderApp(`/jeux/${BJ}`);

    expect(await screen.findByText("Blackjack !")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Tes cartes : as de pique, roi de cœur, total 21" }),
    ).toBeInTheDocument();
  });

  it("une main dépassée le dit à voix haute", async () => {
    const dix = { rang: "10", enseigne: "carreau" };
    api(
      finie({
        status: "lost",
        multiplier: 0,
        payoutCents: 0,
        view: {
          fini: true,
          joueur: { cartes: [ROI, SEPT, dix], total: 27, texte: "27", brulee: true },
          croupier: { visible: NEUF, cartes: [NEUF, DAME], total: 19, texte: "19" },
          peutTirer: false,
          issue: "perdu",
          coups: 1,
        },
      }),
    ).install();
    renderApp(`/jeux/${BJ}`);

    expect(
      await screen.findByRole("img", {
        name: "Tes cartes : roi de cœur, 7 de pique, 10 de carreau, total 27, dépassé",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Perdu").length).toBeGreaterThan(0);
    // Le dépassement est ÉCRIT, pas seulement coloré.
    expect(screen.getByText("27 · dépassé")).toBeInTheDocument();
  });

  it("le total souple se lit dans ses deux valeurs", async () => {
    const as = { rang: "A", enseigne: "pique" };
    const six = { rang: "6", enseigne: "coeur" };
    api(
      enCours({
        view: {
          fini: false,
          joueur: { cartes: [as, six], total: 17, texte: "7 ou 17", brulee: false },
          croupier: { visible: NEUF, cartes: null, total: null, texte: null },
          peutTirer: true,
          issue: null,
          coups: 0,
        },
      }),
    ).install();
    renderApp(`/jeux/${BJ}`);

    expect(await screen.findByText("7 ou 17")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Tes cartes : as de pique, 6 de cœur, total 7 ou 17" }),
    ).toBeInTheDocument();
  });

  it("les règles disent la valeur des cartes, le croupier, les gains et le mélange", async () => {
    api().install();
    renderApp(`/regles/${BJ}`);

    expect(await screen.findByRole("heading", { name: "Blackjack Express" })).toBeInTheDocument();
    expect(screen.getByText(/l'as vaut 11/)).toBeInTheDocument();
    expect(screen.getByText(/tire jusqu'à 17 inclus/)).toBeInTheDocument();
    expect(screen.getByText(/mélangé à chaque manche/)).toBeInTheDocument();

    const gains = await screen.findByRole("table", { name: /Gains, en multiple de la mise/ });
    expect(within(gains).getByText("×2,50")).toBeInTheDocument();
    expect(within(gains).getByText("×0,00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jouer à Blackjack Express" })).toBeInTheDocument();
  });
});
