-- L'état secret d'une partie, sérialisé en JSON : c'est lui qui permet à un jeu
-- d'avoir autre chose qu'une étape et un multiplicateur (un code à trouver, un
-- chemin de bille, une main de cartes) sans toucher au reste du schéma.
--
-- SQLite ajoute une colonne sans reconstruire la table : aucune donnée n'est
-- touchée, et les parties déjà ouvertes gardent state_json à NULL (leur moteur
-- reconstruit son état depuis mode/step/multiplier).
ALTER TABLE rounds ADD COLUMN state_json TEXT;
