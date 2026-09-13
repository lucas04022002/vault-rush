import { Link } from "react-router";
import { PageTitle } from "../components/index.ts";
import { formatCoins, formatMultiplier } from "../lib/format.ts";
import type { BlackjackConfig } from "./blackjack.ts";
import { accentFor } from "./boards/index.ts";

/**
 * Les règles de Blackjack Express, écrites depuis sa configuration serveur :
 * la valeur des cartes, la règle du croupier, les gains, et le fait que le
 * jeu de 52 cartes est rebattu à chaque manche.
 */
export function BlackjackRules({ config }: { config: BlackjackConfig }) {
  return (
    <>
      <PageTitle eyebrow="Règles" accent={accentFor(config.id)}>
        {config.name}
      </PageTitle>

      <section className="panel prose" aria-label="Comment ça marche">
        <h2>Comment ça marche</h2>
        <ol>
          <li>Tu choisis ta mise, puis les cartes sont distribuées.</li>
          <li>Tu reçois deux cartes face visible ; le croupier en reçoit une visible et une cachée.</li>
          <li>
            Tu tires autant de cartes que tu veux, ou tu restes. Au-dessus de 21, la manche est
            perdue tout de suite.
          </li>
          <li>Quand tu restes, le croupier retourne sa carte cachée et joue sa main.</li>
          <li>La main la plus proche de 21, sans la dépasser, l'emporte.</li>
        </ol>
        <p>Ni séparation, ni doublement, ni assurance : on tire, ou on reste.</p>
      </section>

      <section className="panel prose" aria-label="La valeur des cartes">
        <h2>La valeur des cartes</h2>
        <p>{config.valeurs}</p>
        <ul className="prose__list">
          <li>
            <strong>2 à 10</strong> : leur valeur.
          </li>
          <li>
            <strong>Valet, dame, roi</strong> : 10.
          </li>
          <li>
            <strong>As</strong> : 11, ou 1 si 11 faisait dépasser 21. Une main qui compte un as à
            11 s'affiche avec ses deux lectures, « 7 ou 17 ».
          </li>
        </ul>
      </section>

      <section className="panel prose" aria-label="La règle du croupier">
        <h2>La règle du croupier</h2>
        <p>{config.regleCroupier}</p>
        <p>{config.regleSabot}</p>
      </section>

      <section className="panel" aria-label="Gains">
        <p className="label">Ce que rapporte chaque issue</p>
        <table className="bilan">
          <caption>Gains, en multiple de la mise</caption>
          <tbody>
            {config.gains.map((gain) => (
              <tr key={gain.id}>
                <th scope="row">
                  {gain.label}
                  <span className="bj-gains__detail">{gain.detail}</span>
                </th>
                <td>{formatMultiplier(gain.multiplier)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="gamepanel__line">
          {`Mise entre ${formatCoins(config.minBetCents)} et ${formatCoins(config.maxBetCents)} · gain plafonné à ${formatCoins(config.maxPayoutCents)} par manche`}
        </p>
      </section>

      <section className="panel prose" aria-label="Le hasard">
        <h2>Le hasard est côté serveur</h2>
        <p>
          Le mélange se fait sur le serveur, avec un générateur cryptographique, au moment de la
          donne. La carte cachée du croupier et les cartes qui restent à tirer ne quittent jamais le
          serveur : le navigateur ne les connaît pas, et rien de ce qui se passe à l'écran ne peut
          les changer.
        </p>
        <p>Les coins sont fictifs et n'ont aucune valeur.</p>
      </section>

      <p className="screen__aside">
        <Link to={`/jeux/${config.id}`}>Jouer à {config.name}</Link>
      </p>
    </>
  );
}
