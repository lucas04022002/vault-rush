import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { baseApi } from "./helpers/fake-api.ts";
import { renderApp } from "./helpers/render.tsx";

const ROUNDS = [
  {
    id: 3,
    game: "laser-grid",
    mode: "calme",
    betCents: 1250,
    status: "cashed_out",
    netCents: 388,
    step: 1,
    maxSteps: 8,
    multiplier: 1.31,
    createdAt: "2026-09-12 17:33:28",
  },
  {
    id: 2,
    game: "vault-rush",
    mode: "risk",
    betCents: 2500,
    status: "lost",
    netCents: -2500,
    step: 3,
    maxSteps: 6,
    multiplier: 7.68,
    createdAt: "2026-09-11 09:05:00",
  },
];

describe("historique", () => {
  it("montre les parties terminées, jeu, mise, net et étape", async () => {
    baseApi().on("GET /api/history", { json: { rounds: ROUNDS } }).install();
    renderApp("/historique");

    const table = await screen.findByRole("table", { name: "Historique des parties" });
    const lignes = within(table).getAllByRole("row");
    // 1 en-tête + 2 parties
    expect(lignes.length).toBe(3);
    expect(lignes[1]).toHaveTextContent("Laser Grid");
    expect(lignes[1]).toHaveTextContent("Calme");
    expect(lignes[1]).toHaveTextContent("Encaissé");
    expect(lignes[1]).toHaveTextContent("1 sur 8");
    expect(lignes[2]).toHaveTextContent("Perdu");
    expect(lignes[2]).toHaveTextContent("−25,00 coins");
    expect(lignes[2]).toHaveTextContent("11/09/2026");
  });

  it("le filtre par jeu redemande l'historique au serveur", async () => {
    const api = baseApi().on("GET /api/history", { json: { rounds: ROUNDS } });
    api.install();
    renderApp("/historique");

    await screen.findByRole("table", { name: "Historique des parties" });
    expect(api.callsTo("GET /api/history")[0].query).toBe("?limit=50");

    await userEvent.click(screen.getByRole("button", { name: "Vault Rush" }));

    await waitFor(() => expect(api.callsTo("GET /api/history").length).toBe(2));
    expect(api.callsTo("GET /api/history")[1].query).toContain("game=vault-rush");
    expect(screen.getByRole("button", { name: "Vault Rush" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("un historique vide le dit", async () => {
    baseApi().on("GET /api/history", { json: { rounds: [] } }).install();
    renderApp("/historique");

    expect(await screen.findByText(/Aucune partie terminée/)).toBeInTheDocument();
  });
});

describe("classement", () => {
  it("montre le rang, le pseudo, le bénéfice net et les parties", async () => {
    baseApi()
      .on("GET /api/leaderboard", {
        json: {
          entries: [
            { username: "lucas", netCents: 38_800, rounds: 12, bestPayoutCents: 153_600 },
            { username: "zoe", netCents: -4200, rounds: 5, bestPayoutCents: 9600 },
          ],
        },
      })
      .install();
    renderApp("/classement");

    const liste = await screen.findByRole("list", { name: "Classement des joueurs" });
    const entrées = within(liste).getAllByRole("listitem");
    expect(entrées.length).toBe(2);
    expect(entrées[0]).toHaveTextContent("lucas");
    expect(entrées[0]).toHaveTextContent("+388,00 coins");
    expect(entrées[0]).toHaveTextContent("12 parties");
    expect(entrées[1]).toHaveTextContent("−42,00 coins");
  });
});
