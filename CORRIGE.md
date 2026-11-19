# Corrigé du cas pratique final (document formateur)

> Branche `solutions` uniquement. Ne pas diffuser aux apprenants avant le débriefing 3.10.

Ce document donne, critère par critère, une solution de référence, les commandes
pour la démontrer et les pièges observés. Il ne prétend pas être la seule solution :
toute réponse qui satisfait le critère et que l'apprenant sait expliquer est valable.

## Fichiers de la solution

| Fichier | Rôle |
|---------|------|
| `Containerfile` | build multi-stage, non-root (UID 1000), npm retiré de l'image finale |
| `.containerignore` | contexte de build minimal (pas de `node_modules`, `.env`, `secrets/`, `.git`) |
| `compose.yaml` | app + MongoDB, volume nommé, secret, healthchecks, `depends_on: service_healthy`, durcissement |
| `src/config.js` | **correction de la panne** : `HOST` vaut `0.0.0.0` par défaut |
| `src/healthcheck.js` | sonde de santé en Node.js (pas besoin de curl/wget dans l'image) |
| `package.json`, `package-lock.json` | **lodash 4.17.11 → 4.18.1** (vulnérabilité critique corrigée) |
| `quadlet/` | bonus Quadlet : réseau, volume, deux unités `.container` |
| `.github/workflows/build.yml` | bonus CI : build Podman, scan Trivy épinglé, publication ghcr.io |

## Versions retenues (vérifiées le 2026-11-20)

| Composant | Tag épinglé | Pourquoi | Source |
|-----------|-------------|----------|--------|
| Node.js (image) | `docker.io/library/node:26.13.1-alpine3.24` | Node 26 est LTS (« Lithium ») depuis le 2026-10-28 ; 26.13.1 publiée le 2026-11-10, support actif jusqu'au 2027-10-27, fin de vie 2029-04-30 | <https://nodejs.org/dist/index.json>, <https://endoflife.date/nodejs>, <https://hub.docker.com/_/node/tags> |
| MongoDB (image) | `docker.io/library/mongo:8.0.38` | branche 8.0 : version majeure (non « Rapid Release »), maintenue jusqu'au 2029-10-31, la plus documentée. 9.0.8 existe aussi (fin de vie 2031-10-31) et conviendrait | <https://endoflife.date/mongodb>, <https://hub.docker.com/_/mongo/tags>, <https://www.mongodb.com/legal/support-policy/lifecycles> |
| Trivy (image) | `docker.io/aquasec/trivy:0.76.2` | dernière release (2026-11-05). **Jamais** 0.69.4 (binaire compromis), ni les images 0.69.5 et 0.69.6 (malveillantes), mars 2026 | <https://github.com/aquasecurity/trivy/releases/tag/v0.76.2>, <https://hub.docker.com/r/aquasec/trivy/tags> |
| express | `5.2.1` | Express 5, stable | `npm view express` |
| mongodb (driver) | `7.9.1` | dernière version, Node ≥ 20.19 | `npm view mongodb` |
| lodash | `4.17.11` (main) → `4.18.1` (solutions) | dépendance volontairement datée, voir critère 6 | `npm view lodash` |
| actions/checkout | `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1) | action épinglée par SHA | <https://github.com/actions/checkout/releases/tag/v7.0.1> |

À revérifier avant chaque session (faits volatils).

## Préparation : le fichier du secret

```bash
mkdir -p secrets
printf '%s' 'un-mot-de-passe-solide' > secrets/mongo_password.txt
chmod 644 secrets/mongo_password.txt
```

Pièges observés pendant la préparation :

- **Fin de ligne Windows (CRLF).** Un fichier créé sous Windows (Notepad, `openssl`
  de Git Bash, `echo` PowerShell) se termine par `\r\n`. L'entrypoint de l'image `mongo`
  ne retire que le `\n` : l'utilisateur est créé avec un mot de passe qui finit par `\r`,
  l'application (qui fait un `trim()`) envoie le mot de passe sans `\r`, et MongoDB
  répond `Authentication failed`. Symptôme dans les logs de l'app :
  `MongoDB injoignable (tentative n/10) : Authentication failed.`
  Correctif : recréer le fichier sans fin de ligne (`printf '%s'`, ou sous PowerShell
  `Set-Content -NoNewline secrets/mongo_password.txt 'motdepasse'`), puis
  `podman compose down -v` : l'utilisateur racine n'est créé **qu'au premier démarrage**,
  sur un volume vide.
- **Droits du fichier en rootless.** En rootless, le propriétaire du fichier sur l'hôte
  devient `root` dans le conteneur. Un fichier en `600` est illisible par l'utilisateur
  `node` (UID 1000) de l'application : `EACCES` au démarrage. D'où le `chmod 644`
  (ou, mieux, un secret Podman : `podman secret create`, monté en `0444` par défaut).
- **SELinux (Fedora, RHEL).** Selon le fournisseur compose, le fichier du secret est
  monté en bind mount sans réétiquetage : si l'app ou mongo ne peut pas le lire
  (`Permission denied` malgré les droits), `chcon -Rt container_file_t secrets/`.

## Critère 1 : multi-stage et non-root

Solution : `Containerfile` en deux étapes (`deps` : `npm ci --omit=dev` ; `runtime` :
copie des seuls `node_modules`, `src`, `public`), `USER 1000:1000`, fichiers
appartenant à root (l'application ne peut pas modifier son propre code).

```bash
podman build -t localhost/raccourcisseur-url:1.0.0 .
podman run --rm localhost/raccourcisseur-url:1.0.0 id
# uid=1000(node) gid=1000(node) groups=1000(node)
podman inspect -f '{{.Config.User}}' localhost/raccourcisseur-url:1.0.0     # 1000:1000
podman compose exec app id
```

Points à faire expliquer : pourquoi copier `package*.json` avant le code (cache) ;
pourquoi `npm ci` plutôt que `npm install` ; pourquoi `CMD ["node", ...]` en forme
exec plutôt que `npm start` (PID 1, réception de SIGTERM).

## Critère 2 : `podman compose` et services qui répondent

```bash
podman compose up -d --build
podman compose ps
curl http://localhost:8080/health          # {"status":"ok","mongo":"ok"}
curl -X POST http://localhost:8080/api/links -H "Content-Type: application/json" \
     -d '{"url":"https://www.bstorm.be"}'   # renvoie un code court
curl -i http://localhost:8080/<code>        # 302, Location: https://www.bstorm.be
curl http://localhost:8080/api/links        # clicks incrémenté
```

Ce critère n'est atteignable qu'**après** la correction de la panne (critère 7).

## Critère 3 : persistance

Volume nommé `mongo-data` monté sur `/data/db`.

```bash
podman compose down            # supprime les conteneurs, PAS les volumes
podman volume ls               # raccourcisseur_mongo-data toujours là
podman compose up -d
curl http://localhost:8080/api/links      # les liens et leurs compteurs sont toujours là
```

`podman compose down -v` supprime le volume : à montrer comme contre-exemple.

## Critère 4 : healthchecks au vert

Déclarés dans `compose.yaml` (au format OCI, le `HEALTHCHECK` d'un Containerfile est
ignoré par `podman build`). MongoDB : `mongosh ... db.adminCommand('ping')`.
App : `node src/healthcheck.js` (appelle `/health`, qui pingue MongoDB).
L'app attend `mongo` en `service_healthy`.

```bash
podman compose ps                                   # (healthy) sur les deux services
podman inspect -f '{{.State.Health.Status}}' raccourcisseur_app_1   # nom selon le fournisseur
podman healthcheck run <conteneur>; echo $?         # 0 = sain
```

Remarque : sous Podman, les healthchecks périodiques sont planifiés par des timers
systemd. Sans systemd (certains environnements imbriqués ou CI), l'état reste
`starting` : `podman healthcheck run` permet alors de les déclencher à la main.

## Critère 5 : aucun secret dans l'image ni dans le dépôt

- Le mot de passe est dans `secrets/mongo_password.txt`, ignoré par `.gitignore` et
  par `.containerignore`.
- `compose.yaml` ne contient que des chemins (`*_FILE`), pas de valeur.
- L'application lit `MONGO_PASSWORD_FILE` ; rien dans `ENV` ni dans l'historique de l'image.

```bash
git status --ignored                          # secrets/ et .env apparaissent comme ignorés
git log -p | grep -i password                 # aucune valeur
podman history --no-trunc localhost/raccourcisseur-url:1.0.0 | grep -i pass   # rien
podman inspect -f '{{.Config.Env}}' localhost/raccourcisseur-url:1.0.0        # pas de mot de passe
podman compose exec app env | grep -i pass    # seulement MONGO_PASSWORD_FILE=/run/secrets/...
```

Erreurs typiques : `MONGO_PASSWORD=...` en clair dans `compose.yaml`, `COPY . .` sans
`.containerignore` (le `.env` part dans l'image), secret commité « pour tester ».

## Critère 6 : plus de vulnérabilité critique corrigeable

La dépendance volontairement datée est **lodash 4.17.11**, utilisée de façon anodine
(`_.trim`, `_.pick`). Aucun risque réel en local : les fonctions vulnérables
(`defaultsDeep`, `zipObjectDeep`, `template`...) ne sont pas appelées.

Scanner une image locale avec Trivy en conteneur (sans installer Trivy) :

```bash
podman save -o raccourcisseur.tar localhost/raccourcisseur-url:1.0.0
podman run --rm \
  -v ./raccourcisseur.tar:/image.tar:ro,Z \
  -v trivy-cache:/root/.cache \
  docker.io/aquasec/trivy:0.76.2 \
  image --input /image.tar --severity HIGH,CRITICAL --ignore-unfixed
```

Pour un verdict binaire (utile en CI) : `--severity CRITICAL --ignore-unfixed --exit-code 1`.

**Avant** (image naïve `FROM node:26.13.1-alpine3.24`, `COPY . .`, `npm ci`), résultat
obtenu le 2026-11-20 avec Trivy 0.76.2, `--ignore-unfixed` :

| Cible | Paquet | Vulnérabilité | Sévérité | Corrigée en |
|-------|--------|---------------|----------|-------------|
| `app/node_modules` | lodash 4.17.11 | CVE-2019-10744 (prototype pollution, `defaultsDeep`) | **CRITICAL** | 4.17.12 |
| `app/node_modules` | lodash 4.17.11 | CVE-2020-8203, CVE-2021-23337, CVE-2026-4800 | HIGH | 4.17.19 / 4.17.21 / 4.18.0 |
| npm embarqué (`/usr/local/lib/node_modules/npm`) | undici 6.28.0, brace-expansion 5.0.9 | 6 CVE | HIGH | versions récentes |
| alpine 3.24.4 | libcrypto3, libssl3, zlib | 11 CVE | MEDIUM | 3.5.9-r1 / 1.4-r0 |

Soit **1 CRITICAL, 9 HIGH** côté Node.js.

Correction :

```bash
npm install --save-exact lodash@4.18.1     # met à jour package.json ET package-lock.json
npm audit                                  # found 0 vulnerabilities
```

Durcissements complémentaires de la solution (vont au-delà du critère) :
`apk upgrade --no-cache` dans l'étape finale (correctifs OpenSSL, zlib) et suppression
de `npm`/`npx` de l'image d'exécution (ils ne servent pas à faire tourner l'app et
embarquent leurs propres dépendances vulnérables).

**Après** (image de la solution) : **0 vulnérabilité**, toutes sévérités confondues,
au 2026-11-20. Le résultat évoluera avec la base de Trivy : le critère porte sur les
CRITICAL **corrigeables** (`--ignore-unfixed`).

Questions de débriefing : pourquoi épingler Trivy (incident de mars 2026) ? Pourquoi
`npm audit` signalait déjà le problème au `npm install` ? Pourquoi une vulnérabilité
dans npm compte-t-elle alors que l'app ne l'utilise pas ?

## Critère 7 : la panne semée

### Symptôme

- `podman compose up` : les conteneurs sont `Up`, les logs de l'app disent
  `Raccourcisseur d'URL à l'écoute sur le port 3000` puis `Connecté à MongoDB`.
- Depuis le poste : `curl http://localhost:8080` échoue (`Connection refused`,
  `Connection reset by peer` ou `Empty reply from server` selon le moteur et le mode réseau).
