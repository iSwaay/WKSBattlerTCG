'use strict';
/* Combat auto battler : menu des modes, préparation (achat / étoiles / placement), replay du combat.
   Toute la logique de jeu est sur le serveur (edge function "match") ; ce fichier n'affiche que l'état reçu. */

var BT = { id: null, v: null, off: 0, busy: false, sel: null, replaying: false, speed: 1, skip: false, timer: null, readySent: false, lastInit: null, active: null };
var BT_SLOTS = ['L1', 'L2', 'C1', 'R1', 'R2'];
var BT_STATUS = { poison: '☠️', burn: '🔥', bleed: '🩸', regen: '💚', freeze: '❄️', stun: '💫', silence: '🔇', taunt: '🛡️', invulnerable: '✨', reflect: '🔁', dodge: '💨', swap: '🔀' };
var BT_TRIG = { on_play: 'À la pose', on_combat_start: 'Début du combat', on_attack: 'À chaque attaque', every_n_attacks: 'Toutes les N attaques', on_hit: 'Quand touchée', on_kill: 'Quand elle tue', on_death: 'À sa mort', on_hp_below: 'Sous un seuil de PV', passive: 'Permanent' };

function btSleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }
function btNow() { return Date.now() + BT.off; }

/* ---------- appels serveur ---------- */
async function btCall(body) {
  var r = await sb.functions.invoke('match', { body: body });
  if (r.error) {
    var msg = r.error.message || 'Erreur';
    try { if (r.error.context && r.error.context.json) { var j = await r.error.context.json(); if (j && j.error) msg = j.error; } } catch (e) {}
    return { error: msg };
  }
  if (r.data && r.data.now) BT.off = r.data.now - Date.now();
  return r.data || { error: 'Réponse vide.' };
}

/* ---------- menu ---------- */
function btCompleteDecks() { return (typeof myDecks !== 'undefined' ? myDecks : []).filter(function(d){ return d.cards.length === DECK_SIZE; }); }

async function btRefreshMenu() {
  var sel = $('bt-deck'); if (!sel) return;
  var decks = btCompleteDecks(), keep = sel.value;
  sel.innerHTML = decks.length
    ? decks.map(function(d){ return '<option value="' + esc(d.id) + '">' + esc(d.name) + ' (' + d.cards.length + ' cartes)</option>'; }).join('')
    : '<option value="">Aucun deck complet</option>';
  if (keep && decks.some(function(d){ return d.id === keep; })) sel.value = keep;
  var st = $('bt-start'); if (st) st.disabled = !decks.length;
  var info = $('bt-resume');
  if (info) { if (!decks.length) { info.hidden = false; info.innerHTML = 'Crée un deck de ' + DECK_SIZE + ' cartes dans l\'onglet <b>Decks</b> pour jouer.'; } else if (!BT.active) info.hidden = true; }
  var r = await btCall({ action: 'resume' });
  BT.active = (r && r.ok && r.match_id) ? r : null;
  if (info && BT.active) {
    info.hidden = false;
    info.innerHTML = 'Une partie est en cours. <button type="button" class="btn sm primary" id="bt-resume-go">Reprendre</button> <button type="button" class="btn sm" id="bt-forfeit">Abandonner</button>';
  } else if (info && decks.length) info.hidden = true;
}

function btShow(game) {
  $('bt-menu').hidden = !!game; $('bt-game').hidden = !game;
}

async function btStart() {
  var deck = $('bt-deck').value; if (!deck) { toast('Choisis un deck.'); return; }
  var b = $('bt-start'); b.disabled = true;
  var r = await btCall({ action: 'start', deck_id: deck, difficulty: $('bt-diff').value });
  b.disabled = false;
  if (r.error) { toast(r.error); return; }
  BT.id = r.match_id; BT.lastInit = null; BT.readySent = false; BT.sel = null;
  btApply(r.view); btShow(true);
}

async function btResume() {
  var r = await btCall({ action: 'resume' });
  if (r.error) { toast(r.error); return; }
  if (!r.view) { BT.active = null; btRefreshMenu(); return; }
  BT.id = r.match_id; BT.sel = null; BT.readySent = false;
  btApply(r.view); btShow(true);
}

