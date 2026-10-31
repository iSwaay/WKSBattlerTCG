// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCfg, normSkill, makeHero, newMatch, act, endPrep, view } from './engine.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const one = (x) => (Array.isArray(x) ? x[0] : x) || null;

async function loadCfg() {
  const [c, s] = await Promise.all([admin.from('game_config').select('key,value'), admin.from('star_levels').select('stars,skill_boost_pct,upgrade_cost')]);
  return buildCfg(c.data, s.data);
}
async function skillMap() {
  const { data } = await admin.from('skills').select('*');
  const m = {}; (data || []).forEach((r) => { m[r.id] = normSkill(r); }); return m;
}
const toCard = (inst, sk) => {
  const link = one(inst.card_instance_skills); const skill = link && sk[link.skill_id];
  return skill ? { card_id: inst.card_id, instance_id: inst.instance_id, hp: inst.hp, atk: inst.attack, def: inst.defense, skill } : null;
};
const INST_SEL = 'instance_id, card_id, hp, attack, defense, card_instance_skills(skill_id)';

async function playerSide(uid, deckId, cfg, sk) {
  const { data: deck } = await admin.from('decks').select('id').eq('id', deckId).eq('user_id', uid).maybeSingle();
  if (!deck) return { error: 'Deck introuvable.' };
  const { data: dc } = await admin.from('deck_cards').select('instance_id').eq('deck_id', deckId);
  const ids = (dc || []).map((r) => r.instance_id);
  if (ids.length !== 20) return { error: 'Le deck doit contenir 20 cartes.' };
  const { data: insts } = await admin.from('card_instances').select(INST_SEL).in('instance_id', ids).eq('user_id', uid);
  const cards = (insts || []).map((i) => toCard(i, sk)).filter(Boolean);
  if (cards.length !== 20) return { error: 'Deck invalide : une carte a changé de propriétaire ou n\'a pas de skill.' };
  const { data: prof } = await admin.from('profiles').select('active_hero').eq('id', uid).maybeSingle();
  const heroId = (prof && prof.active_hero) || 'pionnier';
  const [{ data: hrow }, { data: uh }] = await Promise.all([admin.from('heroes').select('*').eq('id', heroId).maybeSingle(), admin.from('user_heroes').select('level').eq('user_id', uid).eq('hero_id', heroId).maybeSingle()]);
  if (!hrow || !uh) return { error: 'Héros non possédé.' };
  return { hero: makeHero(hrow, uh.level), deck: cards, heroId };
}

async function botSide(diff, cfg, sk) {
  const { data: heroes } = await admin.from('heroes').select('*').eq('active', true);
  const hrow = heroes[Math.floor(Math.random() * heroes.length)];
  const lv = diff === 'easy' ? 1 + Math.floor(Math.random() * 3) : diff === 'hard' ? 6 + Math.floor(Math.random() * 5) : 3 + Math.floor(Math.random() * 4);
  const { count } = await admin.from('card_instances').select('instance_id', { count: 'exact', head: true });
  const off = Math.max(0, Math.floor(Math.random() * Math.max(1, (count || 0) - 500)));
  const { data } = await admin.from('card_instances').select(INST_SEL).range(off, off + 499);
  let pool = (data || []).map((i) => toCard(i, sk)).filter(Boolean);
  const score = (c) => c.hp / 8 + c.atk + c.def / 4 + ({ C: 1, R: 2, E: 3, L: 4 }[c.skill.rarity] || 1) * 6;
  pool.sort((a, b) => score(a) - score(b));
  const n = pool.length, w = Math.max(20, Math.floor(n * 0.5));
  const start = diff === 'easy' ? 0 : diff === 'hard' ? n - w : Math.floor((n - w) / 2);
  const band = pool.slice(Math.max(0, start), Math.max(0, start) + w);
  const seen = new Set(), deck = [];
  for (const c of band.sort(() => Math.random() - 0.5)) { const k = c.card_id + '|' + c.skill.id; if (!seen.has(k)) { seen.add(k); deck.push(c); if (deck.length === 20) break; } }
  for (const c of pool) { if (deck.length >= 20) break; if (!deck.includes(c)) deck.push(c); }
  if (deck.length < 20) return { error: 'Pas assez de cartes pour générer un adversaire.' };
  return { hero: makeHero(hrow, lv), deck };
}

