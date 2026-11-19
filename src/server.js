// Point d'entrée : démarrage du serveur HTTP puis connexion à la base.
const app = require('./app');
const config = require('./config');
const db = require('./db');

const server = app.listen(config.port, config.host, () => {
  console.log(`Raccourcisseur d'URL à l'écoute sur le port ${config.port}`);
});

// Le serveur répond tout de suite (/ready renvoie 503 tant que la base
// n'est pas connectée) ; on abandonne si la base reste injoignable.
db.connecter().catch((err) => {
  console.error(`Abandon : MongoDB injoignable (${err.message})`);
  process.exit(1);
});

// Arrêt propre sur SIGTERM (envoyé à l'arrêt du conteneur) et SIGINT (Ctrl+C)
function arreter(signal) {
  console.log(`${signal} reçu, arrêt en cours...`);
  server.close(async () => {
    await db.fermer();
    process.exit(0);
  });
  // Filet de sécurité si des connexions restent ouvertes
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => arreter('SIGTERM'));
process.on('SIGINT', () => arreter('SIGINT'));
