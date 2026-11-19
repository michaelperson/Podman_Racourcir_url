# Raccourcisseur d'URL

Petite application web qui transforme une URL longue en lien court, puis redirige
les visiteurs du lien court vers l'URL d'origine en comptant les clics.

Application support du **cas pratique final** du cours *Podman pour développeurs*
(BStorm). Les consignes du cas pratique sont dans [ENONCE.md](ENONCE.md).

## Pile technique

| Élément        | Choix                                              |
|----------------|----------------------------------------------------|
| Langage        | Node.js 24 ou plus récent (LTS)                    |
| Framework web  | Express 5                                          |
| Base de données| MongoDB (driver officiel `mongodb`)                |
| Front          | Une page HTML statique servie par Express (`public/`) |

Les dépendances sont épinglées dans `package.json` et `package-lock.json`
(installation reproductible avec `npm ci`).

## Arborescence

```
.
├── package.json         dépendances et script de démarrage
├── package-lock.json    versions exactes de tout l'arbre de dépendances
├── public/
│   └── index.html       mini front (formulaire + liste des liens)
├── src/
│   ├── server.js        point d'entrée : démarre le serveur HTTP, connecte la base
│   ├── app.js           routes Express (API, sondes, redirection)
│   ├── db.js            connexion MongoDB avec nouvelles tentatives
│   └── config.js        lecture des variables d'environnement
├── .env.example         modèle de configuration locale
└── ENONCE.md            consignes du cas pratique
```

## Routes

| Méthode | Chemin        | Rôle                                                         |
|---------|---------------|--------------------------------------------------------------|
| GET     | `/`           | page d'accueil (formulaire)                                  |
| POST    | `/api/links`  | crée un lien court. Corps JSON : `{ "url": "https://..." }`  |
| GET     | `/api/links`  | liste les 100 liens les plus récents, avec leur compteur     |
| GET     | `/:code`      | redirige (302) vers l'URL d'origine et incrémente le compteur|
| GET     | `/health`     | 200 si l'application **et** MongoDB répondent, 503 sinon     |
| GET     | `/ready`      | 200 quand le démarrage est terminé (base connectée), 503 avant |

## Variables d'environnement

| Variable               | Défaut            | Rôle                                                        |
|------------------------|-------------------|-------------------------------------------------------------|
| `HOST`                 | `localhost`       | adresse d'écoute du serveur HTTP                            |
| `PORT`                 | `3000`            | port d'écoute du serveur HTTP                               |
| `PUBLIC_URL`           | *(vide)*          | URL publique des liens courts ; vide = déduite de la requête |
| `MONGO_HOST`           | `localhost`       | hôte MongoDB                                                |
| `MONGO_PORT`           | `27017`           | port MongoDB                                                |
| `MONGO_DB`             | `raccourcisseur`  | nom de la base                                              |
| `MONGO_USER`           | *(vide)*          | utilisateur MongoDB ; vide = connexion sans authentification |
| `MONGO_PASSWORD`       | *(vide)*          | mot de passe en clair (à réserver au développement)         |
| `MONGO_PASSWORD_FILE`  | *(vide)*          | chemin d'un fichier contenant le mot de passe ; prioritaire sur `MONGO_PASSWORD` |
| `MONGO_RETRIES`        | `10`              | nombre de tentatives de connexion à MongoDB au démarrage    |
| `MONGO_RETRY_DELAY_MS` | `3000`            | délai entre deux tentatives, en millisecondes               |
| `CODE_LENGTH`          | `7`               | longueur des codes courts générés                           |

Avec `MONGO_USER` renseigné, l'application s'authentifie auprès de la base `admin`
(`authSource=admin`), comme l'utilisateur racine créé par l'image officielle `mongo`
via `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD`.

## Lancer l'application hors conteneur

Prérequis : Node.js 24 ou plus récent, et un serveur MongoDB accessible
(par défaut sur `localhost:27017`).

```bash
# 1. Installer les dépendances (versions exactes du package-lock.json)
npm ci

# 2. Préparer la configuration locale
cp .env.example .env      # sous PowerShell : Copy-Item .env.example .env
# ... puis adapter .env si besoin (hôte, utilisateur, mot de passe MongoDB)

# 3. Démarrer
npm start
```

Le script `npm start` charge automatiquement le fichier `.env` s'il existe
(option `--env-file-if-exists` de Node.js).

Ouvrir ensuite <http://localhost:3000>, coller une URL longue, puis cliquer sur le
lien court obtenu : le compteur de clics augmente dans la liste.

Vérifications rapides en ligne de commande :

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/api/links \
     -H "Content-Type: application/json" \
     -d '{"url":"https://www.bstorm.be"}'
curl http://localhost:3000/api/links
```

Si MongoDB n'est pas joignable, l'application réessaie `MONGO_RETRIES` fois
(un message par tentative dans les logs), puis s'arrête avec un code d'erreur.

## Licence

Apache 2.0, voir [LICENSE](LICENSE).