async function finish(row, st, cfg, status) {
  let reward = null;
  if (st.status === 'over' && status !== 'abandoned') {
    if (st.winner === 'me') {
      const { data } = await admin.rpc('award_hero_xp', { p_user: row.user_id, p_hero: st.me.hero.id, p_win: true });
      if (data && data.success) reward = { xp: (await admin.from('game_config').select('value').eq('key', 'hero_xp_per_win').maybeSingle()).data?.value ?? 100, hero_xp: data.xp, level: data.level, level_before: st.me.hero.level };
    } else { await admin.rpc('award_hero_xp', { p_user: row.user_id, p_hero: st.me.hero.id, p_xp: 0, p_win: false }).catch(() => {}); }
  }
  return reward;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: ud } = await admin.auth.getUser(token);
    const uid = ud && ud.user && ud.user.id; if (!uid) return json({ error: 'Session expirée : reconnecte-toi.' }, 401);
    const body = await req.json().catch(() => ({})); const now = Date.now();
    const cfg = await loadCfg();

    if (body.action === 'start') {
      if (!['easy', 'normal', 'hard'].includes(body.difficulty || 'normal')) return json({ error: 'Difficulté invalide.' });
      const sk = await skillMap();
      const me = await playerSide(uid, body.deck_id, cfg, sk); if (me.error) return json({ error: me.error });
      const bot = await botSide(body.difficulty || 'normal', cfg, sk); if (bot.error) return json({ error: bot.error });
      await admin.from('matches').update({ status: 'abandoned', updated_at: new Date().toISOString() }).eq('user_id', uid).eq('status', 'prep');
      const st = newMatch(cfg, { seed: Math.floor(Math.random() * 4294967296), now, me, bot, difficulty: body.difficulty || 'normal' });
      const { data: row, error } = await admin.from('matches').insert({ user_id: uid, mode: 'bot', status: 'prep', state: st }).select('id').single();
      if (error) return json({ error: error.message });
      return json({ ok: true, match_id: row.id, now, view: view(st, cfg, true) });
    }

    // actions sur une partie existante
    let q = admin.from('matches').select('*').eq('user_id', uid);
    q = body.match_id ? q.eq('id', body.match_id) : q.eq('status', 'prep').order('created_at', { ascending: false }).limit(1);
    const { data: rows } = await q; const row = rows && rows[0];
    if (body.action === 'resume' && !row) return json({ ok: true, match: null, now });
    if (!row) return json({ error: 'Partie introuvable.' });
    if (row.status !== 'prep') return json({ ok: true, match_id: row.id, now, over: true, result: row.result, status: row.status });
    const st = row.state; let withLast = true, err = null, reward = null;

    if (body.action === 'forfeit') {
      await admin.from('matches').update({ status: 'abandoned', state: {}, result: { forfeit: true }, updated_at: new Date().toISOString() }).eq('id', row.id);
      return json({ ok: true, now, forfeited: true });
    }
    // chrono dépassé : la manche démarre toute seule
    if (st.status === 'prep' && st.deadline && now > st.deadline + 1500) { endPrep(st, cfg, now); withLast = true; if (body.action === 'act' && !(body.a && body.a.t === 'ready')) err = 'Temps écoulé : la manche a démarré.'; }
    else if (body.action === 'act') {
      if (st.status === 'prep' && st.prep_start && now < st.prep_start - 500 && body.a && body.a.t !== 'ready') { /* revue du combat précédent : actions acceptées quand même */ }
      const r = act(st, cfg, 'me', body.a || {}, now); if (r.error) err = r.error;
      withLast = !!(body.a && body.a.t === 'ready' && !r.error);
    }
    if (st.status === 'over') {
      reward = await finish(row, st, cfg, 'over');
      const result = { winner: st.winner, rounds: st.round, reward, hp: { me: st.me.hero.hp, bot: st.bot.hero.hp } };
      const v = view(st, cfg, true);
      await admin.from('matches').update({ status: 'over', state: {}, result, updated_at: new Date().toISOString() }).eq('id', row.id);
      return json({ ok: !err, error: err, match_id: row.id, now, view: v, reward });
    }
    await admin.from('matches').update({ state: st, updated_at: new Date().toISOString() }).eq('id', row.id);
    return json({ ok: !err, error: err, match_id: row.id, now, view: view(st, cfg, withLast) });
  } catch (e) {
    return json({ error: 'Erreur serveur : ' + (e && e.message ? e.message : e) }, 500);
  }
});
