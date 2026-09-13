import { type CSSProperties, useEffect, useRef } from "react";
import { formatMultiplier } from "../lib/format.ts";
import { heatOf } from "./heat.ts";
import { offsetAt } from "./drop.ts";

export type DiamondBoardProps = {
  /** Nombre de rangées de clous. */
  rows: number;
  /** Les multiplicateurs des `rows + 1` cases, de gauche à droite. */
  slots: number[];
  /** Le chemin reçu du serveur, ou `null` tant que rien n'est lâché. */
  path: boolean[] | null;
  /** Nombre de rangées déjà franchies par le diamant. */
  row: number;
  /** La case d'arrivée une fois le diamant posé, `null` pendant la chute. */
  landedSlot: number | null;
};

/**
 * Le plateau de clous : les rangées de clous, le diamant, et la bande des cases.
 *
 * Le plateau et la bande partagent le même repère (une largeur de case) : ils
 * défilent donc ENSEMBLE dans un seul conteneur, et le diamant tombe toujours
 * pile au-dessus de sa case, même sur un écran de 375 px.
 */
export function DiamondBoard({ rows, slots, path, row, landedSlot }: DiamondBoardProps) {
  const cols = slots.length;
  const x = offsetAt(path, row);
  const y = rows === 0 ? 0 : row / rows;
  const état = landedSlot !== null ? "posé" : path ? "chute" : "prêt";

  const scroll = useRef<HTMLDivElement>(null);

  /*
   * Un plateau de 16 rangées est plus large qu'un téléphone : la zone défile.
   * Elle se cale donc sur le diamant — au centre au départ, sur sa case à
   * l'arrivée — sinon le joueur ne verrait que le flanc gauche du plateau.
   */
  useEffect(() => {
    const zone = scroll.current;
    if (!zone || zone.scrollWidth <= zone.clientWidth) return;
    const case_ = zone.scrollWidth / cols;
    const visé = (x + cols / 2) * case_ - zone.clientWidth / 2;
    zone.scrollLeft = Math.max(0, Math.min(visé, zone.scrollWidth - zone.clientWidth));
  }, [cols, x]);

  return (
    <div
      ref={scroll}
      className="dd-scroll"
      role="region"
      aria-label="Plateau de clous"
      tabIndex={0}
      style={{ "--dd-cols": cols } as CSSProperties}
    >
      <div className="dd-plate">
        <div className="dd-pins" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className="dd-pinrow"
              style={{ "--dd-y": (i + 0.5) / rows } as CSSProperties}
            >
              {Array.from({ length: i + 1 }, (_, j) => (
                <span
                  key={j}
                  className="dd-pin"
                  style={{ "--dd-x": j - i / 2 } as CSSProperties}
                />
              ))}
            </div>
          ))}

          <span
            className="dd-gem"
            data-state={état}
            style={{ "--dd-x": x, "--dd-y": y } as CSSProperties}
          />
        </div>

        <ol className="dd-slots" aria-label="Cases et multiplicateurs">
          {slots.map((multiplier, index) => {
            const arrivée = landedSlot === index;
            return (
              <li
                key={index}
                className="dd-slot"
                data-heat={heatOf(index, cols)}
                data-landed={arrivée ? "true" : undefined}
                aria-current={arrivée ? "true" : undefined}
                aria-label={
                  arrivée
                    ? `Case ${index + 1} : ${formatMultiplier(multiplier)} — case d'arrivée`
                    : `Case ${index + 1} : ${formatMultiplier(multiplier)}`
                }
              >
                <span aria-hidden="true">{formatMultiplier(multiplier)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
