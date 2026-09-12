import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { ApiError, auth } from "../api.ts";
import { Button, Chip, Field, PageTitle, Toast } from "../components/index.ts";
import { errorMessage } from "../lib/messages.ts";
import { useSession } from "../session.tsx";
import { SetPassword } from "./SetPassword.tsx";

type Onglet = "login" | "register";

/** Connexion et inscription, plus l'aiguillage vers « Définir un mot de passe ». */
export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useSession();

  const [onglet, setOnglet] = useState<Onglet>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Compte hérité sans mot de passe : le serveur répond 409 password_required.
  const [àDéfinir, setÀDéfinir] = useState<string | null>(null);

  const retour = (location.state as { from?: string } | null)?.from ?? "/";

  async function envoyer(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const account =
        onglet === "login"
          ? await auth.login(username, password)
          : await auth.register(username, password);
      signIn(account);
      navigate(retour, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "password_required") {
        setÀDéfinir(username);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setPending(false);
    }
  }

  if (àDéfinir) {
    return (
      <SetPassword
        username={àDéfinir}
        onDone={(account) => {
          signIn(account);
          navigate(retour, { replace: true });
        }}
        onCancel={() => setÀDéfinir(null)}
      />
    );
  }

  return (
    <>
      <PageTitle eyebrow="Coins fictifs · jeu gratuit">
        {onglet === "login" ? "Connexion" : "Inscription"}
      </PageTitle>

      <div className="chips" role="group" aria-label="Connexion ou inscription">
        <Chip selected={onglet === "login"} onClick={() => setOnglet("login")} disabled={pending}>
          Connexion
        </Chip>
        <Chip
          selected={onglet === "register"}
          onClick={() => setOnglet("register")}
          disabled={pending}
        >
          Inscription
        </Chip>
      </div>

      {error ? <Toast kind="bad">{error}</Toast> : null}

      <form className="panel form" onSubmit={(event) => void envoyer(event)} noValidate>
        <Field label="Pseudo" id="pseudo" hint="3 à 20 caractères : lettres, chiffres, _">
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </Field>

        <Field label="Mot de passe" id="mot-de-passe" hint="8 caractères minimum">
          <input
            type="password"
            autoComplete={onglet === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <Button variant="primary" type="submit" pending={pending}>
          {onglet === "login" ? "Se connecter" : "Créer le compte"}
        </Button>
      </form>

      <Toast kind="info">
        Un compte sert à retrouver ton solde et tes parties. Les coins sont fictifs et n'ont aucune
        valeur.
      </Toast>
    </>
  );
}
