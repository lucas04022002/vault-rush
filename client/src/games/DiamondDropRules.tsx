import type { CSSProperties } from "react";
import { Link } from "react-router";
import type { GameConfig } from "../api.ts";
import { PageTitle } from "../components/index.ts";
import { formatCoins, formatMultiplier, formatPercent } from "../lib/format.ts";
import { dropModes } from "./drop.ts";
import { heatOf } from "./heat.ts";
import "./diamond-drop.css";

/**
 * Les règles de Diamond Drop, écrites depuis sa configuration serveur : les
 * tables affichées ici SONT celles que le moteur applique, pas une copie.
 */
export function DiamondDropRules({ config }: { config: GameConfig }) {
  const modes = dropModes(config);

  return (
    <>
      <PageTitle eyebrow="Règles" accent="gem">
        {config.name}
      </PageTitle>

      <section className="panel prose" aria-label="Comment ça marche">
        <h2>Comment ça marche</h2>
        <ol>
          <li>Tu choisis une mise et un mode, puis tu lances la partie.</li>
          <li>Un seul geste : « Lâcher le diamant ». Il n'y a rien à encaisser en route.</li>
          <li>
            À chaque rangée de clous, le diamant part à gauche ou à droite avec exactement la même
            chance.
          </li>
          <li>Il finit dans une case, et cette case multiplie ta mise.</li>
        </ol>
      </section>

      <section className="panel prose" aria-label="Comment les cases sont calculées">
        <h2>Plus la case est rare, plus elle rapporte</h2>
        <p>
          {`Pour atterrir tout à gauche, le diamant doit partir à gauche à CHAQUE rangée : un seul chemin sur tous ceux possibles. Pour tomber au milieu, des milliers de chemins conviennent. Le gain d'une case est donc l'inverse de sa probabilité, adouci par la volatilité du mode, puis ramené à l'avantage de la maison annoncé.`}
        </p>
        <p>
          {`Les chiffres ci-dessous ne sont pas choisis à la main : ils sont calculés à partir de trois nombres — le nombre de rangées, la volatilité et l'avantage de la maison — puis arrondis à deux décimales VERS LE BAS, pour que l'arrondi ne joue jamais en faveur du joueur.`}
        </p>
        <p>
          {`La case du milieu est la plus probable : c'est elle qui rapporte le moins, et c'est là que le diamant tombe le plus souvent.`}
        </p>
      </section>

      {modes.map((mode) => (
        <section className="panel" key={mode.id} aria-label={`Mode ${mode.label}`}>
          <p className="label">
            {`Mode ${mode.label} — ${mode.rows} rangées, ${mode.slots.length} cases, avantage de la maison ${formatPercent(mode.houseEdge)}`}
          </p>
          <div
            className="dd-scroll"
            role="region"
            aria-label={`Cases du mode ${mode.label}`}
            tabIndex={0}
            style={{ "--dd-cols": mode.slots.length } as CSSProperties}
          >
            <table className="dd-table">
              <caption className="sr-only">{`Multiplicateurs et chances du mode ${mode.label}`}</caption>
              <thead>
                <tr>
                  <th scope="row">Case</th>
                  {mode.slots.map((_, index) => (
                    <th key={index} scope="col">
                      {index + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Gain</th>
                  {mode.slots.map((multiplier, index) => (
                    <td key={index} data-heat={heatOf(index, mode.slots.length)}>
                      {formatMultiplier(multiplier)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">Chance</th>
                  {mode.chances.map((chance, index) => (
                    <td key={index}>{chance < 0.005 ? "< 1 %" : formatPercent(chance)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="panel prose" aria-label="Le hasard">
        <h2>Le chemin est tiré avant la chute</h2>
        <p>
          {`Le chemin entier — une décision par rangée — est tiré sur le serveur au démarrage de la partie, avec un générateur cryptographique, et gardé secret jusqu'à ton clic. Le navigateur ne le reçoit qu'au moment du lâcher, d'un bloc : l'animation ne fait que le rejouer. Rien de ce qui se passe à l'écran ne peut le changer, et le serveur ne peut plus le changer non plus.`}
        </p>
        <p>
          {`Mise comprise entre ${formatCoins(config.minBetCents)} et ${formatCoins(config.maxBetCents)}. Un gain est plafonné à ${formatCoins(config.maxPayoutCents)} par partie : en mode Fou, la case extrême atteint ce plafond dès 17 coins de mise. Les coins sont fictifs et n'ont aucune valeur.`}
        </p>
      </section>

      <p className="screen__aside">
        <Link to={`/jeux/${config.id}`}>Jouer à {config.name}</Link>
      </p>
    </>
  );
}
