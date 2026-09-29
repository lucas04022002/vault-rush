import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * jsdom installe SON AbortController sur `globalThis`, alors que le `Request`
 * de Node (undici) n'accepte que le signal de Node : `new Request(url, { signal })`
 * échoue donc dès que react-router prépare une navigation, et toute redirection
 * (y compris les gardes de route) casserait en test alors qu'elle marche dans un
 * vrai navigateur, où les deux viennent de la même implémentation.
 *
 * Contournement limité aux tests : on ne passe plus le signal à undici, on le
 * garde sur la requête telle qu'elle a été demandée.
 */
const RealRequest = globalThis.Request;

class JsdomFriendlyRequest extends RealRequest {
  private readonly providedSignal?: AbortSignal;

  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const { signal, ...rest } = init ?? {};
    super(input, rest);
    if (signal) this.providedSignal = signal;
  }

  override get signal(): AbortSignal {
    return this.providedSignal ?? super.signal;
  }
}

globalThis.Request = JsdomFriendlyRequest as unknown as typeof Request;

afterEach(() => {
  cleanup();
});

/**
 * jsdom n'a pas de WebGL : `getContext` y écrit « Not implemented » en console à
 * chaque appel. Un canvas de test ne dessine rien, et `webglAvailable()` doit y
 * répondre « non » sans bruit. Un test qui veut simuler WebGL remplace ce stub par
 * `vi.spyOn(HTMLCanvasElement.prototype, "getContext")`.
 */
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}

/**
 * jsdom devrait fournir localStorage, mais vérifier que les méthodes sont disponibles.
 */
if (typeof window !== "undefined" && (!window.localStorage || typeof window.localStorage.clear !== "function")) {
  const store: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((key) => {
          delete store[key];
        });
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      length: Object.keys(store).length,
    } as Storage,
    writable: true,
    configurable: true,
  });
}
