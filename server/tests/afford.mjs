import { buildCfg, normSkill, makeHero, newMatch, view } from '../engine.js';
const cfg = buildCfg([], [1,2,3,4,5].map((i) => ({ stars: i, upgrade_cost: [3,4,5,6,null][i-1], skill_boost_pct: [10,25,45,70,100][i-1] })));
const sk = (id, c) => normSkill({ id, rarity: 'C', name: 's' + id, category: 'attack', energy_cost: c, trigger: 'on_attack', target: 'target', damage_atk_pct: 50 });
const hero = makeHero({ id: 'h', name: 'H', base_hp: 100, hp_lvl10: 100, energy_cap: 10, effects: {} }, 1);
let bad = 0;
for (let g = 0; g < 2000; g++) {
  // deck : 18 cartes à coût >= 2 et 2 cartes à coût 1
  const deck = Array.from({ length: 20 }, (_, i) => ({ card_id: 'c' + i, hp: 100, atk: 30, def: 10, skill: sk(i, i < 2 ? 1 : 2 + (i % 4)) }));
  const st = newMatch(cfg, { seed: g + 1, now: 0, me: { hero: { ...hero, fx: {} }, deck }, bot: { hero: { ...hero, fx: {} }, deck }, difficulty: 'normal' });
  const v = view(st, cfg); if (!v.me.offer.some((o) => o && o.cost <= v.me.energy)) bad++;
}
console.log('manches 1 sans carte jouable (deck avec 2 cartes à 1 ⚡ sur 20) :', bad, '/ 2000');
