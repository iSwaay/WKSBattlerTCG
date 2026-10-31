# WKS TCG — Règles du mode Arène (auto battler 1 contre 1)

Document de référence. Les valeurs chiffrées sont dans la base (tables `game_config`, `star_levels`, `skills`, `heroes`) et se règlent sans toucher au code.

## 1. Avant la partie
- Chaque joueur choisit **un deck de 20 cartes** (instances de sa collection) et **un héros**.
- Un deck ne peut pas contenir deux cartes identiques **avec le même skill**.
- Chaque carte possède **un seul skill** (tirage selon `skill_rarity_odds`).

## 2. Déroulement d'une partie
La partie est une suite de **manches**, jouées en même temps par les deux joueurs. Elle s'arrête dès que le **héros** d'un joueur tombe à **0 PV ou moins**.

### Phase de préparation (chaque manche)
1. **Énergie** : la jauge max augmente de 1 par manche (départ 1, plafond 10 par défaut, modifié par le héros) et se remplit au début de la manche.
2. **Pioche** : 3 cartes du deck sont proposées. On en pose 1 ou plusieurs en payant leur **coût en énergie** (= `energy_cost` du skill). Les cartes non choisies retournent dans la pioche (qui repose toujours sur les 20 cartes du deck).
3. **Relance** : on peut relancer les 3 choix en payant de l'énergie (`reroll_cost`).
4. **Étoiles** : on peut payer de l'énergie pour passer une carte à l'étoile suivante (`star_levels.upgrade_cost`).
5. **Plateau** : 5 emplacements maximum — **2 à gauche, 1 au centre, 2 à droite**.

### Étoiles
- Toute carte posée commence à **1 étoile**. Maximum **5 étoiles**.
- **3 exemplaires** d'une même carte sur la table fusionnent en **une carte à l'étoile supérieure** (3 × ★1 → ★2, 3 × ★2 → ★3, …).
- Chaque étoile augmente la puissance des valeurs du skill : ★1 +10 %, ★2 +25 %, ★3 +45 %, ★4 +70 %, ★5 +100 % (table `star_levels`). Les durées ne changent pas.

### Combat (automatique, simulé côté serveur)
- Trois lignes : gauche (2), centre (1), droite (2). Les cartes attaquent l'ennemi **en face dans leur ligne** (le premier en vie).
- Un « tick » = une attaque de chaque carte vivante, résolue en même temps.
- **Dégâts** = `ATQ × 100 / (100 + DEF)` (minimum 1). Les PV, ATQ et DEF des cartes gardent leurs valeurs actuelles.
- Le skill se déclenche **tout seul** (voir §4). Durées exprimées en **attaques** du porteur.
- Fin du combat : un camp n'a plus de carte vivante, ou 30 ticks écoulés (le camp qui garde le plus de PV en % gagne ; égalité = aucune perte).

### Fin de manche
- Le héros du **perdant** perd des PV : `numéro de la manche × 1 + somme des étoiles des cartes survivantes du gagnant`.
- **Toutes les cartes réapparaissent** intactes pour la manche suivante, à la même place.

## 3. Héros
Chaque héros a un avantage et une contrepartie ; le niveau 10 réduit l'impact de la contrepartie de 20 %. Un héros gagne de l'XP uniquement en cas de victoire (100 XP par victoire, 10 niveaux : 0 / 100 / 300 / 600 / 1000 / 1500 / 2100 / 2800 / 3600 / 4500 XP).
Les règles précises de chaque héros sont dans `heroes.effects` (JSON).

## 4. Skills
Colonnes principales de `skills` :

| Colonne | Rôle |
|---|---|
| `energy_cost` | coût de la carte (énergie pour la poser) |
| `trigger` | `on_play`, `on_combat_start`, `on_attack`, `every_n_attacks` (+ `trigger_n`), `on_hit`, `on_kill`, `on_death`, `on_hp_below` (+ `trigger_hp_pct`), `passive` |
| `target` | `self`, `target`, `attacker`, `lane_ally`, `all_allies`, `lowest_hp_ally`, `lane_enemy`, `all_enemies`, `random_enemy`, `lowest_hp_enemy`, `highest_atk_enemy`, `own_hero`, `enemy_hero` |
| `damage_atk_pct`, `hits`, `ignore_def_pct`, `lifesteal_pct` | dégâts en % de l'ATQ, nombre de coups, DEF ignorée, vol de vie |
| `damage_done` | dégâts fixes au héros ennemi |
| `heal_max_hp_pct`, `shield_hp_pct`, `hp_max_mod_pct` | soin, bouclier, PV max (en % des PV max de la cible) |
| `atk_mod_pct`, `def_mod_pct`, `duration_turns` | bonus/malus d'ATQ et de DEF en %, durée en attaques (0 = tout le combat) |
| `status_effect`, `status_value`, `status_duration` | poison, burn, bleed, regen (% des PV max par attaque), freeze, stun, silence, taunt, invulnerable, reflect, dodge |
| `self_damage` | PV perdus par le porteur (% de ses PV max) |
| `energy_gain`, `energy_drain` | énergie gagnée / retirée à l'adversaire |
| `cooldown`, `uses_per_combat` | attaques minimum entre deux déclenchements, nombre d'usages max |
| `extra` | règles spéciales : `range` [min,max] (valeur aléatoire), `max_stacks`, `cond`, `execute_below_pct`, `revive`, `cleanse`, `swap_atk_def`, `negate_next_hit`, `free_reroll` |

## 5. Décisions validées
1. **Fusion** : quand 3 exemplaires d'une même carte fusionnent, le joueur **choisit** le skill à garder parmi les 3.
2. **Déplacement** : les cartes se déplacent **librement et gratuitement** pendant la préparation.
3. **Cartes proposées non choisies** : elles **retournent dans la pioche**. La pioche repose toujours sur les 20 cartes du deck : les cartes posées sur la table ne sont jamais retirées du tirage.
4. **Chrono de préparation** : **30 secondes** ; à zéro, la manche démarre.

## 6. À confirmer
- **Contrecoups des héros** (Furieux, etc.) exprimés en % des PV max de la carte pour rester proportionnels.

## 7. Modes de jeu
- **Camp d'entraînement** (disponible) : partie contre un bot (facile / normal / difficile). Le héros gagne de l'XP à chaque victoire.
- **Duel** (menu prêt, bientôt) : PvP asynchrone contre le deck d'un autre joueur.
- **Arène** (menu prêt, bientôt) : PvP en direct, chrono de préparation synchronisé.

Architecture : tout le jeu tourne sur le serveur (edge function `match`, moteur dans `server/engine.js`) ; la partie est stockée dans la table `matches` (inaccessible depuis le navigateur). Le site (`js/battle.js`) n'envoie que des actions (poser, relancer, monter d'étoile, déplacer, prêt) et affiche l'état reçu.
