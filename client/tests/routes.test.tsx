import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ACCOUNT, baseApi } from "./helpers/fake-api.ts";
import { renderApp } from "./helpers/render.tsx";

/** Routes publiques, routes gardées, et le parcours de connexion. */

describe("gardes de route", () => {
  it("l'arcade est publique et invite à se connecter", async () => {
    baseApi(false).install();
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "Arcade", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Vault Rush" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Laser Grid" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Se connecter" })).toBeInTheDocument();
    expect(screen.getByText(/Coins fictifs, sans valeur\. Jeu gratuit\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CGU" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mentions légales" })).toBeInTheDocument();
  });

  it("l'arcade montre le solde une fois connecté", async () => {
    baseApi(true).install();
    renderApp("/");

    expect(await screen.findByText(/1\s?000,00 coins/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Se connecter" })).not.toBeInTheDocument();
  });

  it("un jeu exige une session", async () => {
    baseApi(false).install();
    renderApp("/jeux/vault-rush");

    expect(await screen.findByRole("heading", { name: "Connexion", level: 1 })).toBeInTheDocument();
  });

  it("l'historique exige une session", async () => {
    baseApi(false).install();
    renderApp("/historique");

    expect(await screen.findByRole("heading", { name: "Connexion", level: 1 })).toBeInTheDocument();
  });

  it("le compte exige une session", async () => {
    baseApi(false).install();
    renderApp("/compte");

    expect(await screen.findByRole("heading", { name: "Connexion", level: 1 })).toBeInTheDocument();
  });

  it("le classement et les règles restent publics", async () => {
    baseApi(false).install();
    renderApp("/classement");
    expect(await screen.findByRole("heading", { name: "Classement", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/30 derniers jours/)).toBeInTheDocument();
  });

  it("les CGU disent que les coins n'ont aucune valeur", async () => {
    baseApi(false).install();
    renderApp("/cgu");

    expect(await screen.findByRole("heading", { name: /CGU/, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/aucune valeur/i)).toBeInTheDocument();
    expect(screen.getByText(/impossible de convertir/i)).toBeInTheDocument();
  });

  it("les mentions légales laissent les champs à compléter", async () => {
    baseApi(false).install();
    renderApp("/mentions-legales");

    expect(
      await screen.findByRole("heading", { name: "Mentions légales", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/À COMPLÉTER/).length).toBeGreaterThan(2);
  });
});

describe("connexion", () => {
  it("connecte un joueur et le renvoie vers l'arcade", async () => {
    const api = baseApi(false).on("POST /api/auth/login", { json: ACCOUNT });
    api.install();
    renderApp("/connexion");

    await userEvent.type(await screen.findByLabelText("Pseudo"), "lucas");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "motdepasse1");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() =>
      expect(api.callsTo("POST /api/auth/login")[0].body).toEqual({
        username: "lucas",
        password: "motdepasse1",
      }),
    );
    expect(await screen.findByRole("heading", { name: "Arcade", level: 1 })).toBeInTheDocument();
  });

  it("un compte sans mot de passe mène à l'écran « Définir un mot de passe »", async () => {
    const api = baseApi(false)
      .on("POST /api/auth/login", { status: 409, json: { error: "password_required" } })
      .on("POST /api/auth/set-password", { json: ACCOUNT });
    api.install();
    renderApp("/connexion");

    await userEvent.type(await screen.findByLabelText("Pseudo"), "lucas");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "motdepasse1");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(
      await screen.findByRole("heading", { name: "Définir un mot de passe", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("lucas")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Nouveau mot de passe"), "motdepasse2");
    await userEvent.click(screen.getByRole("button", { name: "Définir et se connecter" }));

    await waitFor(() =>
      expect(api.callsTo("POST /api/auth/set-password")[0].body).toEqual({
        username: "lucas",
        newPassword: "motdepasse2",
      }),
    );
  });

  it("un mauvais mot de passe affiche un message en français", async () => {
    baseApi(false)
      .on("POST /api/auth/login", { status: 401, json: { error: "invalid_credentials" } })
      .install();
    renderApp("/connexion");

    await userEvent.type(await screen.findByLabelText("Pseudo"), "lucas");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "mauvais1234");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Pseudo ou mot de passe incorrect.")).toBeInTheDocument();
  });
});
