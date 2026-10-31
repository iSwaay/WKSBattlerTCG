import { buildCfg, normSkill, makeHero, newMatch, act, view, SLOTS } from '../engine.js';
let seed = 12345; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(r() * a.length)];
const TRIG = ['on_play','on_combat_start','on_attack','every_n_attacks','on_hit','on_kill','on_death','on_hp_below','passive'];
const TGT = ['self','target','attacker','lane_ally','all_allies','lowest_hp_ally','lane_enemy','all_enemies','random_enemy','lowest_hp_enemy','highest_atk_enemy','own_hero','enemy_hero'];
const STS = [null,null,null,'poison','burn','bleed','regen','freeze','stun','silence','taunt','invulnerable','reflect','dodge'];
const RAR = ['C','R','E','L'];
let id = 0;
function rs() {
  const trigger = pick(TRIG); let target = pick(TGT);
  if (trigger === 'on_play') target = pick(['own_hero','enemy_hero']);
  if (['target','attacker'].includes(target) && !['on_attack','every_n_attacks','on_hit','on_kill'].includes(trigger)) target = 'self';
  if (trigger === 'on_hit' && r() < .5) target = 'attacker';
  const ex = {}; if (r() < .1) ex.range = [5, 40]; if (r() < .05) ex.execute_below_pct = 30; if (r() < .05) ex.cleanse = true;
  if (r() < .05) ex.swap_atk_def = true; if (r() < .05) ex.negate_next_hit = true; if (r() < .05) ex.revive = true; if (r() < .1) ex.free_reroll = 1;
  if (r() < .05) ex.cond = 'target_hp_below_pct:50'; if (r() < .1) ex.max_stacks = 3;
  return normSkill({ id: ++id, rarity: pick(RAR), name: 'S' + id, category: pick(['attack','defense','utility','hybrid']), description: '', energy_cost: Math.floor(r() * 6),
    trigger, target, damage_atk_pct: r() < .5 ? Math.floor(r() * 150) : 0, damage_done: r() < .1 ? 3 : 0, hits: r() < .2 ? 3 : 1, ignore_def_pct: r() < .1 ? 40 : 0,
    heal_max_hp_pct: r() < .2 ? 25 : 0, lifesteal_pct: r() < .1 ? 30 : 0, atk_mod_pct: r() < .2 ? pick([-30, 30]) : 0, def_mod_pct: r() < .2 ? pick([-30, 30]) : 0,
    hp_max_mod_pct: r() < .1 ? 20 : 0, shield_hp_pct: r() < .1 ? 20 : 0, status_effect: pick(STS), status_value: 10 + Math.floor(r() * 20), status_duration: Math.floor(r() * 4),
    duration_turns: Math.floor(r() * 4), self_damage: r() < .05 ? 10 : 0, energy_gain: r() < .1 ? 1 : 0, energy_drain: r() < .05 ? 1 : 0, cooldown: Math.floor(r() * 3),
    uses_per_combat: r() < .3 ? 1 : null, extra: ex, trigger_n: 2 + Math.floor(r() * 2), trigger_hp_pct: 40 });
}
const skills = Array.from({ length: 100 }, rs);
const cfg = buildCfg([], [1,2,3,4,5].map((i) => ({ stars: i, upgrade_cost: i < 5 ? i + 2 : null, skill_boost_pct: [0,10,25,45,70][i-1] ?? 100 })));
// étoile 1 = bonus 10 selon la config réelle
cfg.stars = { 1:{upgrade_cost:3,skill_boost_pct:10},2:{upgrade_cost:4,skill_boost_pct:25},3:{upgrade_cost:5,skill_boost_pct:45},4:{upgrade_cost:6,skill_boost_pct:70},5:{upgrade_cost:null,skill_boost_pct:100} };
const heroRow = (i) => ({ id: 'h' + i, name: 'H' + i, base_hp: 100, hp_lvl10: 100, energy_cap: 10, field_slots: 5, effects: [{}, { blocked_slots: ['R2'], shield_efficiency_pct: 25 }, { attack_damage_pct_bonus: 20, self_damage_pct_max_hp_after_attack: 2 },
  { random_values_max: true, random_value_card_cost_increase: 1 }, { first_card_cost_reduction: 1, energy_cap_fixed: 8 }, { heal_efficiency_pct: -50, end_turn_heal_per_unspent_energy: 1 },
  { banned_cost_min: 4, cheap_card_hp_pct: 15, cheap_card_atk_pct: 15, cheap_card_max_cost: 1 }, { disable_secondary_effects: ['ignore_def','lifesteal'], multi_hit_damage_pct_per_hit: 10 },
  { applies_to: ['buff','debuff','status'], duration_bonus: 1, first_attack_card_cost_increase: 1 }, { consumable_cooldown_reduction_pct: 15, utility_hybrid_card_cost_increase: 1 }][i % 10] });
const mkDeck = () => Array.from({ length: 20 }, (_, i) => ({ card_id: 'c' + Math.floor(r() * 40), instance_id: 'i' + i, hp: 80 + Math.floor(r() * 200), atk: 15 + Math.floor(r() * 80), def: 5 + Math.floor(r() * 40), skill: pick(skills) }));
let games = 0, rounds = 0, wins = { me: 0, bot: 0, draw: 0 }, maxRounds = 0, t0 = Date.now(), maxBytes = 0;
for (let g = 0; g < 600; g++) {
  const st = newMatch(cfg, { seed: g * 7919 + 1, now: 0, me: { hero: makeHero(heroRow(g), 1 + g % 10), deck: mkDeck() }, bot: { hero: makeHero(heroRow(g * 3 + 1), 5), deck: mkDeck() }, difficulty: pick(['easy','normal','hard']) });
  let guard = 0;
  while (st.status === 'prep' && guard++ < 60) {
    // le joueur joue au hasard
    for (let k = 0; k < 8; k++) {
      const v = view(st, cfg); const a = r();
      let res;
      if (v.me.pending) res = act(st, cfg, 'me', { t: 'fusion', skill_id: pick(v.me.pending.options) }, 0);
      else if (a < .5) { const o = pick(v.me.offer.filter(Boolean).length ? v.me.offer.filter(Boolean) : [{ i: 0 }]); res = act(st, cfg, 'me', { t: 'buy', i: o.i, slot: pick(SLOTS) }, 0); }
      else if (a < .65) res = act(st, cfg, 'me', { t: 'reroll' }, 0);
      else if (a < .8) res = act(st, cfg, 'me', { t: 'upgrade', slot: pick(SLOTS) }, 0);
      else res = act(st, cfg, 'me', { t: 'move', from: pick(SLOTS), to: pick(SLOTS) }, 0);
      if (!res || (typeof res !== 'object')) throw new Error('bad result');
    }
    const v = view(st, cfg); if (v.me.pending) act(st, cfg, 'me', { t: 'fusion', skill_id: v.me.pending.options[0] }, 0);
    const res = act(st, cfg, 'me', { t: 'ready' }, 0);
    if (res.error) throw new Error(res.error);
    rounds++;
    const h = [st.me.hero.hp, st.bot.hero.hp]; if (h.some((x) => !Number.isFinite(x))) throw new Error('hp NaN ' + h);
    if (st.last) { maxBytes = Math.max(maxBytes, JSON.stringify(st).length); }
  }
  if (st.status !== 'over') throw new Error('partie non terminée');
  games++; wins[st.winner]++; maxRounds = Math.max(maxRounds, st.round);
}
console.log({ games, rounds, wins, maxRounds, ms: Date.now() - t0, maxStateKB: Math.round(maxBytes / 1024) });
