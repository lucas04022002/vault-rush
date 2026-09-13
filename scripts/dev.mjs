// Lance l'API (Node, port 3001) et le client (Vite, port 5173) dans le même terminal.
// Ctrl+C arrête les deux.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// On lance npm par son point d'entrée JS avec le Node courant : pas de shell, pas de .cmd.
const npmCli = [
  join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
].find(existsSync);
if (!npmCli) {
  console.error("npm introuvable à côté de node ; lance `npm run dev:server` et `npm run dev:client` séparément.");
  process.exit(1);
}
const procs = [
  ["api", ["run", "dev", "--workspace=server"]],
  ["web", ["run", "dev", "--workspace=client"]],
].map(([name, args]) => {
  const child = spawn(process.execPath, [npmCli, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (chunk, out) => {
    for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) out.write(`[${name}] ${line}\n`);
  };
  child.stdout.on("data", (c) => prefix(c, process.stdout));
  child.stderr.on("data", (c) => prefix(c, process.stderr));
  child.on("exit", (code) => {
    if (code !== null && code !== 0) console.error(`[${name}] arrêté avec le code ${code}`);
  });
  return child;
});

const stop = () => {
  for (const p of procs) if (!p.killed) p.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log("API sur http://127.0.0.1:3001 · client sur http://127.0.0.1:5173 (Ctrl+C pour tout arrêter)");
