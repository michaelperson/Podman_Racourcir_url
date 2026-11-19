// Configuration de l'application, lue depuis les variables d'environnement.
// Chaque valeur a un défaut pratique pour le développement en local.
const fs = require('node:fs');

// Lit le mot de passe MongoDB : d'abord depuis un fichier (MONGO_PASSWORD_FILE),
// sinon depuis la variable MONGO_PASSWORD. Le fichier est la voie à privilégier
// pour les secrets : la valeur n'apparaît ni dans l'environnement ni dans les logs.
function lireMotDePasse() {
  const fichier = process.env.MONGO_PASSWORD_FILE;
  if (fichier) {
    return fs.readFileSync(fichier, 'utf8').trim();
  }
  return process.env.MONGO_PASSWORD || '';
}

const config = {
  // Serveur HTTP
  host: process.env.HOST || 'localhost',
  port: Number(process.env.PORT) || 3000,

  // URL publique utilisée pour construire les liens courts.
  // Vide : on la déduit de la requête (en-tête Host).
  publicUrl: process.env.PUBLIC_URL || '',

  // Base MongoDB
  mongo: {
    host: process.env.MONGO_HOST || 'localhost',
    port: Number(process.env.MONGO_PORT) || 27017,
    user: process.env.MONGO_USER || '',
    password: lireMotDePasse(),
    database: process.env.MONGO_DB || 'raccourcisseur',
    // Nombre de tentatives de connexion et délai entre deux tentatives (ms)
    retries: Number(process.env.MONGO_RETRIES) || 10,
    retryDelay: Number(process.env.MONGO_RETRY_DELAY_MS) || 3000,
  },

  // Longueur des codes courts générés
  codeLength: Number(process.env.CODE_LENGTH) || 7,
};

// Construit l'URI de connexion (elle contient le mot de passe : ne jamais la logger).
config.mongo.uri = (() => {
  const { host, port, user, password } = config.mongo;
  const auth = user
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
    : '';
  // authSource=admin : l'utilisateur racine de l'image mongo est créé dans la base admin
  const options = user ? '?authSource=admin' : '';
  return `mongodb://${auth}${host}:${port}/${options}`;
})();

module.exports = config;
