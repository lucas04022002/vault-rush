import { useEffect, useState } from "react";
import { history, type HistoryRound } from "../api.ts";
import { Amount, GameFilter, PageTitle, Toast } from "../components/index.ts";
import { useCatalogue } from "../games/catalogue.ts";
import { formatCoins } from "../lib/format.ts";
import { errorMessage } from "../lib/messages.ts";

const LIMIT = 50;

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

const RESULT_LABEL: Record<string, string> = {
  cashed_out: "Encaissé",
  lost: "Perdu",
};

/** L'historique des parties terminées du joueur connecté. */
export function History() {
  const catalogue = useCatalogue();
  const [game, setGame] = useState<string | undefined>(undefined);
  const [rounds, setRounds] = useState<HistoryRound[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let annulé = false;
    setRounds(null);
    setError(null);
    void history(game, LIMIT)
      .then(({ rounds: liste }) => {
        if (!annulé) setRounds(liste);
      })
      .catch((err) => {
        if (!annulé) setError(errorMessage(err));
      });
    return () => {
      annulé = true;
    };
  }, [game]);

  const nomDuJeu = (id: string) => catalogue.find((jeu) => jeu.id === id)?.name ?? id;
  const nomDuMode = (id: string, mode: string) =>
    catalogue.find((jeu) => jeu.id === id)?.modes.find((m) => m.id === mode)?.label ?? mode;

  return (
    <>
      <PageTitle eyebrow="Tes parties">Historique</PageTitle>

      <GameFilter
        label="Filtrer l'historique par jeu"
        options={catalogue}
        value={game}
        onChange={setGame}
      />

      {error ? <Toast kind="bad">{error}</Toast> : null}

      {rounds === null && !error ? (
        <p className="page__loading" role="status">
          Chargement de l'historique…
        </p>
      ) : null}

      {rounds !== null && rounds.length === 0 ? (
        <Toast kind="info">Aucune partie terminée pour l'instant.</Toast>
      ) : null}

      {rounds !== null && rounds.length > 0 ? (
        <section className="panel table-wrap">
          <table className="listing">
            <caption>Historique des parties</caption>
            <thead>
              <tr>
                <th scope="col">Jeu</th>
                <th scope="col">Mode</th>
                <th scope="col">Mise</th>
                <th scope="col">Résultat</th>
                <th scope="col">Net</th>
                <th scope="col">Étape</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((round) => (
                <tr key={round.id}>
                  <th scope="row">{nomDuJeu(round.game)}</th>
                  <td>{nomDuMode(round.game, round.mode)}</td>
                  <td>{formatCoins(round.betCents)}</td>
                  <td data-result={round.status}>{RESULT_LABEL[round.status] ?? round.status}</td>
                  <td>
                    <Amount cents={round.netCents} signed />
                  </td>
                  <td>{`${round.step} sur ${round.maxSteps}`}</td>
                  <td>{formatDate(round.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}

/** Les dates du serveur SQLite sont en UTC, au format « 2026-09-12 17:33:28 ». */
export function formatDate(raw: string): string {
  const iso = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? raw : dateFormat.format(date);
}
