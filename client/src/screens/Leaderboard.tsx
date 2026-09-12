import { useEffect, useState } from "react";
import { leaderboard, type LeaderboardEntry } from "../api.ts";
import { Amount, GameFilter, PageTitle, Toast } from "../components/index.ts";
import { useCatalogue } from "../games/catalogue.ts";
import { formatCoins } from "../lib/format.ts";
import { errorMessage } from "../lib/messages.ts";

const LIMIT = 10;

/** Le classement public : bénéfice net cumulé sur 30 jours. */
export function Leaderboard() {
  const catalogue = useCatalogue();
  const [game, setGame] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let annulé = false;
    setEntries(null);
    setError(null);
    void leaderboard(game, LIMIT)
      .then(({ entries: liste }) => {
        if (!annulé) setEntries(liste);
      })
      .catch((err) => {
        if (!annulé) setError(errorMessage(err));
      });
    return () => {
      annulé = true;
    };
  }, [game]);

  return (
    <>
      <PageTitle eyebrow="Les meilleurs">Classement</PageTitle>

      <GameFilter
        label="Filtrer le classement par jeu"
        options={catalogue}
        value={game}
        onChange={setGame}
      />

      <p className="screen__aside">30 derniers jours, bénéfice net (gains moins mises).</p>

      {error ? <Toast kind="bad">{error}</Toast> : null}

      {entries === null && !error ? (
        <p className="page__loading" role="status">
          Chargement du classement…
        </p>
      ) : null}

      {entries !== null && entries.length === 0 ? (
        <Toast kind="info">Aucune partie terminée sur cette période.</Toast>
      ) : null}

      {entries !== null && entries.length > 0 ? (
        <ol className="ranking" aria-label="Classement des joueurs">
          {entries.map((entry, index) => (
            <li key={entry.username} className="ranking__row">
              <span className="ranking__rank" aria-hidden="true">
                {index + 1}
              </span>
              <span className="sr-only">{`Rang ${index + 1}`}</span>
              <span className="ranking__name">{entry.username}</span>
              <span className="ranking__net">
                <Amount cents={entry.netCents} signed />
              </span>
              <span className="ranking__meta">
                {`${entry.rounds} partie${entry.rounds > 1 ? "s" : ""} · meilleur gain ${formatCoins(entry.bestPayoutCents)}`}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}
