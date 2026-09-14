import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { baseApi, type FakeApi } from "./helpers/fake-api.ts";
import { renderApp } from "./helpers/render.tsx";

/**
 * L'écran de Vault Code, dans l'application réelle (routeur + session + hook).
 *
 * Le faux réseau décrit LE SERVEUR tel qu'il répond vraiment : la config et la
 * vue publique sont copiées de `server/tests/vault-code.test.ts`. Le code du
 * coffre n'y figure jamais tant que la partie est en cours — c'est la règle du
 * moteur, et l'écran n'a donc aucun moyen de l'afficher trop tôt.
 */

const VAULT_CODE_CONFIG = {
  id: "vault-code",
  kind: "code",
  canCashout: false,
  name: "Vault Code",
  tagline: "Trouve la combinaison du coffre avant d'épuiser tes essais.",
  steps: 7,
  format: "4 chiffres, 5 à 7 essais",
  digits: 4,
  labels: { step: "essai", option: "chiffre", safe: "verrou", danger: "échec", cashout: "Ouvrir" },
  maxPayoutCents: 1_000_000,
  minBetCents: 100,
  maxBetCents: 100_000,
  modes: [
    {
      id: "confort",
      label: "Confort",
      essais: 7,
      options: 10,
      safeOptions: 4,
      houseEdge: 0.06,
      chancePerStep: 1 / 5040,
      multipliers: [4.24, 2.97, 2.08, 1.45, 1.02, 0.71, 0.5],
    },
    {
      id: "tendu",
      label: "Tendu",
      essais: 6,
      options: 10,
      safeOptions: 4,
      houseEdge: 0.06,
      chancePerStep: 1 / 5040,
      multipliers: [11.31, 6.22, 3.42, 1.88, 1.03, 0.57],
    },
    {
      id: "sec",
      label: "Sec",
      essais: 5,
      options: 10,
      safeOptions: 4,
      houseEdge: 0.06,
      chancePerStep: 1 / 5040,
      multipliers: [29.04, 13.07, 5.88, 2.65, 1.19],
    },
  ],
};

type Attempt = { guess: number[]; verrous: number; echos: number };

/** Une partie de Vault Code en mode Tendu, mise 25,00 coins. */
function round(attempts: Attempt[], extra: Record<string, unknown> = {}) {
  const view = {
    mode: "tendu",
    digits: 4,
    essais: 6,
    essaisRestants: 6 - attempts.length,
    attempts,
    code: null as number[] | null,
    ...((extra.view as Record<string, unknown>) ?? {}),
  };
  return {
    id: 7,
    game: "vault-code",
    mode: "tendu",
    status: "playing",
    step: attempts.length,
    maxSteps: 7,
    betCents: 2500,
    multiplier: 0,
    nextMultiplier: null,
    cashoutCents: 0,
    payoutCents: 0,
    createdAt: "2026-09-13 21:10:00",
    ...extra,
    view,
  };
}

function api(): FakeApi {
  return baseApi().on("GET /api/games/vault-code/config", { json: { game: VAULT_CODE_CONFIG } });
}

