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
  const card = one(inst.cards);
  return skill ? { card_id: inst.card_id, instance_id: inst.instance_id, rarity: (card && card.rarity) || 'C', hp: inst.hp, atk: inst.attack, def: 0, skill } : null;
};
const INST_SEL = 'instance_id, card_id, hp, attack, defense, cards(rarity), card_instance_skills(skill_id)';
const RAR_NAME = { L: 'Légendaire', E: 'Épique', R: 'Rare', C: 'Commune' };
async function rarityLimits() { return (await admin.from('game_config').select('value').eq('key', 'deck_rarity_limits').maybeSingle()).data?.value || {}; }
function overLimits(cards, lim) {
  const n = {}; cards.forEach((c) => { n[c.rarity] = (n[c.rarity] || 0) + 1; });
  return Object.keys(lim).filter((r) => (n[r] || 0) > lim[r]).map((r) => n[r] + ' ' + RAR_NAME[r] + (n[r] > 1 ? 's' : '') + ' (max ' + lim[r] + ')');
}

async function playerSide(uid, deckId, cfg, sk) {
  const { data: deck } = await admin.from('decks').select('id').eq('id', deckId).eq('user_id', uid).maybeSingle();
  if (!deck) return { error: 'Deck introuvable.' };
  const { data: dc } = await admin.from('deck_cards').select('instance_id').eq('deck_id', deckId);
  const ids = (dc || []).map((r) => r.instance_id);
  if (ids.length !== 20) return { error: 'Le deck doit contenir 20 cartes.' };
  const { data: insts } = await admin.from('card_instances').select(INST_SEL).in('instance_id', ids).eq('user_id', uid);
  const cards = (insts || []).map((i) => toCard(i, sk)).filter(Boolean);
  if (cards.length !== 20) return { error: 'Deck invalide : une carte a changé de propriétaire ou n\'a pas de skill.' };
  const bad = overLimits(cards, await rarityLimits());
  if (bad.length) return { error: 'Ce deck dépasse la limite de raretés : ' + bad.join(', ') + '. Modifie-le dans l\'onglet Decks.' };
  const { data: prof } = await admin.from('profiles').select('active_hero').eq('id', uid).maybeSingle();
  const heroId = (prof && prof.active_hero) || 'pionnier';
  const [{ data: hrow }, { data: uh }] = await Promise.all([admin.from('heroes').select('*').eq('id', heroId).maybeSingle(), admin.from('user_heroes').select('level').eq('user_id', uid).eq('hero_id', heroId).maybeSingle()]);
  if (!hrow || !uh) return { error: 'Héros non possédé.' };
  return { hero: makeHero(hrow, uh.level), deck: cards, heroId };
}


const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
const iso = () => new Date().toISOString();
const ACTIVE_MS = 30 * 60 * 1000;

async function rewardFor(uid, hero, win) {
  if (win) {
    const { data } = await admin.rpc('award_hero_xp', { p_user: uid, p_hero: hero.id, p_win: true });
    if (data && data.success) return { xp: (await admin.from('game_config').select('value').eq('key', 'hero_xp_per_win').maybeSingle()).data?.value ?? 100, hero_xp: data.xp, level: data.level, level_before: hero.level };
  } else { await admin.rpc('award_hero_xp', { p_user: uid, p_hero: hero.id, p_xp: 0, p_win: false }).catch(() => {}); }
  return null;
}
/* récompenses (XP de héros) : victoire = comme contre un bot ; un abandon avant la 2e manche ne rapporte rien */
async function settle(row, st, forfeit) {
  const rewards = { me: null, bot: null };
  if (st.winner === 'me' || st.winner === 'bot') {
    if (!(forfeit && st.round < 2)) {
      const uid = { me: row.host_id, bot: row.guest_id };
      for (const sd of ['me', 'bot']) rewards[sd] = await rewardFor(uid[sd], st[sd].hero, st.winner === sd);
    }
  }
  return rewards;
}
const viewerOf = (row, uid) => (row.host_id === uid ? 'me' : 'bot');
function resultFor(row, viewer) { const r = row.result || {}; return r.rewards ? r.rewards[viewer] : null; }