async function btForfeit() {
  if (!confirm('Abandonner la partie en cours ? Aucune récompense ne sera donnée.')) return;
  var r = await btCall({ action: 'forfeit', match_id: BT.active && BT.active.match_id });
  if (r.error) { toast(r.error); return; }
  BT.active = null; btRefreshMenu();
}

/* ---------- application d'un état serveur ---------- */
function btApply(v) {
  BT.v = v;
  if (v.last && v.last.init) BT.lastInit = v.last.init;
  btRender();
  btStartTimer();
}

function btSkill(id) { return (BT.v && BT.v.skills && BT.v.skills[id]) || { name: '?', description: '', rarity: 'C', cost: 0 }; }
function btRarCls(c) { return RAR[ri(c ? c.r : 'C')].cls; }

/* ---------- rendu d'une carte posée ---------- */
function btUnitHTML(u, o) {
  o = o || {};
  var c = cardById(u.card_id) || { t: '?', r: 'C', img: null };
  var sk = btSkill(u.skill_id), has = c.img && /^http|data:image\//.test(c.img);
  var m = String(c.t).match(/[A-Za-zÀ-ÿ0-9]/), ini = m ? m[0].toUpperCase() : '?';
  var skr = RAR[ri(String(sk.rarity || 'C').toUpperCase())].cls;
  var stars = '';
  for (var i = 0; i < u.stars; i++) stars += '★';
  return '<div class="bt-unit rc-' + btRarCls(c) + '" ' + (o.uid ? 'data-uid="' + esc(o.uid) + '"' : '') + ' title="' + esc(c.t + ' — ' + sk.name + ' : ' + sk.description) + '">' +
    '<span class="bt-uimg">' + (has ? '<img src="' + esc(c.img) + '" alt="" draggable="false">' : '<b>' + esc(ini) + '</b>') + '</span>' +
    '<span class="bt-stars s' + u.stars + '">' + stars + '</span>' +
    '<span class="bt-uname">' + esc(c.t) + '</span>' +
    '<span class="bt-hpbar"><i style="width:100%"></i><em class="bt-shield" style="width:0"></em></span>' +
    '<span class="bt-ustats"><i>⚔ <b class="bt-a">' + u.atk + '</b></i><i>🛡 <b class="bt-d">' + u.def + '</b></i><i>❤ <b class="bt-h">' + u.hp + '</b></i></span>' +
    '<span class="bt-usk sk-' + skr + '">' + esc(sk.name) + '</span>' +
    '<span class="bt-sts"></span>' +
  '</div>';
}

function btOffCardHTML(o, energy) {
  if (!o) return '<div class="bt-off bt-off-empty">—</div>';
  var u = { card_id: o.card_id, stars: 1, hp: o.hp, atk: o.atk, def: o.def, skill_id: o.skill_id };
  var can = o.cost != null && o.cost <= energy, sel = BT.sel && BT.sel.t === 'offer' && BT.sel.i === o.i;
  var sk = btSkill(o.skill_id);
  return '<button type="button" class="bt-off' + (can ? '' : ' bt-off-no') + (sel ? ' sel' : '') + '" data-off="' + o.i + '">' +
    btUnitHTML(u) + '<span class="bt-cost">' + (o.cost == null ? '🚫' : '⚡ ' + o.cost) + '</span>' +
    '<span class="bt-skdesc">' + esc(sk.description || '') + '</span></button>';
}

/* ---------- rendu principal (préparation) ---------- */
function btHeroBar(h, who) {
  var def = heroById(h.id), pct = Math.max(0, Math.min(100, Math.round(h.hp / h.max_hp * 100)));
  return '<div class="bt-hero bt-hero-' + who + '"><span class="bt-hav">' + (def ? '<img src="' + esc(def.image) + '" alt="" draggable="false">' : '') + '</span>' +
    '<span class="bt-hinfo"><b>' + esc(h.name) + ' <small>niv. ' + h.level + '</small></b>' +
    '<span class="bt-hhp"><i style="width:' + pct + '%"></i></span><em>' + Math.max(0, h.hp) + ' / ' + h.max_hp + ' PV</em></span></div>';
}

function btLanes(cellsArr) {
  return '<div class="bt-lanes"><div class="bt-lane l2">' + cellsArr[0] + cellsArr[1] + '</div><div class="bt-lane l1">' + cellsArr[2] + '</div><div class="bt-lane l2">' + cellsArr[3] + cellsArr[4] + '</div></div>';
}

