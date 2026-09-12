import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import { Showcase } from "./dev/Showcase.tsx";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";

// Vitrine des composants, en développement seulement : http://127.0.0.1:5173/#showcase
const showcase = import.meta.env.DEV && window.location.hash === "#showcase";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{showcase ? <Showcase /> : <App />}</React.StrictMode>,
);