/* applique une action (ou un simple rafraîchissement) sur un duel en cours, avec verrou optimiste (2 joueurs écrivent la même ligne) */
async function step(rowId, uid, body, cfg, now) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row } = await admin.from('duels').select('*').eq('id', rowId).maybeSingle();
    if (!row || (row.host_id !== uid && row.guest_id !== uid)) return { error: 'Duel introuvable.' };
    const viewer = viewerOf(row, uid);
    if (row.status === 'over') return { ok: true, duel_id: row.id, now, view: view(row.state, cfg, true, viewer), reward: resultFor(row, viewer) };
    if (row.status !== 'prep') return { ok: true, duel_id: row.id, now, status: row.status, ended: true };
    const st = row.state; let err = null, forfeit = false, changed = false;
    if (body.action === 'forfeit') { st.status = 'over'; st.winner = viewer === 'me' ? 'bot' : 'me'; st.deadline = null; forfeit = true; changed = true; }
    else if (st.status === 'prep' && st.deadline && now > st.deadline + 1500) {
      endPrep(st, cfg, now); changed = true;
      if (body.action === 'act' && !(body.a && body.a.t === 'ready')) err = 'Temps écoulé : la manche a démarré.';
    } else if (body.action === 'act') {
      const r = act(st, cfg, viewer, body.a || {}, now); if (r.error) err = r.error; else changed = true;
    }
    if (!changed) return { ok: true, duel_id: row.id, now, view: view(st, cfg, true, viewer) };   // simple sondage : lecture seule
    let patch = { state: st, updated_at: iso() };
    if (st.status === 'over') patch = { ...patch, status: 'over', result: { winner: st.winner, rounds: st.round, forfeit, rewards: { me: null, bot: null }, hp: { me: st.me.hero.hp, bot: st.bot.hero.hp } } };
    const { data: upd } = await admin.from('duels').update(patch).eq('id', row.id).eq('updated_at', row.updated_at).select('id');
    if (!upd || !upd.length) continue; // l'autre joueur a écrit entre-temps : on recharge
    let rewards = null;
    if (st.status === 'over') {   // la fin de partie n'est validée qu'une fois (verrou) : l'XP n'est donc donnée qu'une fois
      rewards = await settle(row, st, forfeit);
      await admin.from('duels').update({ result: { ...patch.result, rewards } }).eq('id', row.id);
    }
    return { ok: !err, error: err, duel_id: row.id, now, view: view(st, cfg, true, viewer), reward: rewards ? rewards[viewer] : null };
  }
  return { error: 'Serveur occupé, réessaie.' };
}

