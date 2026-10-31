// WKS TCG — moteur d'auto battler (pur, sans dépendance). Utilisé par l'edge function "match".
export const SLOTS = ['L1', 'L2', 'C1', 'R1', 'R2'];
const LANE = { L1: 'L', L2: 'L', C1: 'C', R1: 'R', R2: 'R' };
const LANE_IDX = { L1: 0, L2: 1, C1: 0, R1: 0, R2: 1 };
const LANE_DIST = { L: { L: 0, C: 1, R: 2 }, C: { L: 1, C: 0, R: 1 }, R: { L: 2, C: 1, R: 0 } };
const RARITY_W = { C: 1, R: 2, E: 3, L: 4 };
const foe = (s) => (s === 'me' ? 'bot' : 'me');

/* ---------- aléatoire déterministe (mulberry32) ---------- */
export function rnd(R) {
  R.s = (R.s + 0x6d2b79f5) >>> 0;
  let t = R.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (R, a, b) => a + Math.floor(rnd(R) * (b - a + 1));
function shuffle(R, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(R) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- configuration ---------- */
export function buildCfg(configRows, starRows) {
  const g = {}; (configRows || []).forEach((r) => { g[r.key] = r.value; });
  const stars = {}; (starRows || []).forEach((r) => { stars[r.stars] = { upgrade_cost: r.upgrade_cost, skill_boost_pct: r.skill_boost_pct }; });
  return {
    offer_size: g.offer_size ?? 3, reroll_cost: g.reroll_cost ?? 1,
    energy: g.energy ?? { cap: 10, start: 1, per_round: 1 },
    merge_count: g.merge_count ?? 3, max_stars: g.max_stars ?? 5,
    hero_damage: g.hero_damage ?? { base_per_round: 1, per_surviving_star: 1 },
    combat: g.combat ?? { max_ticks: 30, min_damage: 1 },
    prep_seconds: g.prep_seconds ?? 30, max_rounds: 40, stars,
  };
}

/* ---------- skills ---------- */
export function normSkill(r) {
  if (!r) return null;
  const n = (x) => (x == null ? 0 : Number(x));
  return {
    id: r.id, name: r.name, rarity: r.rarity, category: r.category, description: r.description, cost: n(r.energy_cost),
    trigger: r.trigger, target: r.target || 'self', d: n(r.damage_atk_pct), dd: n(r.damage_done), hits: Math.max(1, n(r.hits) || 1),
    pen: n(r.ignore_def_pct), heal: n(r.heal_max_hp_pct), ls: n(r.lifesteal_pct), am: n(r.atk_mod_pct), dfm: n(r.def_mod_pct),
    hm: n(r.hp_max_mod_pct), sh: n(r.shield_hp_pct), st: r.status_effect || null, sv: n(r.status_value), sd: n(r.status_duration),
    dur: n(r.duration_turns), sdm: n(r.self_damage), eg: n(r.energy_gain), ed: n(r.energy_drain), cd: n(r.cooldown),
    uses: r.uses_per_combat == null ? 0 : n(r.uses_per_combat), ex: r.extra || {}, tn: n(r.trigger_n), th: n(r.trigger_hp_pct),
  };
}
const PRIMARY = ['d', 'heal', 'am', 'dfm', 'hm', 'sh', 'sv'];
const SCALED = ['d', 'dd', 'heal', 'ls', 'am', 'dfm', 'hm', 'sh', 'sv'];
function scaleSkill(s, pct) {
  const k = 1 + pct / 100, o = { ...s, ex: { ...s.ex } };
  SCALED.forEach((f) => { o[f] = Math.round(s[f] * k); });
  if (o.ex.range) o.ex.range = o.ex.range.map((v) => Math.round(v * k));
  return o;
}

/* ---------- héros ---------- */
export function makeHero(row, level) {
  const lvl = Math.max(1, Math.min(10, level || 1));
  const max = Math.round(row.base_hp + ((row.hp_lvl10 - row.base_hp) * (lvl - 1)) / 9);
  const e = row.effects || {};
  const fx = { ...e }; delete fx.lvl10;
  if (lvl >= 10 && e.lvl10) Object.assign(fx, e.lvl10);
  return { id: row.id, name: row.name, level: lvl, max_hp: max, hp: max, energy_cap: row.energy_cap, fx };
}

/* ---------- état d'un camp ---------- */
function newSide(hero, deck) {
  return { hero, deck, board: { L1: null, L2: null, C1: null, R1: null, R2: null }, energy: 0, max_energy: 0, offer: [], free_rerolls: 0,
    first_bought: false, first_attack_bought: false, energy_penalty: 0, unlock_slot: false, cap_bonus: false, pending: null };
}
export function allowedSlots(side) {
  const b = side.hero.fx.blocked_slots || [];
  return SLOTS.filter((s) => !b.includes(s) || side.unlock_slot);
}
function drawOffer(st, cfg, sd) {
  const side = st[sd], fx = side.hero.fx;
  const picks = shuffle(st.R, side.deck.map((_, i) => i)).slice(0, cfg.offer_size);
  side.offer = picks.map((i) => {
    const c = side.deck[i];
    return { ...c, tf: rnd(st.R) * 100 < (fx.cancel_cost_increase_chance_pct || fx.ignore_tax_chance_pct || fx.ignore_cost_increase_chance_pct || 0),
      f3: rnd(st.R) * 100 < (fx.expensive_cost_forced_to_3_chance_pct || 0) };
  });
}
export function cardCost(side, c) {
  const fx = side.hero.fx, sk = c.skill; let cost = sk.cost;
  if (fx.banned_cost_min != null && cost >= fx.banned_cost_min) { if (c.f3) cost = 3; else return Infinity; }
  if (!c.tf) {
    if (fx.random_value_card_cost_increase && sk.ex.range) cost += fx.random_value_card_cost_increase;
    if (fx.first_attack_card_cost_increase && sk.category === 'attack' && !side.first_attack_bought) cost += fx.first_attack_card_cost_increase;
    if (fx.utility_hybrid_card_cost_increase && (sk.category === 'utility' || sk.category === 'hybrid')) cost += fx.utility_hybrid_card_cost_increase;
  }
  if (fx.first_card_cost_reduction && !side.first_bought) cost -= fx.first_card_cost_reduction;
  return Math.max(0, cost);
}
function startRound(st, cfg, now, reviewMs) {
  for (const sd of ['me', 'bot']) {
    const s = st[sd], fx = s.hero.fx;
    s.cap_bonus = !!(fx.unlock_energy_10_chance_pct && rnd(st.R) * 100 < fx.unlock_energy_10_chance_pct);
    s.unlock_slot = !!(fx.temp_unlock_slot_chance_pct && rnd(st.R) * 100 < fx.temp_unlock_slot_chance_pct);
    const cap = s.cap_bonus ? Math.max(10, s.hero.energy_cap) : s.hero.energy_cap;
    s.max_energy = Math.min(cap, cfg.energy.start + (st.round - 1) * cfg.energy.per_round);
    s.energy = Math.max(0, s.max_energy - s.energy_penalty); s.energy_penalty = 0;
    s.free_rerolls = 0; s.first_bought = false; s.first_attack_bought = false; s.pending = null;
    drawOffer(st, cfg, sd);
  }
  st.status = 'prep'; st.prep_start = now + reviewMs; st.deadline = now + reviewMs + cfg.prep_seconds * 1000;
}

/* ---------- création d'une partie ---------- */
export function newMatch(cfg, { seed, now, me, bot, difficulty }) {
  const st = { v: 1, mode: 'bot', difficulty: difficulty || 'normal', R: { s: seed >>> 0 }, round: 1, uid: 0, status: 'prep', winner: null,
    me: newSide(me.hero, me.deck), bot: newSide(bot.hero, bot.deck), last: null, opp_prev: null, log: [] };
  startRound(st, cfg, now, 0);
  return st;
}

/* ---------- fusion / étoiles ---------- */
function findFusion(side, cfg) {
  const groups = {};
  for (const sl of SLOTS) { const c = side.board[sl]; if (c && c.stars < cfg.max_stars) (groups[c.card_id + '|' + c.stars] ||= []).push(sl); }
  for (const k of Object.keys(groups)) if (groups[k].length >= cfg.merge_count) return groups[k].slice(0, cfg.merge_count);
  return null;
}
function doFusion(side, slots, skillIndex) {
  const cards = slots.map((s) => side.board[s]);
  const keep = cards[skillIndex] || cards[0];
  const target = slots[0];
  const merged = { ...keep, stars: keep.stars + 1 };
  slots.forEach((s) => { side.board[s] = null; });
  side.board[target] = merged;
}
function checkFusion(st, cfg, sd, auto) {
  const side = st[sd];
  for (let guard = 0; guard < 6; guard++) {
    const slots = findFusion(side, cfg);
    if (!slots) { side.pending = null; return; }
    const cards = slots.map((s) => side.board[s]);
    const distinct = [...new Set(cards.map((c) => c.skill.id))];
    if (distinct.length === 1) { doFusion(side, slots, 0); continue; }
    if (auto) {
      let best = 0; cards.forEach((c, i) => { if (RARITY_W[c.skill.rarity] > RARITY_W[cards[best].skill.rarity]) best = i; });
      doFusion(side, slots, best); continue;
    }
    side.pending = { slots, options: cards.map((c) => c.skill.id), card_id: cards[0].card_id, stars: cards[0].stars };
    return;
  }
}

/* ---------- effets à la pose ---------- */
function onPlay(st, cfg, sd, card) {
  const s = card.skill; if (s.trigger !== 'on_play') return;
  const sc = scaleSkill(s, cfg.stars[card.stars]?.skill_boost_pct || 0), side = st[sd], opp = st[foe(sd)];
  if (sc.ex.free_reroll) side.free_rerolls += sc.ex.free_reroll;
  if (s.target === 'own_hero') {
    if (sc.heal) side.hero.hp = Math.min(side.hero.max_hp, side.hero.hp + Math.round(side.hero.max_hp * sc.heal / 100));
    if (sc.eg) side.energy += sc.eg;
  } else if (s.target === 'enemy_hero') {
    if (sc.dd) opp.hero.hp -= sc.dd;
    if (sc.ed) opp.energy_penalty += sc.ed;
  }
}

/* ---------- actions de préparation ---------- */
export function act(st, cfg, sd, a, now) {
  if (st.status !== 'prep') return { error: 'La partie est terminée.' };
  const side = st[sd];
  if (a.t === 'ready') return endPrep(st, cfg, now);
  if (side.pending && a.t !== 'fusion') return { error: 'Choisis d\'abord le skill de la fusion.' };
  switch (a.t) {
    case 'fusion': {
      if (!side.pending) return { error: 'Aucune fusion en attente.' };
      const i = side.pending.options.indexOf(a.skill_id);
      if (i < 0) return { error: 'Skill invalide.' };
      doFusion(side, side.pending.slots, i); side.pending = null; checkFusion(st, cfg, sd, false); return { ok: true };
    }
    case 'buy': {
      const c = side.offer[a.i]; if (!c) return { error: 'Carte indisponible.' };
      if (!allowedSlots(side).includes(a.slot)) return { error: 'Emplacement indisponible.' };
      const cost = cardCost(side, c);
      if (!isFinite(cost)) return { error: 'Cette carte ne peut pas être jouée avec ce héros.' };
      if (cost > side.energy) return { error: 'Pas assez d\'énergie.' };
      side.energy -= cost; side.first_bought = true; if (c.skill.category === 'attack') side.first_attack_bought = true;
      const card = { uid: 'u' + (++st.uid), card_id: c.card_id, instance_id: c.instance_id || null, hp: c.hp, atk: c.atk, def: c.def, skill: c.skill, stars: 1, paid: cost };
      side.board[a.slot] = card; side.offer[a.i] = null;
      onPlay(st, cfg, sd, card); checkFusion(st, cfg, sd, sd === 'bot');
      return { ok: true };
    }
    case 'reroll': {
      if (side.free_rerolls > 0) side.free_rerolls--; else {
        if (side.energy < cfg.reroll_cost) return { error: 'Pas assez d\'énergie.' }; side.energy -= cfg.reroll_cost; }
      drawOffer(st, cfg, sd); return { ok: true };
    }
    case 'upgrade': {
      const c = side.board[a.slot]; if (!c) return { error: 'Emplacement vide.' };
      if (c.stars >= cfg.max_stars) return { error: 'Étoiles au maximum.' };
      const cost = cfg.stars[c.stars].upgrade_cost;
      if (side.energy < cost) return { error: 'Pas assez d\'énergie.' };
      side.energy -= cost; c.stars++; checkFusion(st, cfg, sd, sd === 'bot'); return { ok: true };
    }
    case 'move': {
      const ok = allowedSlots(side);
      if (!ok.includes(a.from) && !side.board[a.from]) return { error: 'Déplacement impossible.' };
      if (!SLOTS.includes(a.from) || !ok.includes(a.to)) return { error: 'Emplacement indisponible.' };
      const x = side.board[a.from]; if (!x) return { error: 'Emplacement vide.' };
      side.board[a.from] = side.board[a.to]; side.board[a.to] = x; return { ok: true };
    }
    default: return { error: 'Action inconnue.' };
  }
}

/* ---------- bot ---------- */
function cardScore(c) { return c.hp / 8 + c.atk + c.def / 4 + RARITY_W[c.skill.rarity] * 6; }
export function botPrep(st, cfg) {
  const b = st.bot, diff = st.difficulty, R = st.R;
  const noise = diff === 'easy' ? 0.8 : diff === 'normal' ? 0.25 : 0.05;
  const val = (c) => (cardScore(c) * (1 + (rnd(R) - 0.5) * noise)) / Math.max(1, cardCost(b, c)) ** 0.5
    + (SLOTS.some((s) => b.board[s] && b.board[s].card_id === c.card_id) && diff !== 'easy' ? 25 : 0);
  let rerolls = diff === 'easy' ? 0 : diff === 'normal' ? 1 : 2;
  for (let it = 0; it < 14; it++) {
    const opts = b.offer.map((c, i) => ({ c, i })).filter((o) => o.c && isFinite(cardCost(b, o.c)) && cardCost(b, o.c) <= b.energy);
    opts.sort((x, y) => val(y.c) - val(x.c));
    let did = false;
    for (const o of opts) {
      const slots = allowedSlots(b); let slot = null;
      const order = ['C1', 'L1', 'R1', 'L2', 'R2'].filter((s) => slots.includes(s));
      slot = order.find((s) => !b.board[s]);
      if (!slot) {
        const w = order.map((s) => ({ s, v: cardScore(b.board[s]) * (1 + (b.board[s].stars - 1) * 0.6) })).sort((x, y) => x.v - y.v)[0];
        const same = SLOTS.some((s) => b.board[s] && b.board[s].card_id === o.c.card_id);
        if (!w || (!same && cardScore(o.c) < w.v * 1.25)) continue;
        slot = w.s;
      }
      if (act(st, cfg, 'bot', { t: 'buy', i: o.i, slot }).ok) { did = true; break; }
    }
    if (did) continue;
    if (rerolls > 0 && b.energy >= cfg.reroll_cost + 1 && !opts.length) { rerolls--; act(st, cfg, 'bot', { t: 'reroll' }); continue; }
    if (diff !== 'easy') {
      const cand = SLOTS.filter((s) => b.board[s] && b.board[s].stars < cfg.max_stars && cfg.stars[b.board[s].stars].upgrade_cost <= b.energy)
        .sort((x, y) => cardScore(b.board[y]) - cardScore(b.board[x]));
      if (cand.length && SLOTS.every((s) => b.board[s])) { act(st, cfg, 'bot', { t: 'upgrade', slot: cand[0] }); continue; }
    }
    break;
  }
}

/* ---------- combat ---------- */
function mkUnit(sd, slot, c, hero, cfg) {
  const fx = hero.fx; let hp = c.hp, atk = c.atk;
  if (fx.cheap_card_max_cost != null && c.skill.cost <= fx.cheap_card_max_cost) { hp = Math.round(hp * (1 + fx.cheap_card_hp_pct / 100)); atk = Math.round(atk * (1 + fx.cheap_card_atk_pct / 100)); }
  return { id: sd + '.' + slot, side: sd, slot, lane: LANE[slot], card: c, hp, maxHp: hp, atk, def: c.def, shield: 0, mods: [], sts: [], attacks: 0,
    used: 0, cdLeft: 0, dead: false, hpFired: false, deathFired: false, killed: false, negate: 0, swap: 0, stars: c.stars,
    skill: scaleSkill(c.skill, cfg.stars[c.stars]?.skill_boost_pct || 0) };
}

export function simulate(cfg, st) {
  const R = st.R, units = [], ticks = [];
  for (const sd of ['me', 'bot']) for (const slot of SLOTS) { const c = st[sd].board[slot]; if (c) units.push(mkUnit(sd, slot, c, st[sd].hero, cfg)); }
  const init = units.map((u) => ({ id: u.id, card_id: u.card.card_id, slot: u.slot, side: u.side, stars: u.stars, hp: u.hp, atk: u.atk, def: u.def, skill_id: u.skill.id }));
  const totalHp = { me: 0, bot: 0 }; units.forEach((u) => { totalHp[u.side] += u.maxHp; });
  let ev = [], depth = 0;
  const heroDmg = { me: 0, bot: 0 }, heroHeal = { me: 0, bot: 0 }, energyDrain = { me: 0, bot: 0 };
  const fxOf = (u) => st[u.side].hero.fx;
  const foes = (u) => units.filter((x) => x.side !== u.side && x.hp > 0);
  const allies = (u) => units.filter((x) => x.side === u.side && x.hp > 0);
  const hasSt = (u, t) => u.sts.some((s) => s.t === t);
  const stVal = (u, t) => u.sts.filter((s) => s.t === t).reduce((a, s) => Math.max(a, s.v), 0);
  const effStats = (u) => {
    const bAtk = u.swap > 0 ? u.def : u.atk, bDef = u.swap > 0 ? u.atk : u.def;
    const ma = u.mods.filter((m) => m.k === 'atk').reduce((a, m) => a + m.pct, 0), md = u.mods.filter((m) => m.k === 'def').reduce((a, m) => a + m.pct, 0);
    return { atk: Math.max(0, bAtk * (1 + ma / 100)), def: Math.max(-50, bDef * (1 + md / 100)) };
  };
  const healAmt = (u, pct, base) => Math.max(0, Math.round(base * pct / 100 * (1 + (fxOf(u).heal_efficiency_pct || 0) / 100)));
  const heal = (u, n) => { if (u.hp <= 0 || n <= 0) return; const b = u.hp; u.hp = Math.min(u.maxHp, u.hp + n); if (u.hp > b) ev.push({ k: 'heal', u: u.id, d: u.hp - b }); };

  function checkHpBelow(u) { if (u.hp > 0 && u.skill.trigger === 'on_hp_below' && !u.hpFired && u.hp / u.maxHp * 100 <= u.skill.th) fire(u, 'on_hp_below', {}); }
  function loss(u, n, k) { if (u.hp <= 0 || n <= 0) return; u.hp -= n; ev.push({ k: k || 'dot', u: u.id, d: n, l: n }); checkHpBelow(u); }

  function hit(src, tgt, raw, o = {}) {
    if (tgt.hp <= 0) return 0;
    if (hasSt(tgt, 'invulnerable')) { ev.push({ k: 'block', u: tgt.id }); return 0; }
    if (hasSt(tgt, 'dodge') && rnd(R) * 100 < stVal(tgt, 'dodge')) { ev.push({ k: 'dodge', u: tgt.id }); return 0; }
    if (tgt.negate > 0) { tgt.negate--; ev.push({ k: 'block', u: tgt.id }); return 0; }
    const pen = o.pen || 0, dfn = effStats(tgt).def, d0 = dfn > 0 ? dfn * (1 - pen / 100) : dfn;
    const d = Math.max(cfg.combat.min_damage, Math.round(raw * 100 / (100 + d0)));
    const ab = Math.min(tgt.shield, d); tgt.shield -= ab; const ls = d - ab; tgt.hp -= ls;
    ev.push({ k: 'dmg', a: src ? src.id : null, u: tgt.id, d, l: ls });
    if (src && hasSt(tgt, 'reflect') && !o.noReflect) loss(src, Math.max(1, Math.round(d * stVal(tgt, 'reflect') / 100)), 'reflect');
    if (ls > 0 && tgt.hp > 0) { if (depth < 4) fire(tgt, 'on_hit', { attacker: src }); checkHpBelow(tgt); }
    if (tgt.hp <= 0 && !tgt.killed) { tgt.killed = true; if (src && src.hp > 0) fire(src, 'on_kill', { target: tgt }); }
    return d;
  }

  function targetsOf(u, kind, ctx) {
    switch (kind) {
      case 'self': return [u];
      case 'target': return ctx.target && ctx.target.hp > 0 ? [ctx.target] : [];
      case 'attacker': return ctx.attacker && ctx.attacker.hp > 0 ? [ctx.attacker] : [];
      case 'lane_ally': return allies(u).filter((x) => x !== u && x.lane === u.lane);
      case 'all_allies': return allies(u);
      case 'lowest_hp_ally': { const a = allies(u).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp); return a.length ? [a[0]] : []; }
      case 'lane_enemy': return foes(u).filter((x) => x.lane === u.lane);
      case 'all_enemies': return foes(u);
      case 'random_enemy': { const f = foes(u); return f.length ? [f[Math.floor(rnd(R) * f.length)]] : []; }
      case 'lowest_hp_enemy': { const f = foes(u).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp); return f.length ? [f[0]] : []; }
      case 'highest_atk_enemy': { const f = foes(u).sort((x, y) => effStats(y).atk - effStats(x).atk); return f.length ? [f[0]] : []; }
      default: return [];
    }
  }
  function pickTarget(u) {
    let f = foes(u); if (!f.length) return null;
    const t = f.filter((x) => hasSt(x, 'taunt')); if (t.length) f = t;
    const m = Math.min(...f.map((x) => LANE_DIST[u.lane][x.lane]));
    f = f.filter((x) => LANE_DIST[u.lane][x.lane] === m);
    const fr = Math.min(...f.map((x) => LANE_IDX[x.slot]));
    f = f.filter((x) => LANE_IDX[x.slot] === fr);
    return f[Math.floor(rnd(R) * f.length)];
  }
  function addMod(t, k, pct, dur, key, maxStacks) {
    if (!pct) return;
    const same = t.mods.filter((m) => m.k === k && m.key === key);
    if (same.length >= (maxStacks || 1)) { same[0].left = dur; same[0].perm = dur === 0; return; }
    t.mods.push({ k, pct, left: dur, perm: dur === 0, key });
  }
  function addStatus(t, type, v, dur) {
    const e = t.sts.find((s) => s.t === type);
    if (e) { e.v = Math.max(e.v, v); e.left = Math.max(e.left, dur); e.perm = e.perm || dur === 0; } else t.sts.push({ t: type, v, left: dur, perm: dur === 0 });
    ev.push({ k: 'status', u: t.id, s: type });
  }

  function rollVals(u, s) {
    const v = { d: s.d, dd: s.dd, heal: s.heal, ls: s.ls, am: s.am, dfm: s.dfm, hm: s.hm, sh: s.sh, sv: s.sv, pen: s.pen };
    if (s.ex.range) {
      const [lo, hi] = s.ex.range;
      const pick = fxOf(u).random_values_max ? (Math.abs(hi) >= Math.abs(lo) ? hi : lo) : rint(R, Math.min(lo, hi), Math.max(lo, hi));
      const f = PRIMARY.find((k) => s[k] !== 0); if (f) v[f] = pick;
    }
    const fx = fxOf(u);
    if (fx.disable_secondary_effects && !(fx.keep_secondary_chance_pct && rnd(R) * 100 < fx.keep_secondary_chance_pct)) {
      if (fx.disable_secondary_effects.includes('ignore_def')) v.pen = 0;
      if (fx.disable_secondary_effects.includes('lifesteal')) v.ls = 0;
    }
    return v;
  }
  function condOk(u, s, ctx) {
    const c = s.ex.cond; if (!c) return true;
    const m = /^target_hp_below_pct:(\d+)$/.exec(c);
    if (m) return !!(ctx.target && ctx.target.hp > 0 && ctx.target.hp / ctx.target.maxHp * 100 <= Number(m[1]));
    return true;
  }

  function strike(u, t, v, s) {
    const fx = fxOf(u); let total = 0;
    for (let h = 0; h < s.hits; h++) {
      if (t.hp <= 0) break;
      let raw = effStats(u).atk * v.d / 100;
      if (s.ex.execute_below_pct && t.hp / t.maxHp * 100 <= s.ex.execute_below_pct) raw = 1e9;
      if (fx.attack_damage_pct_bonus) raw *= 1 + fx.attack_damage_pct_bonus / 100;
      if (s.hits > 1 && fx.multi_hit_damage_pct_per_hit) raw *= 1 + fx.multi_hit_damage_pct_per_hit / 100;
      total += hit(u, t, raw, { pen: v.pen });
    }
    if (v.ls > 0 && total > 0) heal(u, healAmt(u, v.ls, total));
  }
  function applyTo(u, t, s, v, ctx) {
    if (v.d > 0 || s.ex.execute_below_pct) strike(u, t, v, s);
    if (v.heal > 0 && !s.ex.revive) heal(t, healAmt(t, v.heal, t.maxHp));
    if (v.sh > 0) { const eff = 1 + (fxOf(t).shield_efficiency_pct || 0) / 100; t.shield += Math.round(t.maxHp * v.sh / 100 * eff); ev.push({ k: 'shield', u: t.id, d: Math.round(t.maxHp * v.sh / 100 * eff) }); }
    const bonus = (fxOf(u).applies_to || []).includes(s.category) ? (fxOf(u).duration_bonus || 0) : 0;
    const dur = s.dur > 0 ? s.dur + bonus : 0;
    if (v.am) addMod(t, 'atk', v.am, dur, 's' + s.id, s.ex.max_stacks);
    if (v.dfm) addMod(t, 'def', v.dfm, dur, 's' + s.id, s.ex.max_stacks);
    if (s.ex.swap_atk_def) { t.swap = (dur || 99); ev.push({ k: 'status', u: t.id, s: 'swap' }); }
    if (v.hm) { const d = Math.round(t.maxHp * v.hm / 100); t.maxHp = Math.max(1, t.maxHp + d); t.hp = d > 0 ? t.hp + d : Math.max(1, Math.min(t.hp, t.maxHp)); ev.push({ k: 'maxhp', u: t.id, d }); }
    if (s.st) addStatus(t, s.st, v.sv, s.sd > 0 ? s.sd + bonus : 0);
    if (s.ex.negate_next_hit) t.negate++;
    if (s.ex.cleanse) { t.sts = t.sts.filter((x) => ['invulnerable', 'regen', 'reflect', 'dodge', 'taunt'].includes(x.t)); t.mods = t.mods.filter((m) => m.pct > 0); ev.push({ k: 'cleanse', u: t.id }); }
  }
  function runSkill(u, ctx) {
    const s = u.skill, v = rollVals(u, s);
    ev.push({ k: 'skill', u: u.id, n: s.name });
    if (s.target === 'own_hero' || s.target === 'enemy_hero') {
      if (s.target === 'own_hero') { heroHeal[u.side] += healAmt(u, v.heal, st[u.side].hero.max_hp); }
      else { heroDmg[foe(u.side)] += v.dd; energyDrain[foe(u.side)] += s.ed; }
    } else {
      targetsOf(u, s.target, ctx).forEach((t) => applyTo(u, t, s, v, ctx));
      if (v.dd) heroDmg[foe(u.side)] += v.dd;
    }
    if (s.ex.revive && u.hp <= 0) { u.hp = Math.max(1, Math.round(u.maxHp * s.heal / 100)); u.killed = false; u.sts = []; ev.push({ k: 'revive', u: u.id }); }
    if (s.sdm > 0) loss(u, Math.max(1, Math.round(u.maxHp * s.sdm / 100)), 'self');
  }
  function fire(u, trig, ctx) {
    const s = u.skill;
    if (s.trigger !== trig || depth > 3) return false;
    if (trig !== 'on_death' && u.hp <= 0) return false;
    if (hasSt(u, 'silence')) return false;
    if (s.uses && u.used >= s.uses) return false;
    if (u.cdLeft > 0) return false;
    if (trig === 'every_n_attacks' && !(u.attacks > 0 && s.tn > 0 && u.attacks % s.tn === 0)) return false;
    if (trig === 'on_hp_below' && (u.hpFired || u.hp / u.maxHp * 100 > s.th)) return false;
    if (!condOk(u, s, ctx)) return false;
    if (trig === 'on_hp_below') u.hpFired = true;
    u.used++; const cdRed = fxOf(u).consumable_cooldown_reduction_pct || 0;
    u.cdLeft = Math.round(s.cd * (1 - cdRed / 100));
    depth++; runSkill(u, ctx); depth--; return true;
  }

  function act1(u) {
    if (hasSt(u, 'freeze') || hasSt(u, 'stun')) { ev.push({ k: 'skip', u: u.id }); return; }
    const t = pickTarget(u); if (!t) return;
    if (u.cdLeft > 0) u.cdLeft--;
    u.attacks++;
    ev.push({ k: 'atk', a: u.id, d: t.id });
    let raw = effStats(u).atk * (1 + (fxOf(u).attack_damage_pct_bonus || 0) / 100);
    hit(u, t, raw);
    if (u.hp > 0) { fire(u, 'on_attack', { target: t }); fire(u, 'every_n_attacks', { target: t }); }
    const bl = u.sts.find((x) => x.t === 'bleed'); if (bl) loss(u, Math.max(1, Math.round(u.maxHp * bl.v / 100)), 'bleed');
    const fx = fxOf(u);
    if (fx.self_damage_pct_max_hp_after_attack && !(fx.ignore_self_damage_chance_pct && rnd(R) * 100 < fx.ignore_self_damage_chance_pct))
      loss(u, Math.max(1, Math.round(u.maxHp * fx.self_damage_pct_max_hp_after_attack / 100)), 'self');
    u.mods.forEach((m) => { if (!m.perm) m.left--; }); u.mods = u.mods.filter((m) => m.perm || m.left > 0);
    if (u.swap > 0) u.swap--;
  }
  function resolveDeaths() {
    for (let pass = 0; pass < 8; pass++) {
      let ch = false;
      for (const u of units) {
        if (u.hp <= 0 && !u.dead) {
          if (!u.deathFired) { u.deathFired = true; fire(u, 'on_death', {}); }
          if (u.hp <= 0) { u.dead = true; u.shield = 0; ev.push({ k: 'die', u: u.id }); } else u.deathFired = false;
          ch = true;
        }
      }
      if (!ch) break;
    }
  }
  const snap = () => { const o = {}; units.forEach((u) => { const e = effStats(u); o[u.id] = { hp: Math.max(0, u.hp), mh: u.maxHp, sh: u.shield, a: Math.round(e.atk), d: Math.round(e.def), s: u.sts.map((x) => x.t), x: u.dead ? 1 : 0 }; }); return o; };
  const side = (s) => units.filter((u) => u.side === s && u.hp > 0).length;

  // départ : skills de début de combat et passifs
  for (const u of shuffle(R, units)) { if (u.skill.trigger === 'on_combat_start' || u.skill.trigger === 'passive') { u.cdLeft = 0; fire(u, u.skill.trigger, {}); u.used = 0; } }
  resolveDeaths();
  ticks.push({ ev, snap: snap() });
  let t = 0;
  while (t < cfg.combat.max_ticks && side('me') > 0 && side('bot') > 0) {
    t++; ev = [];
    const order = shuffle(R, units.filter((u) => u.hp > 0));
    for (const u of order) {
      u.sts.forEach((s) => {
        if (s.t === 'poison' || s.t === 'burn') loss(u, Math.max(1, Math.round(u.maxHp * s.v / 100)), s.t);
        else if (s.t === 'regen') heal(u, healAmt(u, s.v, u.maxHp));
        if (!s.perm) s.left--;
      });
      u.sts = u.sts.filter((s) => s.perm || s.left > 0);
    }
    resolveDeaths();
    for (const u of order) if (u.hp > 0 || !u.dead) { if (u.dead) continue; act1(u); }
    resolveDeaths();
    ticks.push({ ev, snap: snap() });
  }
  const mine = side('me'), theirs = side('bot');
  let winner;
  if (mine > 0 && theirs === 0) winner = 'me'; else if (theirs > 0 && mine === 0) winner = 'bot';
  else if (mine === 0 && theirs === 0) winner = 'draw';
  else {
    const pct = (s) => units.filter((u) => u.side === s && u.hp > 0).reduce((a, u) => a + u.hp, 0) / (totalHp[s] || 1);
    const a = pct('me'), b = pct('bot'); winner = Math.abs(a - b) < 1e-9 ? 'draw' : a > b ? 'me' : 'bot';
  }
  const stars = winner === 'draw' ? 0 : units.filter((u) => u.side === winner && u.hp > 0).reduce((a, u) => a + u.stars, 0);
  return { winner, ticks, init, heroDmg, heroHeal, energyDrain, survivorStars: stars };
}

