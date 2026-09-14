import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { baseApi, round } from "./helpers/fake-api.ts";
import { renderApp } from "./helpers/render.tsx";

/** L'écran de jeu, dans l'application réelle (routeur + session + hook). */

describe("écran de jeu", () => {
  it("montre le tableau des récompenses avant de miser", async () => {
    baseApi().on("GET /api/games/vault-rush/current", { json: { round: null } }).install();
    renderApp("/jeux/vault-rush");

    const table = await screen.findByRole("region", { name: "Tableau des récompenses" });
    expect(within(table).getByRole("rowheader", { name: "Risk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mode Risk" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mise libre")).toBeInTheDocument();
    expect(screen.getByText(/Entre 1,00 et 1\s?000,00 coins/)).toBeInTheDocument();
    // Pas d'options tant qu'aucune partie n'est lancée.
    expect(screen.queryByRole("group", { name: /Choisis une porte/i })).not.toBeInTheDocument();
  });

  it("montre la progression, les options et le bouton d'encaissement en jeu", async () => {
    baseApi().on("GET /api/games/vault-rush/current", { json: { round: round(2) } }).install();
    renderApp("/jeux/vault-rush");

    expect(await screen.findByText("Partie en cours reprise.")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Étape 3 sur 6" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Choisis une porte" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Encaisser 96,00 coins/ })).toBeInTheDocument();

    const résumé = screen.getByText(/si tu passes/);
    expect(résumé).toHaveTextContent(/Mise\s+25,00 coins/);
    expect(résumé).toHaveTextContent(/192,00 coins/);
  });

  it("un encaissement déjà passé s'affiche en information, pas en rouge", async () => {
    // 409 `round_not_active` adopté : le gain est acquis, rien n'a échoué pour le joueur.
    baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: round(2) } })
      .on("POST /api/games/vault-rush/cashout", {
        status: 409,
        json: {
          error: "round_not_active",
          round: round(2, { status: "cashed_out", payoutCents: 9600, cashoutCents: 9600 }),
        },
      })
      .on("GET /api/wallet", { json: { balanceCents: 107_100 } })
      .install();
    renderApp("/jeux/vault-rush");

    await userEvent.click(await screen.findByRole("button", { name: /Encaisser/ }));

    const info = await screen.findByText("Cette partie était déjà terminée.");
    expect(info).toHaveAttribute("data-kind", "info");
    expect(screen.queryByText("Cette partie est terminée.")).not.toBeInTheDocument();
  });

  it("affiche le bilan complet après une alarme", async () => {
    baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: round(2) } })
      .on("POST /api/games/vault-rush/play", {
        json: {
          round: round(2, {
            status: "lost",
            payoutCents: 0,
            cashoutCents: 0,
            nextMultiplier: null,
          }),
          revealed: ["danger", "safe", "safe", "danger"],
          outcome: "danger",
        },
      })
      .on("GET /api/wallet", { json: { balanceCents: 97_500 } })
      .install();
    renderApp("/jeux/vault-rush");

    const porte = await screen.findByRole("button", { name: "Porte 1" });
    await userEvent.click(porte);

    const bilan = await screen.findByRole("table", { name: "Bilan de la partie" });
    expect(within(bilan).getByRole("row", { name: /^Mise\s.*25,00 coins$/ })).toBeInTheDocument();
    expect(
      within(bilan).getByRole("row", { name: /^Récupéré\s.*0,00 coins$/ }),
    ).toBeInTheDocument();
    expect(within(bilan).getByRole("row", { name: /^Net\s.*−25,00 coins$/ })).toBeInTheDocument();
    expect(
      within(bilan).getByRole("row", { name: /^Nouveau solde\s.*975,00 coins$/ }),
    ).toBeInTheDocument();
    expect(
      within(bilan).getByRole("row", { name: /^Étape atteinte\s.*2 sur 6$/ }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Rejouer (même mise, même mode)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Changer la mise" })).toBeInTheDocument();
  });

  it("démarre une partie depuis les raccourcis de mise", async () => {
    const api = baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: null } })
      .on("POST /api/games/vault-rush/start", { status: 201, json: { round: round(0) } });
    api.install();
    renderApp("/jeux/vault-rush");

    await userEvent.click(await screen.findByRole("button", { name: "Mise 25,00 coins" }));
    await userEvent.click(screen.getByRole("button", { name: "Mode Risk" }));
    await userEvent.click(screen.getByRole("button", { name: /Lancer la partie/ }));

    await waitFor(() =>
      expect(api.callsTo("POST /api/games/vault-rush/start")[0].body).toEqual({
        betCoins: "25,00",
        mode: "risk",
      }),
    );
    expect(await screen.findByRole("group", { name: "Choisis une porte" })).toBeInTheDocument();
  });

  it("Laser Grid utilise le même écran avec son propre vocabulaire", async () => {
    baseApi()
      .on("GET /api/games/laser-grid/current", {
        json: {
          round: {
            id: 9,
            game: "laser-grid",
            mode: "calme",
            status: "playing",
            step: 1,
            maxSteps: 8,
            betCents: 1250,
            multiplier: 1.31,
            nextMultiplier: 1.74,
            cashoutCents: 1638,
            payoutCents: 0,
            createdAt: "2026-09-12 17:33:28",
          },
        },
      })
      .install();
    renderApp("/jeux/laser-grid");

    expect(await screen.findByRole("group", { name: "Choisis une case" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sortir avec 16,38 coins/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Étape 2 sur 8" })).toBeInTheDocument();
  });

  it("Getaway prend son plateau, son vocabulaire et son accent magenta", async () => {
    baseApi()
      .on("GET /api/games/getaway/current", {
        json: {
          round: {
            id: 21,
            game: "getaway",
            mode: "cavale",
            status: "playing",
            step: 2,
            maxSteps: 5,
            betCents: 1000,
            multiplier: 3.76,
            nextMultiplier: 7.52,
            cashoutCents: 3760,
            payoutCents: 0,
            createdAt: "2026-09-13 10:00:00",
          },
        },
      })
      .install();
    renderApp("/jeux/getaway");

    expect(await screen.findByRole("group", { name: "Choisis une route" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Étape 3 sur 5" })).toBeInTheDocument();
    expect(screen.getByText("Poursuite 2 / 5")).toBeInTheDocument();
    const encaisser = screen.getByRole("button", { name: /Se planquer avec 37,60 coins/ });
    expect(encaisser).toHaveAttribute("data-variant", "accent-magenta");
  });

  it("Bomb Squad prend son boîtier, son vocabulaire et son accent orange", async () => {
    baseApi()
      .on("GET /api/games/bomb-squad/current", {
        json: {
          round: {
            id: 34,
            game: "bomb-squad",
            mode: "confirme",
            status: "playing",
            step: 1,
            maxSteps: 4,
            betCents: 1000,
            multiplier: 1.92,
            nextMultiplier: 3.84,
            cashoutCents: 1920,
            payoutCents: 0,
            createdAt: "2026-09-13 10:00:00",
          },
        },
      })
      .install();
    renderApp("/jeux/bomb-squad");

    expect(await screen.findByRole("group", { name: "Choisis un câble" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Étape 2 sur 4" })).toBeInTheDocument();
    expect(screen.getByLabelText("Reste 3 étapes")).toBeInTheDocument();
    const encaisser = screen.getByRole("button", { name: /Se retirer avec 19,20 coins/ });
    expect(encaisser).toHaveAttribute("data-variant", "accent-orange");
  });

  it("propose la recharge gratuite quand le solde est trop bas", async () => {
    const api = baseApi()
      .on("GET /api/auth/me", { json: { user: { id: 1, username: "lucas" }, balanceCents: 400 } })
      .on("GET /api/games/vault-rush/current", { json: { round: null } })
      .on("POST /api/wallet/refill", { json: { balanceCents: 100_400, refilledCents: 100_000 } });
    api.install();
    renderApp("/jeux/vault-rush");

    const bouton = await screen.findByRole("button", { name: /Recharge gratuite/ });
    await userEvent.click(bouton);

    await waitFor(() => expect(api.callsTo("POST /api/wallet/refill").length).toBe(1));
    expect(await screen.findByText(/1\s?004,00 coins/)).toBeInTheDocument();
  });
});
