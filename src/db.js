// Accès à MongoDB : connexion avec nouvelles tentatives, puis collection « links ».
const { MongoClient } = require('mongodb');
const config = require('./config');

const client = new MongoClient(config.mongo.uri, {
  // On échoue vite à chaque tentative ; c'est la boucle ci-dessous qui insiste.
  serverSelectionTimeoutMS: 2000,
});

let links = null; // collection, disponible une fois connecté

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Tente de se connecter plusieurs fois : au démarrage d'une stack,
// la base n'est pas forcément prête quand l'application démarre.
async function connecter() {
  const { retries, retryDelay, host, port } = config.mongo;
  for (let tentative = 1; tentative <= retries; tentative++) {
    try {
      await client.connect();
      await client.db('admin').command({ ping: 1 });
      const collection = client.db(config.mongo.database).collection('links');
      // Un code court est unique
      await collection.createIndex({ code: 1 }, { unique: true });
      links = collection;
      console.log(`Connecté à MongoDB (${host}:${port})`);
      return;
    } catch (err) {
      console.warn(
        `MongoDB injoignable (tentative ${tentative}/${retries}) : ${err.message}`
      );
      if (tentative === retries) throw err;
      await pause(retryDelay);
    }
  }
}

// Vérifie que la base répond (utilisé par /health)
async function ping() {
  await client.db('admin').command({ ping: 1 });
}

function collection() {
  if (!links) throw new Error('Base de données non connectée');
  return links;
}

const estConnecte = () => links !== null;

async function fermer() {
  await client.close();
}

module.exports = { connecter, ping, collection, estConnecte, fermer };
