import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Stage } from "../src/three/stage.ts";
import { Fallback } from "../src/three/Fallback.tsx";
import { Stage3D } from "../src/three/Stage3D.tsx";

type Prise = { canvas: HTMLCanvasElement; stage: Stage };
const prises: Prise[] = [];

// Pas de WebGL en jsdom : un faux `createStage` qui note le canvas reçu.
vi.mock("../src/three/stage.ts", () => ({
  createStage: (canvas: HTMLCanvasElement) => {
    const stage = { dispose: vi.fn(), run: vi.fn(), requestRender: vi.fn() } as unknown as Stage;
    prises.push({ canvas, stage });
    return stage;
  },
}));

describe("Stage3D", () => {
  it("StrictMode : un canvas neuf à chaque montage, l'ancien libéré et retiré", () => {
    prises.length = 0;
    const onReady = vi.fn();
    const { container } = render(
      <StrictMode>
        <Stage3D onReady={onReady} />
      </StrictMode>,
    );
    expect(prises).toHaveLength(2);
    expect(prises[0]?.canvas).not.toBe(prises[1]?.canvas);
    expect(prises[0]?.stage.dispose).toHaveBeenCalledTimes(1);
    expect(prises[1]?.stage.dispose).not.toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledTimes(2);

    const boite = container.querySelector("div.stage3d");
    expect(boite).toHaveAttribute("aria-hidden", "true");
    const canvas = container.querySelectorAll("canvas");
    expect(canvas).toHaveLength(1);
    expect(canvas[0]?.parentElement).toBe(boite);
    expect(canvas[0]).toBe(prises[1]?.canvas);
  });

  it("libère la scène et retire le canvas au démontage, après le nettoyage de la scène", () => {
    prises.length = 0;
    const ordre: string[] = [];
    const { container, unmount } = render(
      <Stage3D
        onReady={(stage) => {
          (stage.dispose as ReturnType<typeof vi.fn>).mockImplementation(() => ordre.push("dispose"));
          return () => ordre.push("nettoyage");
        }}
        className="autre"
      />,
    );
    expect(container.querySelector("div.autre canvas")).not.toBeNull();
    unmount();
    expect(ordre).toEqual(["nettoyage", "dispose"]);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("si onReady lève : la Fallback s'affiche et la scène est libérée", () => {
    prises.length = 0;
    // React journalise l'erreur attrapée : on la fait taire le temps du test.
    const console_error = console.error;
    console.error = () => {};
    try {
      const { container } = render(
        <Fallback fallback={<p>plateau 2D</p>}>
          <Stage3D
            onReady={() => {
              throw new Error("scène cassée");
            }}
          />
        </Fallback>,
      );
      expect(screen.getByText("plateau 2D")).toBeInTheDocument();
      expect(prises).toHaveLength(1);
      expect(prises[0]?.stage.dispose).toHaveBeenCalledTimes(1);
      expect(container.querySelector("canvas")).toBeNull();
    } finally {
      console.error = console_error;
    }
  });
});