function btBoardCells(side, v) {
  return BT_SLOTS.map(function(s) {
    if (side === 'me') {
      var u = v.me.board[s], allowed = v.me.allowed.indexOf(s) >= 0;
      var sel = BT.sel && BT.sel.t === 'board' && BT.sel.slot === s;
      return '<button type="button" class="bt-cell' + (u ? ' full' : '') + (allowed ? '' : ' blocked') + (sel ? ' sel' : '') + '" data-slot="' + s + '"' + (allowed ? '' : ' disabled') + '>' +
        (u ? btUnitHTML(u, { uid: 'me.' + s }) : '<span class="bt-empty">' + (allowed ? '＋' : '🚫') + '</span>') + '</button>';
    }
    var p = (BT.lastInit || []).filter(function(x){ return x.side === 'bot' && x.slot === s; })[0];
    return '<div class="bt-cell ghost' + (p ? ' full' : '') + '">' + (p ? btUnitHTML(p, { uid: 'bot.' + s }) : '<span class="bt-empty">·</span>') + '</div>';
  });
}

function btInfoHTML(v) {
  var s = BT.sel;
  if (!s) return '<p class="hint" style="margin:0">Touche une carte proposée puis un emplacement pour la poser. Touche une carte posée pour la monter d\'étoile ou la déplacer.</p>';
  if (s.t === 'offer') {
    var o = v.me.offer[s.i]; if (!o) return '';
    var sk = btSkill(o.skill_id), c = cardById(o.card_id);
    return '<b>' + esc(c ? c.t : '?') + '</b> — ' + esc(sk.name) + ' <span class="muted">(' + esc(BT_TRIG[sk.trigger] || '') + ')</span><br><span class="muted">' + esc(sk.description) + '</span><br><em>Choisis un emplacement pour la poser (' + (o.cost == null ? 'injouable' : o.cost + ' ⚡') + ').</em>';
  }
  var u = v.me.board[s.slot]; if (!u) return '';
  var sk2 = btSkill(u.skill_id), c2 = cardById(u.card_id), boost = (v.cfg.stars[u.stars] || {}).skill_boost_pct || 0;
  var up = u.up_cost == null ? '<span class="muted">Étoiles au maximum</span>'
    : '<button type="button" class="btn sm primary" id="bt-up"' + (v.me.energy < u.up_cost ? ' disabled' : '') + '>Monter ★ (' + u.up_cost + ' ⚡)</button>';
  return '<b>' + esc(c2 ? c2.t : '?') + '</b> ' + '★'.repeat(u.stars) + ' — ' + esc(sk2.name) + ' <span class="muted">(' + esc(BT_TRIG[sk2.trigger] || '') + ', +' + boost + ' % skill)</span><br><span class="muted">' + esc(sk2.description) + '</span><br>' + up + ' <span class="muted">ou touche un autre emplacement pour déplacer / échanger.</span>';
}

function btRender() {
  var g = $('bt-game'), v = BT.v; if (!g || !v) return;
  if (v.status === 'over') { btRenderOver(); return; }
  var pend = v.me.pending;
  g.innerHTML =
    '<div class="bt-bar"><button type="button" class="btn sm" id="bt-quit">Abandonner</button>' +
      '<span class="bt-round">Manche <b>' + v.round + '</b></span>' +
      '<span class="bt-timer" id="bt-timer">—</span></div>' +
    btHeroBar(v.bot.hero, 'bot') +
    '<div class="bt-board bt-board-bot" id="bt-board-bot">' + btLanes(btBoardCells('bot', v)) + '</div>' +
    '<div class="bt-vs">⚔ <span>face à face — mêmes couloirs</span></div>' +
    '<div class="bt-board bt-board-me" id="bt-board-me">' + btLanes(btBoardCells('me', v)) + '</div>' +
    btHeroBar(v.me.hero, 'me') +
    '<div class="bt-energy"><span class="bt-en"><b>⚡ ' + v.me.energy + '</b> / ' + v.me.max_energy + '</span>' +
      '<button type="button" class="btn sm" id="bt-reroll">Relancer (' + v.me.reroll_cost + ' ⚡)</button>' +
      '<button type="button" class="btn primary" id="bt-ready">Prêt ▶</button></div>' +
    '<div class="bt-offers">' + v.me.offer.map(function(o){ return btOffCardHTML(o, v.me.energy); }).join('') + '</div>' +
    '<div class="bt-info" id="bt-info">' + btInfoHTML(v) + '</div>' +
    (pend ? btFusionHTML(pend, v) : '');
}

