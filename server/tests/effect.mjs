// compare chaque skill à une carte « neutre » : dégâts infligés, soins, etc. sur 40 combats
import fs from 'fs';
import { buildCfg, normSkill, makeHero, newMatch, simulate } from '../engine.js';
const rows = JSON.parse(fs.readFileSync('/tmp/des/skills.json', 'utf8'));
const cfg = buildCfg([], [1,2,3,4,5].map((i) => ({ stars: i, upgrade_cost: [3,4,5,6,null][i-1], skill_boost_pct: [10,25,45,70,100][i-1] })));
const plain = normSkill({ id: 9999, rarity: 'C', name: 'Neutre', category: 'attack', description: '', energy_cost: 0, trigger: 'passive', target: 'self' });
const hero = makeHero({ id: 'h', name: 'H', base_hp: 100, hp_lvl10: 100, energy_cap: 10, effects: {} }, 1);
const card = (sk, i, hp, atk, def) => ({ uid: 'u'+i, card_id: 'c'+i, hp, atk, def, skill: sk, stars: 1 });
function run(sk) {
  let dmg = 0, heal = 0, win = 0;
  for (let g = 0; g < 40; g++) {
    const st = newMatch(cfg, { seed: 500 + g, now: 0, me: { hero, deck: [] }, bot: { hero: { ...hero, fx: {} }, deck: [] } });
    st.me.board = { L1: card(sk, 1, 180, 40, 10), L2: null, C1: card(plain, 3, 150, 30, 10), R1: null, R2: null };
    st.bot.board = { L1: card(plain, 4, 220, 35, 40), L2: null, C1: card(plain, 5, 220, 35, 40), R1: null, R2: null };
    const r = simulate(cfg, st); if (r.winner === 'me') win++;
    for (const tk of r.ticks) for (const e of tk.ev) {
      if (e.k === 'dmg' && e.a === 'me.L1') dmg += e.d;
      if (e.k === 'heal' && e.u.startsWith('me.')) heal += e.d;
    }
  }
  return { dmg, heal, win };
}
const base = run(plain);
for (const id of [3, 43, 47, 50, 78, 83, 96]) {
  const r = rows.find((x) => x.id === id); const x = run(normSkill(r));
  console.log(String(id).padEnd(3), r.name.padEnd(20), 'dégâts', base.dmg, '→', x.dmg, '| soins', base.heal, '→', x.heal, '| victoires', base.win, '→', x.win);
}