async function activeDuel(uid) {
  const since = new Date(Date.now() - ACTIVE_MS).toISOString();
  const { data } = await admin.from('duels').select('*').or(`host_id.eq.${uid},guest_id.eq.${uid}`).in('status', ['waiting', 'prep']).order('created_at', { ascending: false });
  for (const r of data || []) {
    if (r.status === 'waiting' && (new Date(r.expires_at).getTime() < Date.now() || r.guest_id)) { await admin.from('duels').update({ status: 'cancelled' }).eq('id', r.id); continue; }
    if (r.status === 'prep' && r.updated_at < since) { await admin.from('duels').update({ status: 'abandoned' }).eq('id', r.id); continue; }
    return r;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: ud } = await admin.auth.getUser(token);
    const uid = ud && ud.user && ud.user.id; if (!uid) return json({ error: 'Session expirée : reconnecte-toi.' }, 401);
    const body = await req.json().catch(() => ({})); const now = Date.now();
    const a = body.action;

    // replay synchronisé : vitesse (×1/×2/×4) et « Passer » s'appliquent aux deux joueurs
    if (a === 'replay_set' || a === 'replay_get') {
      const { data: row } = await admin.from('duels').select('id, host_id, guest_id, replay').eq('id', body.duel_id).maybeSingle();
      if (!row || (row.host_id !== uid && row.guest_id !== uid)) return json({ error: 'Duel introuvable.' });
      let rp = row.replay || {};
      if (a === 'replay_set') {
        // vitesse : partagée pour tout le duel ; « Passer » : pour la manche indiquée
        if ([1, 2, 4].includes(body.speed)) rp.speed = body.speed;
        if (body.skip === true && Number(body.round) > 0) rp.skip_round = Number(body.round);
        await admin.from('duels').update({ replay: rp }).eq('id', row.id);
      }
      return json({ ok: true, now, replay: rp });
    }

    const cfg = await loadCfg();

    if (a === 'create') {
      const cur = await activeDuel(uid);
      if (cur && cur.status === 'prep') return json({ error: 'Tu as déjà un duel en cours.' });
      if (cur) await admin.from('duels').update({ status: 'cancelled', updated_at: iso() }).eq('id', cur.id);
      let friend = null;
      if (body.friend_id) {
        const { data: fr } = await admin.from('friends').select('id').eq('status', 'accepted').or(`and(user_id.eq.${uid},friend_id.eq.${body.friend_id}),and(user_id.eq.${body.friend_id},friend_id.eq.${uid})`).limit(1);
        if (!fr || !fr.length) return json({ error: 'Ce joueur n\'est pas dans tes amis.' });
        friend = body.friend_id;
      }
      const sk = await skillMap();
      const me = await playerSide(uid, body.deck_id, cfg, sk); if (me.error) return json({ error: me.error });
      for (let i = 0; i < 6; i++) {
        const code = genCode();
        const { data: row, error } = await admin.from('duels').insert({ code, host_id: uid, invited_id: friend, host_setup: { hero: me.hero, deck: me.deck } }).select('id, code, expires_at').single();
        if (!error) return json({ ok: true, now, duel_id: row.id, code: row.code, expires_at: row.expires_at, invited: friend });
        if (!/duplicate|unique/i.test(error.message)) return json({ error: error.message });
      }
      return json({ error: 'Impossible de générer un code, réessaie.' });
    }

    if (a === 'join') {
      const cur = await activeDuel(uid);
      if (cur && cur.status === 'prep') return json({ error: 'Tu as déjà un duel en cours.' });
      let q = admin.from('duels').select('*').eq('status', 'waiting').gt('expires_at', iso());
      q = body.duel_id ? q.eq('id', body.duel_id) : q.eq('code', String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
      const { data: rows } = await q.limit(1); const row = rows && rows[0];
      if (!row) return json({ error: 'Code invalide ou duel expiré.' });
      if (row.host_id === uid) return json({ error: 'C\'est ton propre duel : partage le code à un ami.' });
      if (row.invited_id && row.invited_id !== uid) return json({ error: 'Ce duel est réservé à un autre joueur.' });
      const sk = await skillMap();
      const guest = await playerSide(uid, body.deck_id, cfg, sk); if (guest.error) return json({ error: guest.error });
      const host = row.host_setup;
      const st = newMatch(cfg, { seed: Math.floor(Math.random() * 4294967296), now, me: host, bot: guest, difficulty: 'pvp', mode: 'pvp' });
      if (cur) await admin.from('duels').update({ status: 'cancelled', updated_at: iso() }).eq('id', cur.id);
      const { data: upd, error } = await admin.from('duels').update({ guest_id: uid, status: 'prep', state: st, host_setup: null, updated_at: iso() }).eq('id', row.id).eq('status', 'waiting').select('id');
      if (error) return json({ error: error.message });
      if (!upd || !upd.length) return json({ error: 'Ce duel vient d\'être pris.' });
      return json({ ok: true, now, duel_id: row.id, view: view(st, cfg, true, 'bot') });
    }

    if (a === 'invites') {
      const { data } = await admin.from('duels').select('id, host_id, created_at, expires_at').eq('invited_id', uid).eq('status', 'waiting').gt('expires_at', iso()).order('created_at', { ascending: false }).limit(10);
      const ids = (data || []).map((r) => r.host_id);
      const names = {};
      if (ids.length) { const { data: ps } = await admin.from('profiles').select('id, username').in('id', ids); (ps || []).forEach((p) => { names[p.id] = p.username; }); }
      return json({ ok: true, now, invites: (data || []).map((r) => ({ duel_id: r.id, from: names[r.host_id] || 'Un ami', expires_at: r.expires_at })) });
    }

    if (a === 'decline') {
      await admin.from('duels').update({ status: 'cancelled', updated_at: iso() }).eq('id', body.duel_id).eq('invited_id', uid).eq('status', 'waiting');
      return json({ ok: true, now });
    }
    if (a === 'cancel') {
      await admin.from('duels').update({ status: 'cancelled', updated_at: iso() }).eq('id', body.duel_id).eq('host_id', uid).eq('status', 'waiting');
      return json({ ok: true, now });
    }

    if (a === 'resume') {
      const row = await activeDuel(uid);
      if (!row) return json({ ok: true, now, duel: null });
      if (row.status === 'waiting') return json({ ok: true, now, duel: { id: row.id, status: 'waiting', code: row.code, expires_at: row.expires_at, invited: !!row.invited_id } });
      return json({ ok: true, now, duel: { id: row.id, status: 'prep' } });
    }

    if (a === 'poll' || a === 'act' || a === 'forfeit') {
      if (!body.duel_id) return json({ error: 'Duel manquant.' });
      const { data: row } = await admin.from('duels').select('id, status, host_id, guest_id, code, expires_at').eq('id', body.duel_id).maybeSingle();
      if (!row || (row.host_id !== uid && row.guest_id !== uid)) return json({ error: 'Duel introuvable.' });
      if (row.status === 'waiting') {
        if (a === 'forfeit') { await admin.from('duels').update({ status: 'cancelled' }).eq('id', row.id); return json({ ok: true, now, ended: true }); }
        if (new Date(row.expires_at).getTime() < now) { await admin.from('duels').update({ status: 'cancelled' }).eq('id', row.id); return json({ ok: true, now, status: 'cancelled', ended: true }); }
        return json({ ok: true, now, status: 'waiting', code: row.code });
      }
      return json(await step(row.id, uid, body, cfg, now));
    }
    return json({ error: 'Action inconnue.' });
  } catch (e) {
    return json({ error: 'Erreur serveur : ' + (e && e.message ? e.message : e) }, 500);
  }
});