- Hors conteneur (`npm start`), tout fonctionne : la panne est invisible pour
  l'équipe de développement.

### Cause

Dans `src/config.js` : `host: process.env.HOST || 'localhost'`. Le serveur écoute sur
l'interface de bouclage **du conteneur** (`localhost` se résout en `::1` ou
`127.0.0.1` selon l'image). Or un port publié (`-p 8080:3000`, `ports:`) livre les
connexions sur l'interface réseau du conteneur (`eth0`), jamais sur son `lo`.
Le `localhost` du conteneur n'est pas celui du poste : chaque conteneur a son propre
espace de noms réseau.

Le défaut est discret : `HOST` est bien documenté dans le README et `.env.example`,
avec la valeur `localhost`, qui paraît naturelle à un développeur.

### Diagnostic (commandes qui révèlent la panne)

```bash
podman compose ps                          # app Up, port 8080->3000 publié : « tout va bien »
podman port <conteneur-app>                # 3000/tcp -> 0.0.0.0:8080 : la publication est correcte
curl -v http://localhost:8080/health       # échec côté poste
podman compose logs app                    # « à l'écoute sur le port 3000 » : le processus tourne
podman compose exec app wget -qO- http://localhost:3000/health   # OK DANS le conteneur
podman compose exec app netstat -tln       # busybox (image alpine) :
#   tcp   0   0 ::1:3000   :::*   LISTEN    <- écoute sur le loopback seulement
podman compose exec app cat /proc/net/tcp /proc/net/tcp6   # alternative sans netstat
podman inspect -f '{{.Config.Env}}' <conteneur-app>        # HOST absent -> défaut du code
grep -rn "HOST" src/                       # host: process.env.HOST || 'localhost'
```

