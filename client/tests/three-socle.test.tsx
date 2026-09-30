import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { render, screen } from "@testing-library/react";
import { NEON } from "../src/three/palette.ts";
import { Fallback } from "../src/three/Fallback.tsx";

const CLIENT = resolve(process.cwd());
const SRC = join(CLIENT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** `from "three"`, `import "three/…"` (effet de bord), ou `import("three")` : jamais un chemin relatif. */
const IMPORTE_THREE =
  /(from\s+["']three(\/[^"']*)?["'])|(\bimport\s+["']three(\/[^"']*)?["'])|(import\(\s*["']three(\/[^"']*)?["']\s*\))/;

/** Fichiers du socle lus par les écrans : ils ne doivent PAS tirer `three`. */
const SANS_THREE = ["support.ts", "useRenderMode.ts", "RenderToggle.tsx", "palette.ts", "Fallback.tsx", "boucle.ts"];

describe("où three a le droit d'être importé", () => {
  it("le détecteur reconnaît les trois formes et ignore les chemins relatifs", () => {
    expect(IMPORTE_THREE.test('import { Color } from "three";')).toBe(true);
    expect(IMPORTE_THREE.test('import "three/addons/x.js";')).toBe(true);
    expect(IMPORTE_THREE.test('await import("three")')).toBe(true);
    expect(IMPORTE_THREE.test('import { x } from "../three/support.ts";')).toBe(false);
  });

  it("seulement dans src/three/ et src/games/*3d/", () => {
    const fautifs = walk(SRC)
      .filter((f) => IMPORTE_THREE.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).split(sep).join("/"))
      .filter((f) => !f.startsWith("three/") && !/^games\/[^/]*3d\//.test(f));
    expect(fautifs).toEqual([]);
  });

  it("jamais dans les fichiers du socle que lisent les écrans", () => {
    const fautifs = SANS_THREE.filter((nom) =>
      IMPORTE_THREE.test(readFileSync(join(SRC, "three", nom), "utf8")),
    );
    expect(fautifs).toEqual([]);
  });
});

describe("la palette 3D", () => {
  it("reprend exactement les jetons de tokens.css", () => {
    const tokens = readFileSync(join(SRC, "styles", "tokens.css"), "utf8");
    const jeton = (nom: string) =>
      new RegExp(`--${nom}:\\s*(#[0-9A-Fa-f]{6})`).exec(tokens)?.[1]?.toUpperCase();
    expect(NEON.bg).toBe(jeton("bg"));
    expect(NEON.panel).toBe(jeton("panel"));
    expect(NEON.panel2).toBe(jeton("panel2"));
    expect(NEON.line).toBe(jeton("line"));
    expect(NEON.mag).toBe(jeton("mag"));
    expect(NEON.cyan).toBe(jeton("cyan"));
    expect(NEON.yel).toBe(jeton("yel"));
    expect(NEON.gem).toBe(jeton("gem"));
    expect(NEON.gemShadow).toBe(jeton("gem-shadow"));
    expect(NEON.gemInk).toBe(jeton("gem-ink"));
    expect(NEON.text).toBe(jeton("text"));
    expect(NEON.dim).toBe(jeton("dim"));
    expect(NEON.alarm).toBe(jeton("alarm"));
    expect(NEON.safe).toBe(jeton("safe"));
  });
});

describe("Fallback", () => {
  function Casse(): never {
    throw new Error("contexte WebGL perdu");
  }

  it("affiche le plateau de secours quand la 3D lève", () => {
    // React journalise l'erreur attrapée : on la fait taire le temps du test.
    const console_error = console.error;
    console.error = () => {};
    try {
      render(
        <Fallback fallback={<p>plateau 2D</p>}>
          <Casse />
        </Fallback>,
      );
    } finally {
      console.error = console_error;
    }
    expect(screen.getByText("plateau 2D")).toBeInTheDocument();
  });

  it("laisse passer la 3D quand tout va bien", () => {
    render(
      <Fallback fallback={<p>plateau 2D</p>}>
        <p>plateau 3D</p>
      </Fallback>,
    );
    expect(screen.getByText("plateau 3D")).toBeInTheDocument();
    expect(screen.queryByText("plateau 2D")).not.toBeInTheDocument();
  });

  it("prévient l'écran quand la 3D échoue", () => {
    const console_error = console.error;
    console.error = () => {};
    const onError = vi.fn();
    try {
      render(
        <Fallback fallback={<p>plateau 2D</p>} onError={onError}>
          <Casse />
        </Fallback>,
      );
    } finally {
      console.error = console_error;
    }
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("retente la 3D quand resetKey change, et pas avant", () => {
    let casse = true;
    function Fragile() {
      if (casse) throw new Error("contexte WebGL perdu");
      return <p>plateau 3D</p>;
    }
    const console_error = console.error;
    console.error = () => {};
    try {
      const { rerender } = render(
        <Fallback fallback={<p>plateau 2D</p>} resetKey={1}>
          <Fragile />
        </Fallback>,
      );
      expect(screen.getByText("plateau 2D")).toBeInTheDocument();

      // Même clé : le repli reste, même si la 3D irait mieux.
      casse = false;
      rerender(
        <Fallback fallback={<p>plateau 2D</p>} resetKey={1}>
          <Fragile />
        </Fallback>,
      );
      expect(screen.getByText("plateau 2D")).toBeInTheDocument();

      // Autre clé (autre partie) : la 3D revient.
      rerender(
        <Fallback fallback={<p>plateau 2D</p>} resetKey={2}>
          <Fragile />
        </Fallback>,
      );
    } finally {
      console.error = console_error;
    }
    expect(screen.getByText("plateau 3D")).toBeInTheDocument();
    expect(screen.queryByText("plateau 2D")).not.toBeInTheDocument();
  });
});
