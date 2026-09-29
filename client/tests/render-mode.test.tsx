import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  chooseRender,
  loadRenderPreference,
  setRenderPreference,
  webglAvailable,
} from "../src/three/support.ts";
import { useRenderMode } from "../src/three/useRenderMode.ts";
import { RenderToggle } from "../src/three/RenderToggle.tsx";

/** Un contexte WebGL factice : assez pour que la détection réponde « oui ». */
function simulerWebGL() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    getExtension: () => null,
  } as never);
}

afterEach(() => {
  window.localStorage.clear();
});

describe("chooseRender", () => {
  it.each([
    [{ webgl: true, reducedMotion: false, preference: null }, { mode: "3d", possible: true }],
    [{ webgl: true, reducedMotion: false, preference: "3d" }, { mode: "3d", possible: true }],
    [{ webgl: true, reducedMotion: false, preference: "2d" }, { mode: "2d", possible: true }],
    [{ webgl: false, reducedMotion: false, preference: "3d" }, { mode: "2d", possible: false }],
    [{ webgl: true, reducedMotion: true, preference: "3d" }, { mode: "2d", possible: false }],
  ] as const)("%o → %o", (entree, attendu) => {
    expect(chooseRender(entree)).toEqual(attendu);
  });
});

describe("la préférence", () => {
  it("est absente par défaut, puis relue telle qu'écrite", () => {
    expect(loadRenderPreference()).toBeNull();
    setRenderPreference("2d");
    expect(window.localStorage.getItem("vaultrush_render")).toBe("2d");
    expect(loadRenderPreference()).toBe("2d");
  });

  it("ignore une valeur inconnue", () => {
    window.localStorage.setItem("vaultrush_render", "4d");
    expect(loadRenderPreference()).toBeNull();
  });

  it("survit à un stockage interdit (navigation privée)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("interdit");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("interdit");
    });
    expect(loadRenderPreference()).toBeNull();
    expect(() => setRenderPreference("3d")).not.toThrow();
  });
});

describe("webglAvailable", () => {
  it("répond non dans jsdom", () => {
    expect(webglAvailable()).toBe(false);
  });

  it("répond oui quand un contexte WebGL se crée", () => {
    simulerWebGL();
    expect(webglAvailable()).toBe(true);
  });

  it("répond non si la création du contexte lève", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("GPU bloqué");
    });
    expect(webglAvailable()).toBe(false);
  });
});

describe("useRenderMode", () => {
  it("sans WebGL : 2D, et la 3D n'est pas proposée", () => {
    const { result } = renderHook(() => useRenderMode());
    expect(result.current).toMatchObject({ mode: "2d", possible: false });
  });

  it("avec WebGL : 3D d'office, et la bascule est retenue", () => {
    simulerWebGL();
    const { result } = renderHook(() => useRenderMode());
    expect(result.current).toMatchObject({ mode: "3d", possible: true });

    act(() => result.current.toggle());
    expect(result.current.mode).toBe("2d");
    expect(window.localStorage.getItem("vaultrush_render")).toBe("2d");

    act(() => result.current.toggle());
    expect(result.current.mode).toBe("3d");
    expect(window.localStorage.getItem("vaultrush_render")).toBe("3d");
  });
});

describe("RenderToggle", () => {
  it("n'affiche rien quand la 3D est impossible", () => {
    const { container } = render(<RenderToggle mode="2d" possible={false} onToggle={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("est un bouton bascule à libellé fixe", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<RenderToggle mode="3d" possible onToggle={onToggle} />);
    const bouton = screen.getByRole("button", { name: "Vue 3D" });
    expect(bouton).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(bouton);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<RenderToggle mode="2d" possible onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "Vue 3D" })).toHaveAttribute("aria-pressed", "false");
  });
});