La démarche attendue : « le port est publié, le processus écoute, ça marche de
l'intérieur mais pas de l'extérieur » → **sur quelle adresse le processus écoute-t-il ?**

Piège pédagogique sur les healthchecks : un healthcheck qui interroge
`http://localhost:3000` **depuis l'intérieur** du conteneur est **vert** malgré la
panne. Celui de la solution vise `127.0.0.1` : dans l'image alpine, `localhost` se
résout en `::1`, il serait donc rouge avec la panne. Le résultat dépend de l'adresse
visée : bonne occasion de rappeler qu'un healthcheck interne ne prouve pas que le
service est joignable de l'extérieur.

### Correction

Deux niveaux, idéalement les deux :

1. Configuration : `HOST: 0.0.0.0` dans `compose.yaml` (et `ENV HOST=0.0.0.0` dans le
   Containerfile).
2. Code : défaut à `0.0.0.0` dans `src/config.js` (fait dans la solution, avec un
   commentaire). Le README et `.env.example` sont mis à jour.

Une correction par `--network host` est à refuser : elle contourne le problème
au lieu de le comprendre, et supprime l'isolation réseau.

## Bonus

### Quadlet

```bash
podman build -t localhost/raccourcisseur-url:1.0.0 .
podman secret create mongo_password secrets/mongo_password.txt
mkdir -p ~/.config/containers/systemd
cp quadlet/* ~/.config/containers/systemd/
systemctl --user daemon-reload
systemctl --user start raccourcisseur-app.service    # démarre aussi mongo, le réseau et le volume
systemctl --user status raccourcisseur-app.service
curl http://localhost:8080/health
# Démarrage sans session ouverte : loginctl enable-linger $USER
```

