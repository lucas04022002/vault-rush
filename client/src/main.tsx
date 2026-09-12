import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router";
import { routes } from "./router.tsx";
import { SessionProvider } from "./session.tsx";
import { Showcase } from "./dev/Showcase.tsx";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";

// Vitrine des composants, en développement seulement : http://127.0.0.1:5173/#showcase
const showcase = import.meta.env.DEV && window.location.hash === "#showcase";

const router = createBrowserRouter(routes);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {showcase ? (
      <Showcase />
    ) : (
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    )}
  </React.StrictMode>,
);
