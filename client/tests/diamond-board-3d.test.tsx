import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Pas de WebGL dans jsdom : le canvas 3D est remplacé par un canvas inerte.
vi.mock("../src/three/Stage3D.tsx", () => ({
  Stage3D: () => (
    <div aria-hidden="true">
      <canvas />
    </div>
  ),
}));

import DiamondBoard3D from "../src/games/diamond3d/DiamondBoard3D.tsx";

const SLOTS = [6.03, 2.13, 1.14, 0.8, 0.72, 0.8, 1.14, 2.13, 6.03];

describe("le plateau 3D de Diamond Drop", () => {
  it("se présente comme une image, sans rien dire du tirage avant la chute", () => {
    render(<DiamondBoard3D rows={8} slots={SLOTS} path={null} row={0} landedSlot={null} rowMs={140} />);
    expect(screen.getByRole("img", { name: "Plateau de clous en 3D" })).toBeInTheDocument();
  });

  it("annonce la case d'arrivée une fois le diamant posé", () => {
    render(
      <DiamondBoard3D
        rows={8}
        slots={SLOTS}
        path={[false, false, false, false, false, false, false, false]}
        row={8}
        landedSlot={0}
        rowMs={140}
      />,
    );
    expect(
      screen.getByRole("img", { name: "Plateau de clous en 3D — diamant posé en case 1 (×6,03)" }),
    ).toBeInTheDocument();
  });
});
