import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { baseApi, round } from "./helpers/fake-api.ts";
import { renderApp } from "./helpers/render.tsx";
import { dureeEvenement } from "../src/games/coffre3d/portes.ts";

/**
 * Vault Rush en 3D, dans l'application réelle. jsdom n'a pas de WebGL : on simule sa présence
 * (pour que la 3D soit choisie) et on remplace le canvas par un témoin — la scène n'est jamais
 * créée, mais tout le reste du plateau 3D (frise, grille de boutons, verrou) est le vrai.
 */
vi.mock("../src/three/Stage3D.tsx", () => ({
  Stage3D: () => <div data-testid="scene-3d" />,
}));

function simulerWebGL() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    getExtension: () => null,
  } as never);
}

afterEach(() => {
  window.localStorage.clear();
});

describe("Vault Rush en 3D", () => {
  it("sans WebGL, le plateau 2D d'aujourd'hui, sans bascule", async () => {
    baseApi().on("GET /api/games/vault-rush/current", { json: { round: round(2) } }).install();
    renderApp("/jeux/vault-rush");

    const portes = await screen.findByRole("group", { name: "Choisis une porte" });
    expect(within(portes).getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByTestId("scene-3d")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vue 3D" })).not.toBeInTheDocument();
  });

  it("avec WebGL, la scène 3D et une grille de vraies portes, qui jouent le bon coup", async () => {
    simulerWebGL();
    const api = baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: round(2) } })
      .on("POST /api/games/vault-rush/play", {
        json: { round: round(3), revealed: ["safe", "danger", "safe", "danger"], outcome: "safe" },
      })
      .install();
    renderApp("/jeux/vault-rush");

    expect(await screen.findByTestId("scene-3d")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vue 3D" })).toHaveAttribute("aria-pressed", "true");
    // La frise des étages est la même qu'en 2D.
    expect(screen.getByRole("list", { name: "Étape 3 sur 6" })).toBeInTheDocument();

    const portes = screen.getByRole("group", { name: "Choisis une porte" });
    const boutons = within(portes).getAllByRole("button");
    expect(boutons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Porte 1",
      "Porte 2",
      "Porte 3",
      "Porte 4",
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Porte 2" }));
    await waitFor(() => expect(api.callsTo("POST /api/games/vault-rush/play")).toHaveLength(1));
    expect(api.callsTo("POST /api/games/vault-rush/play")[0].body).toMatchObject({ option: 1 });
  });

  it("pendant la montée d'un étage, les portes sont verrouillées, puis se rouvrent", async () => {
    simulerWebGL();
    baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: round(2) } })
      .on("POST /api/games/vault-rush/play", {
        json: { round: round(3), revealed: ["safe", "danger", "safe", "danger"], outcome: "safe" },
      })
      .install();
    renderApp("/jeux/vault-rush");

    await userEvent.click(await screen.findByRole("button", { name: "Porte 1" }));
    // L'étage 4 est atteint…
    expect(await screen.findByRole("list", { name: "Étape 4 sur 6" })).toBeInTheDocument();
    // … mais ses portes attendent la fin de la montée.
    expect(screen.getByRole("button", { name: "Porte 1" })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Porte 1" })).toBeEnabled(), {
      timeout: dureeEvenement({ type: "montee", porte: 0 }) + 1000,
    });
  });

  it("après une alarme, chaque porte dit ce qu'elle cachait", async () => {
    simulerWebGL();
    baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: round(2) } })
      .on("POST /api/games/vault-rush/play", {
        json: {
          round: round(2, { status: "lost", payoutCents: 0, cashoutCents: 0, nextMultiplier: null }),
          revealed: ["danger", "safe", "safe", "danger"],
          outcome: "danger",
        },
      })
      .install();
    renderApp("/jeux/vault-rush");

    await userEvent.click(await screen.findByRole("button", { name: "Porte 1" }));
    await screen.findByRole("table", { name: "Bilan de la partie" });
    expect(screen.getByRole("button", { name: "Porte 1 — alarme" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Porte 2 — coffre" })).toBeDisabled();
  });

  it("la bascule ramène le plateau 2D, et le choix est retenu", async () => {
    simulerWebGL();
    baseApi().on("GET /api/games/vault-rush/current", { json: { round: round(2) } }).install();
    renderApp("/jeux/vault-rush");

    await userEvent.click(await screen.findByRole("button", { name: "Vue 3D" }));
    expect(screen.queryByTestId("scene-3d")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vue 3D" })).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem("vaultrush_render")).toBe("2d");
  });
});
