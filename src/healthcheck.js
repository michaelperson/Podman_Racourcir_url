// Sonde de santé exécutée DANS le conteneur (compose, Quadlet, kube).
// Pas besoin de curl ni wget dans l'image : Node.js 18+ fournit fetch().
// Code de sortie 0 = sain, 1 = malade.
const port = Number(process.env.PORT) || 3000;

fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) })
  .then((reponse) => process.exit(reponse.ok ? 0 : 1))
  .catch(() => process.exit(1));