function btFusionHTML(p, v) {
  var c = cardById(p.card_id);
  return '<div class="bt-modal"><div class="panel"><h3 style="margin:0 0 6px">Fusion : ' + esc(c ? c.t : '?') + ' → ★' + (p.stars + 1) + '</h3>' +
    '<p class="muted" style="margin:0 0 12px">Choisis le skill que garde la carte fusionnée.</p>' +
    p.options.map(function(id){ var sk = btSkill(id);
      return '<button type="button" class="bt-fopt" data-fusion="' + id + '"><b class="sk-' + RAR[ri(String(sk.rarity).toUpperCase())].cls + '">' + esc(sk.name) + '</b><span>' + esc(sk.description) + '</span></button>'; }).join('') +
  '</div></div>';
}

/* ---------- chrono ---------- */
function btStartTimer() {
  if (BT.timer) clearInterval(BT.timer);
  var tick = function() {
    var v = BT.v, el = $('bt-timer'); if (!v || v.status !== 'prep' || !el) return;
    if (BT.replaying) { el.textContent = '…'; return; }
    var left = Math.max(0, Math.ceil((v.deadline - btNow()) / 1000));
    el.textContent = left + ' s'; el.classList.toggle('low', left <= 8);
    if (left <= 0 && !BT.readySent && !BT.busy) btReady(true);
  };
  tick(); BT.timer = setInterval(tick, 500);
}

/* ---------- actions ---------- */
async function btAct(a) {
  if (BT.busy || BT.replaying) return null;
  BT.busy = true;
  var r = await btCall({ action: 'act', match_id: BT.id, a: a });
  BT.busy = false;
  if (r.error && !r.view) { toast(r.error); return r; }
  if (r.view) { if (r.error) toast(r.error); BT.sel = null; btApply(r.view); }
  return r;
}

async function btReady(auto) {
  if (BT.readySent || BT.busy || BT.replaying) return;
  BT.readySent = true; BT.busy = true;
  var r = await btCall({ action: 'act', match_id: BT.id, a: { t: 'ready' } });
  BT.busy = false;
  if (r.error && !r.view) { BT.readySent = false; toast(r.error); return; }
  if (!r.view) { BT.readySent = false; return; }
  await btReplay(r.view, r.reward);
  BT.readySent = false;
}

/* ---------- replay du combat ---------- */
var BT_ICON = { atk: '⚔', skill: '✦' };

function btUnitEl(id) { var el = document.querySelector('#bt-game [data-uid="' + id + '"]'); return el; }
function btFloat(id, txt, cls) {
  var el = btUnitEl(id); if (!el) return;
  var f = document.createElement('span'); f.className = 'bt-float ' + (cls || ''); f.textContent = txt;
  el.appendChild(f); setTimeout(function(){ if (f.parentNode) f.parentNode.removeChild(f); }, 900);
}
function btApplySnap(snap) {
  Object.keys(snap).forEach(function(id) {
    var el = btUnitEl(id), s = snap[id]; if (!el) return;
    var bar = el.querySelector('.bt-hpbar i'); if (bar) bar.style.width = Math.max(0, Math.min(100, s.hp / s.mh * 100)) + '%';
    var sh = el.querySelector('.bt-shield'); if (sh) sh.style.width = Math.min(100, s.sh / s.mh * 100) + '%';
    var h = el.querySelector('.bt-h'); if (h) h.textContent = s.hp;
    var a = el.querySelector('.bt-a'); if (a) a.textContent = s.a;
    var d = el.querySelector('.bt-d'); if (d) d.textContent = s.d;
    var st = el.querySelector('.bt-sts'); if (st) st.textContent = (s.s || []).map(function(t){ return BT_STATUS[t] || ''; }).join('');
    el.classList.toggle('dead', !!s.x);
  });
}
function btEvent(e) {
  var cls;
  switch (e.k) {
    case 'atk': { var el = btUnitEl(e.a); if (el) { var dir = e.a.indexOf('me.') === 0 ? 'lunge-up' : 'lunge-down'; el.classList.add(dir); setTimeout(function(){ el.classList.remove(dir); }, 260); } break; }
    case 'dmg': btFloat(e.u, '-' + e.d, 'dmg'); { var t = btUnitEl(e.u); if (t) { t.classList.add('hit'); setTimeout(function(){ t.classList.remove('hit'); }, 260); } } break;
    case 'dot': case 'reflect': case 'bleed': case 'self': btFloat(e.u, '-' + e.d, 'dot'); break;
    case 'heal': btFloat(e.u, '+' + e.d, 'heal'); break;
    case 'shield': btFloat(e.u, '🛡 +' + e.d, 'shield'); break;
    case 'skill': btFloat(e.u, '✦ ' + e.n, 'skill'); break;
    case 'block': btFloat(e.u, 'Bloqué', 'miss'); break;
    case 'dodge': btFloat(e.u, 'Esquive', 'miss'); break;
    case 'status': btFloat(e.u, BT_STATUS[e.s] || e.s, 'skill'); break;
    case 'skip': btFloat(e.u, 'Passe…', 'miss'); break;
    case 'revive': btFloat(e.u, 'Retour !', 'heal'); break;
    case 'maxhp': btFloat(e.u, (e.d > 0 ? '+' : '') + e.d + ' PV max', e.d > 0 ? 'heal' : 'dot'); break;
  }
}

