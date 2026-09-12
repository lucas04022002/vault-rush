import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useLadderGame } from "../src/games/useLadderGame.ts";
import { baseApi, round, type Reply } from "./helpers/fake-api.ts";
import { sessionWrapper } from "./helpers/render.tsx";

/**
 * Le hook de jeu, branché sur un faux RÉSEAU (et non sur un faux hook) :
 * chaque test décrit ce que répond le serveur et vérifie l'état obtenu.
 */

function mount(api: ReturnType<typeof baseApi>, game = "vault-rush") {
  api.install();
  return renderHook(() => useLadderGame(game), { wrapper: sessionWrapper });
}

describe("useLadderGame", () => {
  it("part de « idle » quand aucune partie n'est en cours", async () => {
    const api = baseApi().on("GET /api/games/vault-rush/current", { json: { round: null } });
    const { result } = mount(api);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.state).toBe("idle");
    expect(result.current.resumed).toBe(false);
    expect(result.current.config?.steps).toBe(6);
  });

  it("démarrer une partie passe en « active »", async () => {
    const api = baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: null } })
      .on("POST /api/games/vault-rush/start", { status: 201, json: { round: round(0) } });
    const { result } = mount(api);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.start("25,00", "risk");
    });

    expect(result.current.state).toBe("active");
    expect(result.current.round?.betCents).toBe(2500);
    expect(api.callsTo("POST /api/games/vault-rush/start")[0].body).toEqual({
      betCoins: "25,00",
      mode: "risk",
    });
  });

  it("une partie en cours au montage est reprise", async () => {
    const api = baseApi().on("GET /api/games/vault-rush/current", { json: { round: round(2) } });
    const { result } = mount(api);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.state).toBe("active");
    expect(result.current.resumed).toBe(true);
    expect(result.current.round?.step).toBe(2);
  });

  it("jouer annonce l'étape attendue et l'option choisie", async () => {
    const api = baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: round(2) } })
      .on("POST /api/games/vault-rush/play", {
        json: { round: round(3), revealed: ["safe", "danger", "safe", "danger"], outcome: "safe" },
      });
    const { result } = mount(api);
    await waitFor(() => expect(result.current.state).toBe("active"));

    await act(async () => {
      await result.current.play(2);
    });

    // L'écran numérote les options à partir de 1, le serveur à partir de 0.
    expect(api.callsTo("POST /api/games/vault-rush/play")[0].body).toEqual({
      roundId: 1,
      step: 2,
      option: 1,
    });
    expect(result.current.state).toBe("active");
    expect(result.current.round?.step).toBe(3);
  });

  it("un 409 step_mismatch adopte l'état du serveur", async () => {
    const api = baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: round(2) } })
      .on("POST /api/games/vault-rush/play", {
        status: 409,
        json: { error: "step_mismatch", round: round(4) },
      });
    const { result } = mount(api);
    await waitFor(() => expect(result.current.state).toBe("active"));

    await act(async () => {
      await result.current.play(1);
    });

    expect(result.current.state).toBe("active");
    expect(result.current.round?.step).toBe(4);
    expect(result.current.error).toMatch(/étape/i);
  });

  it("une alarme termine la partie et garde la révélation", async () => {
    const api = baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: round(2) } })
      .on("POST /api/games/vault-rush/play", {
        json: {
          round: round(2, { status: "lost", payoutCents: 0, cashoutCents: 0, nextMultiplier: null }),
          revealed: ["danger", "safe", "safe", "danger"],
          outcome: "danger",
        },
      });
    const { result } = mount(api);
    await waitFor(() => expect(result.current.state).toBe("active"));

    await act(async () => {
      await result.current.play(1);
    });

    expect(result.current.state).toBe("finished");
    expect(result.current.round?.status).toBe("lost");
    expect(result.current.revealed).toEqual(["danger", "safe", "safe", "danger"]);
  });

  it("la dernière étape encaisse toute seule et donne le bilan", async () => {
    const api = baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: round(5) } })
      .on("POST /api/games/vault-rush/play", {
        json: {
          round: round(6, {
            status: "cashed_out",
            step: 6,
            multiplier: 61.44,
            payoutCents: 153_600,
            cashoutCents: 153_600,
            nextMultiplier: null,
          }),
          revealed: ["safe", "safe", "danger", "danger"],
          outcome: "safe",
        },
      })
      .on("GET /api/wallet", { json: { balanceCents: 251_100 } });
    const { result } = mount(api);
    await waitFor(() => expect(result.current.state).toBe("active"));

    await act(async () => {
      await result.current.play(1);
    });

    expect(result.current.state).toBe("finished");
    expect(result.current.round?.status).toBe("cashed_out");
    expect(result.current.round?.payoutCents).toBe(153_600);
    // Le solde est relu après la fin d'une partie : le `play` ne le renvoie pas.
    expect(api.callsTo("GET /api/wallet").length).toBe(1);
  });

  it("encaisser termine la partie et met le solde à jour depuis la réponse", async () => {
    const api = baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: round(3) } })
      .on("POST /api/games/vault-rush/cashout", {
        json: {
          round: round(3, { status: "cashed_out", payoutCents: 19_200, cashoutCents: 19_200 }),
          balanceCents: 116_700,
        },
      });
    const { result } = mount(api);
    await waitFor(() => expect(result.current.state).toBe("active"));

    await act(async () => {
      await result.current.cashout();
    });

    expect(result.current.state).toBe("finished");
    expect(result.current.round?.payoutCents).toBe(19_200);
    expect(api.callsTo("POST /api/games/vault-rush/cashout")[0].body).toEqual({ roundId: 1 });
  });

  it("une erreur du serveur devient un message en français", async () => {
    const api = baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: null } })
      .on("POST /api/games/vault-rush/start", {
        status: 409,
        json: { error: "insufficient_balance" },
      });
    const { result } = mount(api);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.start("25,00", "risk");
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBe("Solde insuffisant.");
  });

  it("un 409 round_active au démarrage adopte la partie du serveur", async () => {
    const api = baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: null } })
      .on("POST /api/games/vault-rush/start", {
        status: 409,
        json: { error: "round_active", round: round(1) },
      });
    const { result } = mount(api);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.start("25,00", "risk");
    });

    expect(result.current.state).toBe("active");
    expect(result.current.round?.step).toBe(1);
    expect(result.current.resumed).toBe(true);
  });

  it("aucune requête ne part pendant qu'une autre est en vol", async () => {
    let release: (reply: Reply) => void = () => {};
    const api = baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: null } })
      .on("POST /api/games/vault-rush/start", () => new Promise<Reply>((r) => (release = r)));
    const { result } = mount(api);
    await waitFor(() => expect(result.current.loading).toBe(false));

    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.start("25,00", "risk");
      await Promise.resolve();
    });
    expect(result.current.pending).toBe(true);

    // Deuxième clic (rejouer) pendant la requête : ignoré.
    await act(async () => {
      await result.current.replay();
    });
    expect(api.callsTo("POST /api/games/vault-rush/start").length).toBe(1);

    await act(async () => {
      release({ status: 201, json: { round: round(0) } });
      await first;
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.state).toBe("active");
  });

  it("rejouer relance la même mise et le même mode", async () => {
    const api = baseApi()
      .on("GET /api/games/vault-rush/current", { json: { round: null } })
      .on("POST /api/games/vault-rush/start", { status: 201, json: { round: round(0) } })
      .on("POST /api/games/vault-rush/cashout", {
        json: {
          round: round(1, { status: "cashed_out", payoutCents: 4800, cashoutCents: 4800 }),
          balanceCents: 102_300,
        },
      });
    const { result } = mount(api);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.start("25,00", "risk");
    });
    await act(async () => {
      await result.current.cashout();
    });
    expect(result.current.state).toBe("finished");

    await act(async () => {
      await result.current.replay();
    });

    const starts = api.callsTo("POST /api/games/vault-rush/start");
    expect(starts.length).toBe(2);
    expect(starts[1].body).toEqual({ betCoins: "25,00", mode: "risk" });
    expect(result.current.state).toBe("active");
  });
});
