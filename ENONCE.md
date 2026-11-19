# Cas pratique final : le Raccourcisseur d'URL

**Durée : 120 minutes, en autonomie.**
Débriefing et auto-évaluation collective ensuite (30 minutes), avec la grille ci-dessous.

## Contexte

Pendant trois jours, vous avez conteneurisé, composé et durci l'application « Quiz »
(Python, FastAPI, PostgreSQL, Redis). Une autre équipe vous confie maintenant
**son** application : un raccourcisseur d'URL écrit en **Node.js** (Express) avec une
base **MongoDB**. Elle fonctionne sur le poste de ses développeurs, hors conteneur
(voir le [README](README.md)). Elle n'a jamais été conteneurisée.

Votre mission : la livrer prête à tourner sous **Podman**, de façon reproductible
et sécurisée. Autre langage, autre base, mêmes réflexes.

Une **panne** a été semée dans l'application fournie. Elle fait partie de
l'exercice : à vous de la trouver, de l'expliquer et de la corriger, avec la
méthode et les outils de diagnostic vus en cours.

## Ce que vous devez produire

Dans votre copie du dépôt (fork ou clone) :

1. un `Containerfile` pour l'application ;
2. un fichier `.containerignore` ;
3. un `compose.yaml` qui lance l'application et MongoDB ;
4. les corrections nécessaires dans le code ou la configuration de l'application ;
5. un court fichier `DIAGNOSTIC.md` : symptôme observé, commandes utilisées pour
   trouver la panne, cause, correction.

## Contraintes

- **Podman** uniquement, en mode **rootless** : `podman build`, `podman compose`.
- Images de base **officielles** et **épinglées** sur un tag précis (jamais `latest`).
- L'image de l'application est construite en **multi-stage** et s'exécute avec un
  **utilisateur non-root**.
- Les données MongoDB sont stockées dans un **volume nommé**.
- Le mot de passe MongoDB passe par un **secret** : il ne doit apparaître ni dans
  l'image, ni dans `compose.yaml`, ni dans l'historique Git.
  L'application sait le lire depuis un fichier (`MONGO_PASSWORD_FILE`, voir le README).
- Chaque service a un **healthcheck** ; l'application ne démarre qu'une fois
  MongoDB en bonne santé.
- L'image est scannée avec **Trivy lancé en conteneur**, dans une **version épinglée**
  (`docker.io/aquasec/trivy:0.76.2` au moment de la rédaction). N'utilisez jamais
  les versions compromises en mars 2026 (0.69.4, 0.69.5, 0.69.6).
- L'application doit être joignable depuis votre navigateur, sur votre poste,
  via un port publié.

## Rappels utiles

- Au format d'image OCI (format par défaut de `podman build`), l'instruction
  `HEALTHCHECK` du Containerfile est ignorée : déclarez les healthchecks dans
  `compose.yaml` (ou construisez avec `--format docker`).
- `podman compose` délègue à un fournisseur (`docker-compose` ou `podman-compose`) :
  vérifiez lequel avec `podman compose version`.
- L'image officielle `mongo` crée un utilisateur racine à partir de
  `MONGO_INITDB_ROOT_USERNAME` et `MONGO_INITDB_ROOT_PASSWORD_FILE`, **au premier
  démarrage seulement** (volume de données vide).
- Les fichiers de secrets restent hors du dépôt : vérifiez votre `.gitignore`
  avant chaque commit.

## Déroulé conseillé

| Temps indicatif | Étape                                                                |
|-----------------|----------------------------------------------------------------------|
| 10 min          | Lire le README et le code, lancer l'application hors conteneur si possible |
| 25 min          | Containerfile multi-stage non-root, premier build, premier lancement  |
| 30 min          | `compose.yaml` : MongoDB, volume, secret, healthchecks, dépendances   |
| 25 min          | Diagnostic et correction de la panne                                  |
| 20 min          | Scan Trivy, correction, nouveau scan                                  |
| 10 min          | Auto-évaluation avec la grille, `DIAGNOSTIC.md`                       |

## Grille d'évaluation (formative)

Cochez chaque critère quand vous pouvez le **démontrer** (commande et résultat à l'appui).

- [ ] 1. L'image se construit en multi-stage et s'exécute en utilisateur non-root.
- [ ] 2. L'application démarre avec `podman compose` et tous ses services répondent.
- [ ] 3. Les données survivent à la suppression des conteneurs.
- [ ] 4. Les healthchecks sont définis et au vert.
- [ ] 5. Aucun secret n'est présent dans l'image, ni en clair dans le dépôt.
- [ ] 6. Le scan Trivy ne remonte plus de vulnérabilité critique corrigeable.
- [ ] 7. La panne semée est identifiée, expliquée et corrigée.

## Bonus (pour les plus rapides)

- [ ] Une unité **Quadlet** qui fait tourner l'application (et sa base) sous systemd.
- [ ] Un manifeste Kubernetes produit avec `podman kube generate`, rejoué avec
      `podman kube play`.
- [ ] Un workflow **GitHub Actions** qui construit l'image, la scanne avec Trivy
      (version épinglée) et la publie sur `ghcr.io`.
