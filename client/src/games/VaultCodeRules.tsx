import { Link } from "react-router";
import type { GameConfig } from "../api.ts";
import { PageTitle } from "../components/index.ts";
import { formatCoins } from "../lib/format.ts";
import { vaultCodeConfig } from "./vaultCode.ts";
import { VaultCodePayouts } from "./VaultCodePayouts.tsx";

/**
 * Les règles de Vault Code, écrites depuis sa configuration serveur.
 * Aucun nombre n'est recopié à la main : essais et multiplicateurs viennent de
 * `GET /api/games/vault-code/config`.
 */
export function VaultCodeRules({ config: brut }: { config: GameConfig }) {
  const config = vaultCodeConfig(brut);
  const essais = config.modes.map((mode) => `${mode.label} ${mode.essais}`).join(", ");

  return (
    <>
      <PageTitle eyebrow="Règles" accent="ice">
        {config.name}
      </PageTitle>

      <section className="panel prose" aria-label="Comment ça marche">
        <h2>Comment ça marche</h2>
        <ol>
          <li>Tu choisis une mise et un mode, puis tu lances la partie.</li>
          <li>{`Le coffre tire un code de ${config.digits} chiffres, TOUS DIFFÉRENTS, entre 0 et 9.`}</li>
          <li>{`Tu composes une combinaison sur le pavé, et le coffre répond deux nombres.`}</li>
          <li>
            <strong>Verrous</strong>
            {" : chiffres justes ET bien placés. "}
            <strong>Échos</strong>
            {" : chiffres présents dans le code, mais à une autre place."}
          </li>
          <li>{`Nombre d'essais selon le mode : ${essais}.`}</li>
          <li>
            {`Pas d'encaissement en cours de partie : tu trouves le code, ou tu épuises tes essais et la mise est perdue.`}
          </li>
        </ol>
        <p>
          {`Exemple : le code est 4 7 0 2 et tu proposes 4 0 3 7. Le 4 est bien placé — 1 verrou. Le 0 et le 7 sont dans le code mais ailleurs — 2 échos. Le 3 n'y est pas.`}
        </p>
      </section>

      <section className="panel" aria-label="Gains">
        <p className="label">Table des gains</p>
        <VaultCodePayouts config={config} />
      </section>

      <section className="panel prose" aria-label="Le hasard">
        <h2>Le hasard est côté serveur</h2>
        <p>
          {`Le code est tiré sur le serveur au démarrage, avec un générateur cryptographique, et il ne sort JAMAIS d'une réponse tant que la partie est en cours : le navigateur ne peut pas le lire, même en regardant le réseau. Il n'est montré qu'une fois la partie terminée.`}
        </p>
        <p>
          {`La table des gains n'a pas été inventée : elle est calibrée par mesure contre le meilleur joueur possible, pour qu'il ne puisse pas battre le jeu sur la durée.`}
        </p>
        <p>
          {`Mise comprise entre ${formatCoins(config.minBetCents)} et ${formatCoins(config.maxBetCents)}. Un gain est plafonné à ${formatCoins(config.maxPayoutCents)} par partie. Les coins sont fictifs et n'ont aucune valeur.`}
        </p>
      </section>

      <p className="screen__aside">
        <Link to={`/jeux/${config.id}`}>Jouer à {config.name}</Link>
      </p>
    </>
  );
}