`Notify=healthy` : systemd ne considère le service démarré qu'une fois le conteneur
sain ; combiné à `Requires=`/`After=`, c'est l'équivalent de `service_healthy`.
Sous Windows et macOS, Quadlet s'exécute dans la `podman machine` (systemd y tourne) :
`podman machine ssh`. Vérification de la génération sans systemd :
`/usr/libexec/podman/quadlet -dryrun -user`.

### `podman kube generate`

```bash
podman kube generate <conteneur-mongo> <conteneur-app> -f raccourcisseur-kube.yaml
podman compose down
podman kube play raccourcisseur-kube.yaml
podman kube down raccourcisseur-kube.yaml
```

À discuter avec les apprenants en lisant le YAML produit : ce que deviennent le
secret (non transposé tel quel : prévoir un objet `Secret` Kubernetes), le volume
nommé (`persistentVolumeClaim`), les healthchecks et les variables d'environnement.
Non testé ici : relire le manifeste généré avant de le montrer.

### GitHub Actions vers ghcr.io

`.github/workflows/build.yml` : build avec Podman (préinstallé sur `ubuntu-24.04`),
scan Trivy 0.76.2 en conteneur (le job échoue sur une CRITICAL corrigeable), puis
`podman push` vers `ghcr.io/<owner>/raccourcisseur-url` **seulement** sur `main` ou
un tag `v*`, avec le `GITHUB_TOKEN` (permission `packages: write`). L'action
`actions/checkout` est épinglée par SHA. On n'utilise volontairement pas
`aquasecurity/trivy-action`, dont des tags ont été détournés lors de l'incident
de mars 2026.

## Ce qui a été testé, et comment

Tests réalisés le 2026-11-20 avec Docker 29.8.2 (`docker build`, `docker compose`)
et, en complément, avec Podman 6.2.0 + podman-compose 1.6.0 dans un conteneur
`quay.io/podman/stable:v6.2.0` (Podman exécuté en root dans ce conteneur) :

- solution : build, `compose up`, healthchecks au vert, création de lien, redirection
  302, compteur de clics, persistance après `down` puis `up`, `id` = 1000, scan Trivy
  sans aucune vulnérabilité, mot de passe absent de l'image ;
- branche `main` avec un Containerfile naïf : panne reproduite (refus de connexion
  depuis l'hôte, `::1:3000` en écoute dans le conteneur), lodash 4.17.11 remonté en
  CRITICAL par Trivy ;
- unités Quadlet validées par `quadlet -dryrun` (Podman 6.2.0).

**À vérifier par le formateur sur un vrai poste Podman rootless** (non testable ici) :
initialisation de MongoDB et healthchecks périodiques en rootless, lecture du secret
par l'UID 1000 en rootless (droits du fichier), comportement de la panne avec le
réseau par défaut `pasta` (`podman run -p` sans réseau dédié : les versions récentes
de pasta ne relaient plus vers le loopback du conteneur, d'anciennes versions le
faisaient), unités Quadlet réellement démarrées par systemd, et le workflow CI.
