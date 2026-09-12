import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { routes } from "../../src/router.tsx";
import { SessionProvider } from "../../src/session.tsx";

/** Monte l'application complète sur une route donnée, session comprise. */
export function renderApp(path = "/") {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
}

/** Enveloppe minimale pour un hook : la session, sans routeur. */
export function sessionWrapper({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