describe("écran Vault Code", () => {
  it("montre la table des gains et les modes avant de miser", async () => {
    api().on("GET /api/games/vault-code/current", { json: { round: null } }).install();
    renderApp("/jeux/vault-code");

    const table = await screen.findByRole("region", { name: "Multiplicateurs par essai" });
    // Une ligne par essai, une colonne par mode : tout tient sans défiler.
    expect(within(table).getByRole("columnheader", { name: /Sec/ })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "Essai 1" })).toBeInTheDocument();
    // La table porte bien les multiplicateurs calibrés, pas des valeurs inventées.
    expect(within(table).getByText("×29,04")).toBeInTheDocument();
    expect(within(table).getByText("×0,50")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Mode Tendu, 6 essais" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mise libre")).toBeInTheDocument();
    expect(
      screen.getByText(/Le gain dépend du nombre d'essais utilisés/),
    ).toBeInTheDocument();

    // Pas de pavé tant qu'aucune partie n'est lancée.
    expect(screen.queryByRole("group", { name: "Pavé numérique" })).not.toBeInTheDocument();
  });

  it("montre le journal des essais, les essais restants et le pavé en jeu", async () => {
    api()
      .on("GET /api/games/vault-code/current", {
        json: {
          round: round([
            { guess: [0, 1, 2, 3], verrous: 1, echos: 1 },
            { guess: [4, 5, 6, 7], verrous: 0, echos: 2 },
          ]),
        },
      })
      .install();
    renderApp("/jeux/vault-code");

    expect(await screen.findByText("Partie en cours reprise.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Essai 3 sur 6" })).toBeInTheDocument();

    const journal = screen.getByRole("list", { name: "Essais déjà joués" });
    const lignes = within(journal).getAllByRole("listitem");
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toHaveTextContent("Essai 1 : 0 1 2 3 — 1 verrou, 1 écho");
    expect(lignes[1]).toHaveTextContent("Essai 2 : 4 5 6 7 — 0 verrou, 2 échos");

    // Les essais restants et le gain du prochain essai sont lisibles.
    expect(screen.getByText(/Essais restants/)).toHaveTextContent("Essais restants : 4 sur 6");
    expect(screen.getByText(/Trouvé maintenant/)).toHaveTextContent("×3,42");

    expect(screen.getByRole("group", { name: "Pavé numérique" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Composer le chiffre 0" })).toBeInTheDocument();
    // Rien à valider ni à effacer tant que rien n'est composé.
    expect(screen.getByRole("button", { name: "Valider la combinaison" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Effacer le dernier chiffre" })).toBeDisabled();
  });

  it("le pavé refuse deux fois le même chiffre et envoie la combinaison composée", async () => {
    const faux = api()
      .on("GET /api/games/vault-code/current", { json: { round: round([]) } })
      .on("POST /api/games/vault-code/play", {
        json: {
          round: round([{ guess: [1, 2, 3, 4], verrous: 2, echos: 0 }]),
          verrous: 2,
          echos: 0,
          trouve: false,
          code: null,
        },
      });
    faux.install();
    renderApp("/jeux/vault-code");

    const taper = async (chiffre: number) =>
      userEvent.click(await screen.findByRole("button", { name: `Composer le chiffre ${chiffre}` }));

    await taper(1);
    // Le 1 est posé : il ne peut plus être composé une seconde fois.
    expect(screen.getByRole("button", { name: "Chiffre 1, déjà composé" })).toBeDisabled();

    await taper(2);
    await taper(9);
    await userEvent.click(screen.getByRole("button", { name: "Effacer le dernier chiffre" }));
    await taper(3);
    await taper(4);

    await userEvent.click(screen.getByRole("button", { name: "Valider la combinaison" }));

    await waitFor(() => {
      expect(faux.callsTo("POST /api/games/vault-code/play")).toHaveLength(1);
    });
    expect(faux.callsTo("POST /api/games/vault-code/play")[0].body).toEqual({
      roundId: 7,
      step: 0,
      guess: [1, 2, 3, 4],
    });

    expect(await screen.findByText("2 verrous, 0 écho. Il reste 5 essais.")).toBeInTheDocument();
  });

  it("révèle le code et le bilan quand les essais sont épuisés", async () => {
    const attempts: Attempt[] = [
      { guess: [0, 1, 2, 3], verrous: 1, echos: 0 },
      { guess: [4, 5, 6, 7], verrous: 0, echos: 1 },
      { guess: [8, 9, 0, 1], verrous: 0, echos: 2 },
      { guess: [2, 3, 4, 5], verrous: 1, echos: 1 },
      { guess: [6, 7, 8, 9], verrous: 0, echos: 1 },
      { guess: [1, 0, 3, 2], verrous: 0, echos: 2 },
    ];
    api()
      .on("GET /api/games/vault-code/current", { json: { round: round(attempts.slice(0, 5)) } })
      .on("POST /api/games/vault-code/play", {
        json: {
          round: round(attempts, {
            status: "lost",
            payoutCents: 0,
            view: { essaisRestants: 0, code: [3, 7, 1, 5] },
          }),
          verrous: 0,
          echos: 2,
          trouve: false,
          code: [3, 7, 1, 5],
        },
      })
      .on("GET /api/wallet", { json: { balanceCents: 97_500 } })
      .install();
    renderApp("/jeux/vault-code");

    for (const chiffre of [1, 0, 3, 2]) {
      await userEvent.click(
        await screen.findByRole("button", { name: `Composer le chiffre ${chiffre}` }),
      );
    }
    await userEvent.click(screen.getByRole("button", { name: "Valider la combinaison" }));

    const bilan = await screen.findByRole("region", { name: "Fin de partie" });
    expect(within(bilan).getByText("Le code était")).toBeInTheDocument();
    expect(within(bilan).getByText("Le code était 3 7 1 5")).toBeInTheDocument();
    expect(screen.getByText("Essais épuisés. Le code était 3 7 1 5.")).toBeInTheDocument();

    const lignes = within(bilan).getAllByRole("row");
    const texte = lignes.map((l) => l.textContent).join(" | ");
    expect(texte).toContain("Mise");
    expect(texte).toContain("25,00 coins");
    expect(texte).toContain("Essais utilisés6 sur 6");
    expect(within(bilan).getByRole("button", { name: /Rejouer/ })).toBeInTheDocument();
    expect(within(bilan).getByRole("button", { name: "Changer la mise" })).toBeInTheDocument();
  });

  it("révèle le code et le gain quand le coffre s'ouvre", async () => {
    api()
      .on("GET /api/games/vault-code/current", { json: { round: round([]) } })
      .on("POST /api/games/vault-code/play", {
        json: {
          round: round([{ guess: [3, 7, 1, 5], verrous: 4, echos: 0 }], {
            status: "cashed_out",
            multiplier: 11.31,
            payoutCents: 28_275,
            view: { essaisRestants: 5, code: [3, 7, 1, 5] },
          }),
          verrous: 4,
          echos: 0,
          trouve: true,
          code: [3, 7, 1, 5],
        },
      })
      .on("GET /api/wallet", { json: { balanceCents: 125_775 } })
      .install();
    renderApp("/jeux/vault-code");

    for (const chiffre of [3, 7, 1, 5]) {
      await userEvent.click(
        await screen.findByRole("button", { name: `Composer le chiffre ${chiffre}` }),
      );
    }
    await userEvent.click(screen.getByRole("button", { name: "Valider la combinaison" }));

    expect(
      await screen.findByText("Coffre ouvert en 1 essai ! Le code était 3 7 1 5."),
    ).toBeInTheDocument();
    const bilan = screen.getByRole("region", { name: "Fin de partie" });
    expect(within(bilan).getByText("Coffre ouvert")).toBeInTheDocument();
    const texte = within(bilan)
      .getAllByRole("row")
      .map((l) => l.textContent)
      .join(" | ");
    expect(texte).toContain("282,75 coins");
    expect(texte).toContain("×11,31");
    expect(texte).toContain("Essais utilisés1 sur 6");
  });

  it("aucun contrôle ne part pendant qu'un essai est en vol", async () => {
    // La réponse du serveur est retenue tant que `debloquer` n'est pas appelé.
    let debloquer = () => {};
    const attente = new Promise<void>((resolve) => {
      debloquer = resolve;
    });
    api()
      .on("GET /api/games/vault-code/current", { json: { round: round([]) } })
      .on("POST /api/games/vault-code/play", async () => {
        await attente;
        return {
          json: {
            round: round([{ guess: [1, 2, 3, 4], verrous: 0, echos: 1 }]),
            verrous: 0,
            echos: 1,
            trouve: false,
            code: null,
          },
        };
      })
      .install();
    renderApp("/jeux/vault-code");

    for (const chiffre of [1, 2, 3, 4]) {
      await userEvent.click(
        await screen.findByRole("button", { name: `Composer le chiffre ${chiffre}` }),
      );
    }
    await userEvent.click(screen.getByRole("button", { name: "Valider la combinaison" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Composer le chiffre 5" })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "Effacer le dernier chiffre" })).toBeDisabled();

    debloquer();
    expect(await screen.findByText(/Il reste 5 essais/)).toBeInTheDocument();
  });
});

describe("règles de Vault Code", () => {
  it("montre la table des gains, les essais et la règle du gain", async () => {
    api().install();
    renderApp("/regles/vault-code");

    expect(await screen.findByRole("heading", { name: "Vault Code" })).toBeInTheDocument();

    const table = await screen.findByRole("region", { name: "Multiplicateurs par essai" });
    expect(within(table).getByRole("columnheader", { name: /Confort/ })).toBeInTheDocument();
    expect(within(table).getByText("×4,24")).toBeInTheDocument();
    expect(within(table).getByText("×29,04")).toBeInTheDocument();

    // Le nombre d'essais de chaque mode, et la phrase qui explique le gain.
    expect(screen.getByText(/Confort 7, Tendu 6, Sec 5/)).toBeInTheDocument();
    expect(
      screen.getByText(/Le gain dépend du nombre d'essais utilisés/),
    ).toBeInTheDocument();
    expect(screen.getByText(/verrous/i)).toBeInTheDocument();
  });
});
