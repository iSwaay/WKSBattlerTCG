# WKSBattlerTCG

TCG


## Duel entre joueurs
- Fonction serveur : `server/duel/index.ts` (+ `server/engine.js` minifié en `engine.js` au déploiement). Table `duels` (RLS activée, accès uniquement via la fonction).
- Flux : Créer un duel → code à 6 caractères (15 min) ou invitation d'un ami → l'adversaire rejoint avec son deck → préparation simultanée (chrono commun), « Prêt » des deux joueurs (ou fin du chrono) → combat rejoué chez les deux → fin quand un héros tombe à 0 PV.
- Récompense : XP de héros pour le vainqueur (comme contre un bot) ; abandon avant la manche 2 = aucune XP.
- Tests : `node server/tests/pvp.mjs` (moteur) et `NODE_PATH=$(npm root -g) node server/tests/pvp-ui.mjs` (deux navigateurs).
