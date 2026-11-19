// Application Express : sondes, API, page d'accueil statique et redirection.
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const _ = require('lodash');
const config = require('./config');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '10kb' }));

// Champs d'un lien renvoyés par l'API
const CHAMPS_PUBLICS = ['code', 'url', 'clicks', 'createdAt'];

// Génère un code court aléatoire (caractères sûrs pour une URL)
function genererCode() {
  return crypto
    .randomBytes(config.codeLength)
    .toString('base64url')
    .slice(0, config.codeLength);
}

// Accepte uniquement les URL http(s) bien formées
function urlValide(valeur) {
  try {
    const url = new URL(valeur);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// URL de base pour afficher le lien court
function baseUrl(req) {
  return config.publicUrl || `${req.protocol}://${req.get('host')}`;
}

// Mise en forme d'un lien pour la réponse JSON
function presenter(lien, req) {
  return {
    ..._.pick(lien, CHAMPS_PUBLICS),
    shortUrl: `${baseUrl(req)}/${lien.code}`,
  };
}

// --- Sondes ------------------------------------------------------------------

// /health : l'application ET la base répondent
app.get('/health', async (req, res) => {
  try {
    await db.ping();
    res.json({ status: 'ok', mongo: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'erreur', mongo: err.message });
  }
});

// /ready : l'application a fini de démarrer (connexion et index en place)
app.get('/ready', (req, res) => {
  if (db.estConnecte()) {
    res.json({ status: 'prêt' });
  } else {
    res.status(503).json({ status: 'en démarrage' });
  }
});

// --- API ---------------------------------------------------------------------

// Crée un lien court à partir d'une URL longue
app.post('/api/links', async (req, res, next) => {
  try {
    const url = _.trim(req.body && req.body.url);
    if (!urlValide(url)) {
      return res.status(400).json({ error: 'URL invalide (http ou https attendu)' });
    }
    const lien = { code: genererCode(), url, clicks: 0, createdAt: new Date() };
    await db.collection().insertOne(lien);
    res.status(201).json(presenter(lien, req));
  } catch (err) {
    next(err);
  }
});

// Liste les 100 liens les plus récents
app.get('/api/links', async (req, res, next) => {
  try {
    const liste = await db
      .collection()
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    res.json(liste.map((lien) => presenter(lien, req)));
  } catch (err) {
    next(err);
  }
});

// --- Front -------------------------------------------------------------------

// Page HTML statique, servie telle quelle (pas d'étape de build)
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Redirection -------------------------------------------------------------

// GET /:code : incrémente le compteur de clics puis redirige
app.get('/:code', async (req, res, next) => {
  try {
    const lien = await db
      .collection()
      .findOneAndUpdate({ code: req.params.code }, { $inc: { clicks: 1 } });
    if (!lien) {
      return res.status(404).json({ error: 'Lien inconnu' });
    }
    res.redirect(302, lien.url);
  } catch (err) {
    next(err);
  }
});

// Gestion d'erreur centralisée : aucun détail interne renvoyé au client
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne' });
});

module.exports = app;
