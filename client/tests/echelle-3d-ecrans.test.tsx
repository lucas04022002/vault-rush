import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { baseApi, round } from "./helpers/fake-api.ts";
import { renderApp } from "./helpers/render.tsx";
import { dureeEvenement } from "../src/games/echelle3d/logique.ts";

/**
 * Laser Grid, Getaway et Bomb Squad en 3D, dans l'application réelle — le même contrat que
 * Vault Rush (voir vault-rush-3d.test.tsx). jsdom n'a pas de WebGL : on simule sa présence
 * pour que la 3D soit choisie, et le canvas est remplacé par un témoin.
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

const JEUX = [
  { id: "laser-grid", mode: "calme", option: "Case", sure: "passage", piege: "laser", titre: "Grille laser", etapes: 8 },
  { id: "getaway", mode: "tranquille", option: "Route", sure: "voie libre", piege: "barrage", titre: "Cavale", etapes: 5 },
  { id: "bomb-squad", mode: "novice", option: "Câble", sure: "neutralisé", piege: "explosion", titre: "Boîtier", etapes: 4 },
] as const;

describe.each(JEUX)("$id en 3D", (jeu) => {
  const partie = (step: number, extra: Record<string, unknown> = {}) =>
    round(step, { game: jeu.id, mode: jeu.mode, maxSteps: jeu.etapes, ...extra });

  it("sans WebGL, le plateau 2D d'aujourd'hui, sans bascule", async () => {
    baseApi().on(`GET /api/games/${jeu.id}/current`, { json: { round: partie(1) } }).install();
    renderApp(`/jeux/${jeu.id}`);
    expect(await screen.findByText("Partie en cours reprise.")).toBeInTheDocument();
    expect(screen.queryByTestId("scene-3d")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vue 3D" })).not.toBeInTheDocument();
  });

  it("avec WebGL, la scène 3D et une grille de vrais boutons qui jouent le bon coup", async () => {
    simulerWebGL();
    const api = baseApi()
      .on(`GET /api/games/${jeu.id}/current`, { json: { round: partie(1) } })
      .on(`POST /api/games/${jeu.id}/play`, {
        json: { round: partie(2), revealed: ["safe", "safe", "danger", "safe"], outcome: "safe" },
      })
      .install();
    renderApp(`/jeux/${jeu.id}`);

    expect(await screen.findByTestId("scene-3d")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: new RegExp(`^${jeu.titre} — `) })).toBeInTheDocument();
    const grille = screen.getByRole("group", { name: new RegExp(`^Choisis une ${jeu.option.toLowerCase()}`) });
    expect(within(grille).getAllByRole("button")).toHaveLength(4);

    await userEvent.click(screen.getByRole("button", { name: `${jeu.option} 3` }));
    await waitFor(() => expect(api.callsTo(`POST /api/games/${jeu.id}/play`)).toHaveLength(1));
    expect(api.callsTo(`POST /api/games/${jeu.id}/play`)[0].body).toMatchObject({ option: 2 });

    // L'étape suivante est atteinte, mais ses options attendent la fin du passage.
    expect(screen.getByRole("button", { name: `${jeu.option} 1` })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: `${jeu.option} 1` })).toBeEnabled(), {
      timeout: dureeEvenement({ type: "avance", porte: 0 }) + 1000,
    });
  });

  it("perdu : chaque option dit ce qu'elle cachait", async () => {
    simulerWebGL();
    baseApi()
      .on(`GET /api/games/${jeu.id}/current`, { json: { round: partie(1) } })
      .on(`POST /api/games/${jeu.id}/play`, {
        json: {
          round: partie(1, { status: "lost", payoutCents: 0, cashoutCents: 0, nextMultiplier: null }),
          revealed: ["danger", "safe", "safe", "safe"],
          outcome: "danger",
        },
      })
      .install();
    renderApp(`/jeux/${jeu.id}`);

    await userEvent.click(await screen.findByRole("button", { name: `${jeu.option} 1` }));
    await screen.findByRole("table", { name: "Bilan de la partie" });
    expect(screen.getByRole("button", { name: `${jeu.option} 1 — ${jeu.piege}` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `${jeu.option} 2 — ${jeu.sure}` })).toBeDisabled();
  });
});