/* ---------- fin de préparation → combat → manche suivante ---------- */
export function endPrep(st, cfg, now) {
  const me = st.me, bot = st.bot;
  if (me.pending) checkFusion(st, cfg, 'me', true);
  const un = me.hero.fx.end_turn_heal_per_unspent_energy;
  if (un) me.hero.hp = Math.min(me.hero.max_hp, me.hero.hp + un * me.energy);
  const bun = bot.hero.fx.end_turn_heal_per_unspent_energy; // appliqué après la préparation du bot
  botPrep(st, cfg);
  if (bun) bot.hero.hp = Math.min(bot.hero.max_hp, bot.hero.hp + bun * bot.energy);
  const r = simulate(cfg, st);
  const loserOf = r.winner === 'me' ? 'bot' : r.winner === 'bot' ? 'me' : null;
  const lossHero = { me: 0, bot: 0 };
  if (loserOf) lossHero[loserOf] += st.round * cfg.hero_damage.base_per_round + r.survivorStars * cfg.hero_damage.per_surviving_star;
  for (const s of ['me', 'bot']) {
    lossHero[s] += r.heroDmg[s];
    st[s].hero.hp = Math.min(st[s].hero.max_hp, st[s].hero.hp + r.heroHeal[s]) - lossHero[s];
    st[s].energy_penalty += r.energyDrain[s];
  }
  st.last = { round: st.round, winner: r.winner, ticks: r.ticks, init: r.init, loss: lossHero, hp: { me: st.me.hero.hp, bot: st.bot.hero.hp } };
  st.opp_prev = r.init.filter((u) => u.side === 'bot');
  let over = st.me.hero.hp <= 0 || st.bot.hero.hp <= 0 || st.round >= cfg.max_rounds;
  if (over) {
    const a = st.me.hero.hp, b = st.bot.hero.hp;
    st.winner = a > b ? 'me' : b > a ? 'bot' : 'draw'; st.status = 'over';
    st.deadline = null; return { ok: true, over: true };
  }
  st.round++;
  const reviewMs = Math.min(25000, 2500 + r.ticks.length * 1100);
  startRound(st, cfg, now, reviewMs);
  return { ok: true };
}

