import { formatMultiplier, formatPercent } from "../lib/format.ts";
import { heatOf } from "./heat.ts";

/**
 * Ce qui rend les cases de Diamond Drop lisibles sur un téléphone.
 *
 * Le plateau du mode Fou fait dix-sept cases : à 375 px il défile dans sa
 * propre zone, et le ×604,39 des bords — la raison même de jouer ce mode —
 * n'est jamais à l'écran, ni avant de miser ni pendant la chute. La bande
 * garde son rôle (elle est alignée sur les clous, elle montre où le diamant
 * tombe) et reçoit deux compagnons qui, eux, ne défilent JAMAIS :
 *
 *   - `Reperes` : une ligne toujours visible, les bords et le milieu ;
 *   - `ToutesLesCases` : la liste complète, repliée, une case par ligne —
 *     verticale justement pour qu'aucune largeur d'écran ne la coupe.
 */

/** Les bords et le milieu, en une ligne : les deux extrêmes de la bande. */
export function Reperes({ slots }: { slots: number[] }) {
  const bord = Math.max(...slots);
  const milieu = Math.min(...slots);

  return (
    <p className="dd-reperes">
      <span className="dd-reperes__bord">
        {"Bords "}
        <strong>{formatMultiplier(bord)}</strong>
      </span>
      <span aria-hidden="true">·</span>
      <span>
        {"milieu "}
        <strong>{formatMultiplier(milieu)}</strong>
      </span>
    </p>
  );
}

export type ToutesLesCasesProps = {
  slots: number[];
  /** La chance d'arriver dans chaque case, quand la config la donne. */
  chances?: number[];
  /** La case d'arrivée, une fois le diamant posé. */
  landedSlot?: number | null;
};

/** La liste complète des cases, repliée : une ligne par case, jamais coupée. */
export function ToutesLesCases({ slots, chances, landedSlot = null }: ToutesLesCasesProps) {
  return (
    <details className="dd-toutes">
      <summary>{`Toutes les cases (${slots.length})`}</summary>
      <table className="dd-liste">
        <caption className="sr-only">Multiplicateur de chaque case</caption>
        <thead>
          <tr>
            <th scope="col">Case</th>
            <th scope="col">Gain</th>
            {chances ? <th scope="col">Chance</th> : null}
          </tr>
        </thead>
        <tbody>
          {slots.map((multiplier, index) => (
            <tr
              key={index}
              data-landed={landedSlot === index ? "true" : undefined}
              aria-current={landedSlot === index ? "true" : undefined}
            >
              <th scope="row">{index + 1}</th>
              <td data-heat={heatOf(index, slots.length)}>{formatMultiplier(multiplier)}</td>
              {chances ? (
                <td>{chances[index] < 0.005 ? "< 1 %" : formatPercent(chances[index])}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
