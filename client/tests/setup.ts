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