/* ---------- vue client (sans secrets) ---------- */
export function view(st, cfg, withLast = true) {
  const skills = {};
  const reg = (c) => { if (c && c.skill) skills[c.skill.id] = { id: c.skill.id, name: c.skill.name, rarity: c.skill.rarity, description: c.skill.description, cost: c.skill.cost, category: c.skill.category, trigger: c.skill.trigger }; };
  const me = st.me;
  me.deck.forEach(reg); SLOTS.forEach((s) => reg(me.board[s])); me.offer.forEach(reg);
  // skills de l'adversaire visibles dans le dernier combat (uniquement ceux qui ont été joués)
  const seen = new Set(); [...(st.last ? st.last.init : []), ...(st.opp_prev || [])].forEach((u) => seen.add(u.skill_id));
  st.bot.deck.forEach((c) => { if (seen.has(c.skill.id)) reg(c); });
  SLOTS.forEach((s) => { const c = st.bot.board[s]; if (c && seen.has(c.skill.id)) reg(c); });
  const card = (c, slot) => c && ({ uid: c.uid, slot, card_id: c.card_id, stars: c.stars, hp: c.hp, atk: c.atk, def: c.def, skill_id: c.skill.id,
    up_cost: c.stars >= cfg.max_stars ? null : cfg.stars[c.stars].upgrade_cost });
  const hero = (h) => ({ id: h.id, name: h.name, level: h.level, hp: h.hp, max_hp: h.max_hp, energy_cap: h.energy_cap });
  const last = st.last && { round: st.last.round, winner: st.last.winner, loss: st.last.loss, hp: st.last.hp };
  if (last && withLast) { last.init = st.last.init; last.ticks = st.last.ticks; }
  return {
    mode: st.mode, difficulty: st.difficulty, round: st.round, status: st.status, winner: st.winner, deadline: st.deadline, prep_start: st.prep_start,
    me: { hero: hero(me.hero), energy: me.energy, max_energy: me.max_energy, free_rerolls: me.free_rerolls, allowed: allowedSlots(me), pending: me.pending,
      board: Object.fromEntries(SLOTS.map((s) => [s, card(me.board[s], s) || null])),
      offer: me.offer.map((c, i) => c && { i, card_id: c.card_id, hp: c.hp, atk: c.atk, def: c.def, skill_id: c.skill.id, cost: isFinite(cardCost(me, c)) ? cardCost(me, c) : null }),
      reroll_cost: me.free_rerolls > 0 ? 0 : cfg.reroll_cost },
    bot: { hero: hero(st.bot.hero) },
    last, skills,
    cfg: { slots: SLOTS, max_stars: cfg.max_stars, prep_seconds: cfg.prep_seconds, stars: cfg.stars, merge_count: cfg.merge_count },
  };
}
