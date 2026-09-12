import express from "express";
import { router } from "./router.ts";

const app = express();
app.use(express.json());

// CORS simple pour permettre au frontend (autre port) d'appeler l'API.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", router);

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`Vault Rush API en écoute sur http://localhost:${PORT}`);
});
