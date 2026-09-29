import { describe, expect, it } from "vitest";
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

/** `from "three"`, `from "three/addons/…"`, ou `import("three")` — jamais un chemin relatif. */
const IMPORTE_THREE = /(from\s+["']three(\/[^"']*)?["'])|(import\(\s*["']three(\/[^"']*)?["']\s*\))/;

/** Fichiers du socle lus par les écrans : ils ne doivent PAS tirer `three`. */
const SANS_THREE = ["support.ts", "useRenderMode.ts", "RenderToggle.tsx", "palette.ts", "Fallback.tsx"];

describe("où three a le droit d'être importé", () => {
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
});
