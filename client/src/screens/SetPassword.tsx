import { useState, type FormEvent } from "react";
import { auth, type Account } from "../api.ts";
import { Button, Field, PageTitle, Toast } from "../components/index.ts";
import { errorMessage } from "../lib/messages.ts";

export type SetPasswordProps = {
  username: string;
  onDone: (account: Account) => void;
  onCancel: () => void;
};

/**
 * Les comptes créés avant les mots de passe n'en ont pas : la connexion répond
 * 409 `password_required` et amène ici. Le serveur pose le hash puis ouvre la
 * session ; le client ne devine jamais de mot de passe à la place du joueur.
 */
export function SetPassword({ username, onDone, onCancel }: SetPasswordProps) {
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function envoyer(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      onDone(await auth.setPassword(username, newPassword));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageTitle eyebrow="Compte existant">Définir un mot de passe</PageTitle>

      <Toast kind="info">
        Ce compte a été créé avant les mots de passe. Choisis-en un maintenant : il sera demandé aux
        prochaines connexions.
      </Toast>

      {error ? <Toast kind="bad">{error}</Toast> : null}

      <form className="panel form" onSubmit={(event) => void envoyer(event)} noValidate>
        <Field label="Pseudo" id="pseudo-existant">
          <input value={username} readOnly />
        </Field>

        <Field label="Nouveau mot de passe" id="nouveau-mot-de-passe" hint="8 caractères minimum">
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Field>

        <Button variant="primary" type="submit" pending={pending}>
          Définir et se connecter
        </Button>
        <Button variant="quiet" onClick={onCancel} disabled={pending}>
          Revenir à la connexion
        </Button>
      </form>
    </>
  );
}
