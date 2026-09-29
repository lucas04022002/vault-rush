import { Button } from "../components/index.ts";
import type { Rendu } from "./support.ts";

/**
 * La bascule « Vue 3D ». Libellé fixe, état porté par `aria-pressed` : un
 * lecteur d'écran annonce « Vue 3D, bouton bascule, activé ».
 * Rien du tout quand l'appareil ne peut pas afficher la 3D.
 */
export function RenderToggle({
  mode,
  possible,
  onToggle,
}: {
  mode: Rendu;
  possible: boolean;
  onToggle: () => void;
}) {
  if (!possible) return null;
  return (
    <Button
      variant="quiet"
      className="render-toggle"
      aria-pressed={mode === "3d"}
      onClick={onToggle}
    >
      Vue 3D
    </Button>
  );
}