async function btReplay(v, reward) {
  var last = v.last; BT.replaying = true;
  var el = $('bt-timer'); if (el) el.textContent = '…';
  if (!last || !last.ticks) { BT.replaying = false; btApply(v); return; }
  // plateau figé = ce qui a combattu
  var g = $('bt-game'), pv = BT.v;
  var cellsMe = [], cellsBot = [];
  BT_SLOTS.forEach(function(s) {
    var m = last.init.filter(function(x){ return x.side === 'me' && x.slot === s; })[0];
    var b = last.init.filter(function(x){ return x.side === 'bot' && x.slot === s; })[0];
    cellsMe.push('<div class="bt-cell ghost' + (m ? ' full' : '') + '">' + (m ? btUnitHTML(m, { uid: 'me.' + s }) : '<span class="bt-empty">·</span>') + '</div>');
    cellsBot.push('<div class="bt-cell ghost' + (b ? ' full' : '') + '">' + (b ? btUnitHTML(b, { uid: 'bot.' + s }) : '<span class="bt-empty">·</span>') + '</div>');
  });
  BT.v = Object.assign({}, v, { skills: Object.assign({}, pv && pv.skills, v.skills) });
  var rd = last.round;
  g.innerHTML =
    '<div class="bt-bar"><span class="bt-round">Combat — manche <b>' + rd + '</b></span>' +
      '<span class="bt-speed"><button type="button" class="btn sm" id="bt-spd">×' + BT.speed + '</button> <button type="button" class="btn sm" id="bt-skip">Passer ⏭</button></span></div>' +
    '<div class="bt-heroes-replay">' + btHeroBar(pv ? pv.bot.hero : v.bot.hero, 'bot') + '</div>' +
    '<div class="bt-board bt-board-bot">' + btLanes(cellsBot) + '</div>' +
    '<div class="bt-vs">⚔</div>' +
    '<div class="bt-board bt-board-me">' + btLanes(cellsMe) + '</div>' +
    '<div class="bt-heroes-replay">' + btHeroBar(pv ? pv.me.hero : v.me.hero, 'me') + '</div>' +
    '<div class="bt-banner" id="bt-banner" hidden></div>';
  BT.skip = false;
  await btSleep(500 / BT.speed);
  for (var i = 0; i < last.ticks.length && !BT.skip; i++) {
    var tk = last.ticks[i], evs = tk.ev, n = evs.length;
    var gap = n ? Math.min(170, 800 / n) : 0;
    for (var j = 0; j < n && !BT.skip; j++) { btEvent(evs[j]); await btSleep(gap / BT.speed); }
    btApplySnap(tk.snap);
    await btSleep(260 / BT.speed);
  }
  if (BT.skip && last.ticks.length) btApplySnap(last.ticks[last.ticks.length - 1].snap);
  // bannière de résultat
  var ban = $('bt-banner');
  var txt = last.winner === 'me' ? '🏆 Manche gagnée' : last.winner === 'bot' ? '💀 Manche perdue' : '🤝 Égalité';
  if (ban) {
    ban.hidden = false;
    ban.innerHTML = '<b>' + txt + '</b><span>Ton héros : −' + (last.loss.me || 0) + ' PV · Adversaire : −' + (last.loss.bot || 0) + ' PV</span>';
  }
  await btSleep(BT.skip ? 700 : 1700);
  BT.replaying = false; BT.sel = null;
  if (v.status === 'over') { BT.v = v; BT.reward = reward; btRenderOver(); return; }
  btApply(v);
}

