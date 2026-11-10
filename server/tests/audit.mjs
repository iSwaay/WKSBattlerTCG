import fs from 'fs';
import { buildCfg, normSkill, makeHero, newMatch, simulate } from '../engine.js';
const rows = JSON.parse(fs.readFileSync('/tmp/des/skills.json', 'utf8'));
const cfg = buildCfg([], [1,2,3,4,5].map((i) => ({ stars: i, upgrade_cost: [3,4,5,6,null][i-1], skill_boost_pct: [10,25,45,70,100][i-1] })));
const plain = normSkill({ id: 9999, rarity: 'C', name: 'Neutre', category: 'attack', description: '', energy_cost: 0, trigger: 'passive', target: 'self' });
const hero = makeHero({ id: 'h', name: 'H', base_hp: 100, hp_lvl10: 100, energy_cap: 10, effects: {} }, 1);
const card = (sk, i, hp=180, atk=40) => ({ uid: 'u'+i, card_id: 'c'+i, hp, atk, def: 10, skill: sk, stars: 1 });
const out = [];
for (const r of rows) {
  const sk = normSkill(r); let fired = 0, effects = {}, games = 0, heroFx = 0;
  for (let g = 0; g < 30; g++) {
    const st = newMatch(cfg, { seed: 1000 + g * 77 + r.id, now: 0, me: { hero, deck: [] }, bot: { hero: { ...hero, fx: {} }, deck: [] } });
    // camp « me » : la carte testée + 2 alliés ; camp « bot » : 3 cartes neutres
    st.me.board = { L1: card(sk, 1), L2: card(plain, 2, 150, 30), C1: card(plain, 3, 150, 30), R1: null, R2: null };
    st.bot.board = { L1: card(plain, 4, 200, 35), L2: null, C1: card(plain, 5, 200, 35), R1: card(plain, 6, 200, 35), R2: null };
    if (r.trigger === 'on_play') { fired++; continue; }  // effet appliqué à la pose (hors combat)
    const res = simulate(cfg, st); games++;
    if (res.heroDmg.bot || res.heroHeal.me || res.energyDrain.bot) heroFx++;
    for (const tk of res.ticks) for (const e of tk.ev) {
      if (e.k === 'skill' && e.u === 'me.L1') fired++;
      if (e.k !== 'atk' && e.k !== 'skill' && e.k !== 'die') effects[e.k] = (effects[e.k] || 0) + 1;
    }
  }
  out.push({ id: r.id, name: r.name, trigger: r.trigger, n: r.trigger_n, target: r.target, fired, heroFx });
}
const never = out.filter((o) => o.fired === 0);
console.log('skills testés', out.length, '| jamais déclenchés :', never.length);
console.table(never);
fs.writeFileSync('/tmp/des/audit.json', JSON.stringify(out));