function btRenderOver() {
  var v = BT.v, g = $('bt-game'); if (BT.timer) clearInterval(BT.timer);
  var w = v.winner, rw = BT.reward;
  var title = w === 'me' ? '🏆 Victoire !' : w === 'bot' ? '💀 Défaite' : '🤝 Égalité';
  g.innerHTML = '<div class="panel bt-over"><h2>' + title + '</h2>' +
    '<p class="muted">Partie terminée à la manche ' + v.round + '.</p>' +
    '<div class="bt-over-hp">' + btHeroBar(v.me.hero, 'me') + btHeroBar(v.bot.hero, 'bot') + '</div>' +
    (rw ? '<p class="bt-reward">+' + rw.xp + ' XP pour ' + esc(v.me.hero.name) + (rw.level > rw.level_before ? ' — <b>niveau ' + rw.level + ' !</b>' : '') + '</p>' : '') +
    '<button type="button" class="btn primary" id="bt-back">Retour au menu</button></div>';
}

/* ---------- événements ---------- */
document.addEventListener('click', function(e) {
  var t = e.target;
  if (t.closest('#bt-start')) { btStart(); return; }
  if (t.closest('#bt-resume-go')) { btResume(); return; }
  if (t.closest('#bt-forfeit')) { btForfeit(); return; }
  if (t.closest('#bt-back')) {
    BT.id = null; BT.v = null; BT.reward = null; BT.active = null; btShow(false);
    try { loadHeroes(); } catch (x) {}
    btRefreshMenu(); return;
  }
  if (!$('bt-game') || $('bt-game').hidden) return;
  if (t.closest('#bt-spd')) { BT.speed = BT.speed === 1 ? 2 : BT.speed === 2 ? 4 : 1; $('bt-spd').textContent = '×' + BT.speed; return; }
  if (t.closest('#bt-skip')) { BT.skip = true; return; }
  if (BT.replaying) return;
  if (t.closest('#bt-quit')) {
    if (!confirm('Abandonner la partie en cours ? Aucune récompense ne sera donnée.')) return;
    btCall({ action: 'forfeit', match_id: BT.id }).then(function(){ BT.id = null; BT.v = null; BT.active = null; if (BT.timer) clearInterval(BT.timer); btShow(false); btRefreshMenu(); });
    return;
  }
  if (t.closest('#bt-ready')) { btReady(false); return; }
  if (t.closest('#bt-reroll')) { btAct({ t: 'reroll' }); return; }
  if (t.closest('#bt-up')) { if (BT.sel && BT.sel.t === 'board') btAct({ t: 'upgrade', slot: BT.sel.slot }); return; }
  var fu = t.closest('[data-fusion]'); if (fu) { btAct({ t: 'fusion', skill_id: parseInt(fu.getAttribute('data-fusion'), 10) }); return; }
  var off = t.closest('[data-off]');
  if (off) {
    var i = parseInt(off.getAttribute('data-off'), 10);
    BT.sel = (BT.sel && BT.sel.t === 'offer' && BT.sel.i === i) ? null : { t: 'offer', i: i };
    btRender(); return;
  }
  var cell = t.closest('.bt-board-me .bt-cell');
  if (cell) {
    var slot = cell.getAttribute('data-slot'), v = BT.v, cur = v.me.board[slot], s = BT.sel;
    if (s && s.t === 'offer') {
      var o = v.me.offer[s.i];
      if (cur && !confirm('Remplacer la carte posée sur cet emplacement ?')) return;
      btAct({ t: 'buy', i: s.i, slot: slot }); return;
    }
    if (s && s.t === 'board') {
      if (s.slot === slot) { BT.sel = null; btRender(); return; }
      btAct({ t: 'move', from: s.slot, to: slot }); return;
    }
    if (cur) { BT.sel = { t: 'board', slot: slot }; btRender(); }
    return;
  }
});
