'use strict';
/* Combat auto battler : menu des modes, préparation (achat / étoiles / placement), replay du combat.
   Toute la logique de jeu est sur le serveur (edge function "match") ; ce fichier n'affiche que l'état reçu. */

var BT = { id: null, v: null, off: 0, busy: false, sel: null, replaying: false, speed: 1, skip: false, timer: null, readySent: false, lastInit: null, active: null, pvp: false, seenRound: 0 };
var BT_SLOTS = ['L1', 'L2', 'C1', 'R1', 'R2'];
var BT_STATUS = { poison: '☠️', burn: '🔥', bleed: '🩸', regen: '💚', freeze: '❄️', stun: '💫', silence: '🔇', taunt: '🛡️', invulnerable: '✨', reflect: '🔁', dodge: '💨', swap: '🔀' };
var BT_TRIG = { on_play: 'À la pose', on_combat_start: 'Début du combat', on_attack: 'À chaque attaque', every_n_attacks: 'Toutes les N attaques', on_hit: 'Quand touchée', on_kill: 'Quand elle tue', on_death: 'À sa mort', on_hp_below: 'Sous un seuil de PV', passive: 'Permanent' };

function btSleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }
function btNow() { return Date.now() + BT.off; }

/* ---------- appels serveur ---------- */
async function btCall(body, fn) {
  var r = await sb.functions.invoke(fn || 'match', { body: body });
  if (r.error) {
    var msg = r.error.message || 'Erreur';
    try { if (r.error.context && r.error.context.json) { var j = await r.error.context.json(); if (j && j.error) msg = j.error; } } catch (e) {}
    return { error: msg };
  }
  if (r.data && r.data.now) BT.off = r.data.now - Date.now();
  return r.data || { error: 'Réponse vide.' };
}

/* appel de la partie en cours : bot (fonction "match") ou duel entre joueurs (fonction "duel") */
function btGame(body) {
  return BT.pvp ? btCall(Object.assign({ duel_id: BT.id }, body), 'duel') : btCall(Object.assign({ match_id: BT.id }, body));
}

/* ---------- menu ---------- */
function btCompleteDecks() { return (typeof myDecks !== 'undefined' ? myDecks : []).filter(function(d){ return d.cards.length === DECK_SIZE && !(typeof deckOverLimit === 'function' && deckOverLimit(d)); }); }

async function btRefreshMenu() {
  var sel = $('bt-deck'); if (!sel) return;
  var decks = btCompleteDecks(), keep = sel.value;
  sel.innerHTML = decks.length
    ? decks.map(function(d){ return '<option value="' + esc(d.id) + '">' + esc(d.name) + ' (' + d.cards.length + ' cartes)</option>'; }).join('')
    : '<option value="">Aucun deck complet</option>';
  if (keep && decks.some(function(d){ return d.id === keep; })) sel.value = keep;
  var st = $('bt-start'); if (st) st.disabled = !decks.length;
  var info = $('bt-resume');
  var overN = (typeof myDecks !== 'undefined' ? myDecks : []).filter(function(d){ return d.cards.length === DECK_SIZE && typeof deckOverLimit === 'function' && deckOverLimit(d); }).length;
  if (info) {
    if (!decks.length) { info.hidden = false; info.innerHTML = overN
      ? 'Tes decks complets ont trop de cartes rares (max ' + DECK_RAR_LIMITS.L + ' Légendaire, ' + DECK_RAR_LIMITS.E + ' Épiques, ' + DECK_RAR_LIMITS.R + ' Rares). Modifie-les dans l\'onglet <b>Decks</b>.'
      : 'Crée un deck de ' + DECK_SIZE + ' cartes dans l\'onglet <b>Decks</b> pour jouer.'; }
    else if (!BT.active) info.hidden = true;
  }
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
  BT.pvp = false; if (typeof dlPollStop === 'function') dlPollStop();
  BT.id = r.match_id; BT.lastInit = null; BT.readySent = false; BT.sel = null;
  btApply(r.view, true); btShow(true);
}

async function btResume() {
  var r = await btCall({ action: 'resume' });
  if (r.error) { toast(r.error); return; }
  if (!r.view) { BT.active = null; btRefreshMenu(); return; }
  BT.pvp = false; if (typeof dlPollStop === 'function') dlPollStop();
  BT.id = r.match_id; BT.sel = null; BT.readySent = false;
  btApply(r.view, true); btShow(true);
}

async function btForfeit() {
  if (!confirm('Abandonner la partie en cours ? Aucune récompense ne sera donnée.')) return;
  var r = await btCall({ action: 'forfeit', match_id: BT.active && BT.active.match_id });
  if (r.error) { toast(r.error); return; }
  BT.active = null; btRefreshMenu();
}

/* ---------- application d'un état serveur ---------- */
function btApply(v, enter) {
  BT.v = v;
  if (v.last && v.last.init) BT.lastInit = v.last.init;
  btRender(enter);
  btStartTimer();
}

function btSkill(id) { return (BT.v && BT.v.skills && BT.v.skills[id]) || { name: '?', description: '', rarity: 'C', cost: 0 }; }
function btRarCls(c) { return RAR[ri(c ? c.r : 'C')].cls; }

/* ---------- rendu d'une carte : cadre par rareté, nom, image, ATQ / PV, skill (version détaillée = o.big) ---------- */
var BT_SWORD = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 2.5 L17.5 2.5 L17.5 4.5 L8.5 13.5 L6.5 11.5Z" fill="#fff"/><path d="M4.2 10.8 L9.2 15.8 L8 17 L6.4 15.4 L4 17.8 L2.2 16 L4.6 13.6 L3 12Z" fill="#ffd7a0"/></svg>';
var BT_HEARTI = '<svg viewBox="0 0 20 18" aria-hidden="true"><path d="M10 17 C2 11 .5 7 1.5 4.5 C3 1 7.5 1 10 4.5 C12.5 1 17 1 18.5 4.5 C19.5 7 18 11 10 17Z" fill="#fff"/></svg>';
var BT_GEMSVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1 L18 8 L10 19 L2 8Z" fill="currentColor" stroke="#fff" stroke-opacity=".7" stroke-width="1"/><path d="M2 8H18M10 1 7 8 10 19 13 8Z" fill="none" stroke="#fff" stroke-opacity=".45"/></svg>';
function btUnitHTML(u, o) {
  o = o || {};
  var c = cardById(u.card_id) || { t: '?', r: 'C', img: null };
  var sk = btSkill(u.skill_id), has = c.img && /^http|data:image\//.test(c.img);
  var m = String(c.t).match(/[A-Za-zÀ-ÿ0-9]/), ini = m ? m[0].toUpperCase() : '?';
  var skr = RAR[ri(String(sk.rarity || 'C').toUpperCase())].cls;
  var stars = '';
  for (var i = 0; i < u.stars; i++) stars += '★';
  return '<div class="bt-unit rc-' + btRarCls(c) + (o.big ? ' big' : '') + '" ' + (o.uid ? 'data-uid="' + esc(o.uid) + '"' : '') + ' title="' + esc(c.t + ' — ' + sk.name + ' : ' + sk.description) + '"><div class="bt-uin">' +
    '<div class="bt-uhead"><span class="bt-uname">' + esc(c.t) + '</span><span class="bt-note">' + BT_GEMSVG + '</span></div>' +
    '<span class="bt-uimg">' + (has ? '<img src="' + esc(c.img) + '" alt="" draggable="false">' : '<b>' + esc(ini) + '</b>') +
      '<span class="bt-stars s' + u.stars + '">' + stars + '</span><span class="bt-sts"></span>' +
      '<span class="bt-hpbar"><i style="width:100%"></i><em class="bt-shield" style="width:0"></em></span></span>' +
    '<div class="bt-ustats">' +
      '<b class="bt-chip atk" title="Attaque">' + BT_SWORD + '<span class="bt-a">' + u.atk + '</span></b>' +
      '<b class="bt-chip hp" title="Points de vie">' + BT_HEARTI + '<span class="bt-h">' + u.hp + '</span></b></div>' +
    '<div class="bt-uskill"><span class="bt-skn"><span class="bt-skgem sk-' + skr + '"></span><span>' + esc(sk.name) + '</span></span><span class="bt-skd">' + esc(sk.description || '') + '</span></div>' +
  '</div></div>';
}

/* carte tirée : posée dans un emplacement de tirage (image fournie), pastille de coût */
function btOffCardHTML(o, energy) {
  if (!o) return '<div class="bt-off bt-off-empty">—</div>';
  var u = { card_id: o.card_id, stars: 1, hp: o.hp, atk: o.atk, skill_id: o.skill_id };
  var can = o.cost != null && o.cost <= energy, sel = BT.sel && BT.sel.t === 'offer' && BT.sel.i === o.i;
  return '<button type="button" class="bt-off' + (can ? '' : ' bt-off-no') + (sel ? ' sel' : '') + '" data-off="' + o.i + '">' +
    btUnitHTML(u, { big: true, cost: o.cost }) + '<span class="bt-cost">' + (o.cost == null ? '🚫' : o.cost) + '</span></button>';
}

/* ---------- rendu principal (préparation) ---------- */
function btItemCount() { var inv = (typeof P !== 'undefined' && P.inventory) || {}; return (inv.potion_soin || 0) + (inv.potion_energie || 0); }

/* Bandeau d'un camp : bouton d'objets (gauche), héros (centre), objets utilisés pendant le combat (droite) */
function btSideHTML(h, who) {
  var def = heroById(h.id), pct = Math.max(0, Math.min(100, Math.round(h.hp / h.max_hp * 100)));
  var item = who === 'me'
    ? '<button type="button" class="bt-itembtn" id="bt-items" title="Utiliser un objet">' + BT_ART.gem() + '<span class="ic">🧪</span><small>' + btItemCount() + '</small></button>'
    : '<span class="bt-itembtn off" title="Objets de l\'adversaire">' + BT_ART.gem() + '<span class="ic">🧪</span></span>';
  return '<div class="bt-side bt-side-' + who + '">' + item +
    '<div class="bt-hcenter"><span class="bt-hportrait" title="' + esc(h.name + ' — niveau ' + h.level + ' — ' + Math.max(0, h.hp) + ' / ' + h.max_hp + ' PV') + '">' + (def && def.image ? '<img src="' + esc(def.image) + '" alt="" draggable="false">' : '') +
      '<b class="bt-heart" data-hhp="' + who + '">' + Math.max(0, h.hp) + '</b></span>' +
      '<span class="bt-hname">' + esc(h.name) + ' <small>niv. ' + h.level + '</small></span>' +
      '<span class="bt-hhp"><i style="width:' + pct + '%"></i></span></div>' +
    '<div class="bt-used" data-used="' + who + '"><span class="bt-usedslot"></span><span class="bt-usedslot"></span><span class="bt-usedslot"></span><span class="bt-usedslot"></span></div></div>';
}

/* Plateau : image de fond (mobile 9:16 ou PC 16:9 selon la largeur), héros dans les cartouches de bois, cartes par-dessus.
   `over` = panneau de tirage posé sur la zone ennemie ; `botCls` = classe d'animation du camp ennemi. */
function btStageHTML(heroBot, cellsBot, cellsMe, heroMe, over, botCls) {
  return '<div class="bt-stage">' + btSideHTML(heroBot, 'bot') +
    '<div class="bt-board bt-board-bot' + (botCls ? ' ' + botCls : '') + '" id="bt-board-bot">' + btLanes(cellsBot, 'bot') + '</div>' +
    '<div class="bt-board bt-board-me" id="bt-board-me">' + btLanes(cellsMe, 'me') + '</div>' +
    btSideHTML(heroMe, 'me') + (over || '') + '</div>';
}

function btHeroBar(h, who) {
  var def = heroById(h.id), pct = Math.max(0, Math.min(100, Math.round(h.hp / h.max_hp * 100)));
  return '<div class="bt-hero bt-hero-' + who + '"><span class="bt-hav">' + (def ? '<img src="' + esc(def.image) + '" alt="" draggable="false">' : '') + '</span>' +
    '<span class="bt-hinfo"><b>' + esc(h.name) + ' <small>niv. ' + h.level + '</small></b>' +
    '<span class="bt-hhp"><i style="width:' + pct + '%"></i></span><em>' + Math.max(0, h.hp) + ' / ' + h.max_hp + ' PV</em></span></div>';
}

function btLanes(c, side) {
  /* c = [L1, L2, C1, R1, R2]. Colonnes : gauche (2), milieu (1), droite (2).
     Rangée avant = L1/R1 (près du centre de la table), arrière = L2/R2. L'ennemi est en haut : sa rangée arrière est donc au-dessus. */
  var L = side === 'bot' ? c[1] + c[0] : c[0] + c[1], R = side === 'bot' ? c[4] + c[3] : c[3] + c[4];
  return '<div class="bt-cols"><div class="bt-col">' + L + '</div><div class="bt-col mid">' + c[2] + '</div><div class="bt-col">' + R + '</div></div>';
}

function btBoardCells(side, v) {
  return BT_SLOTS.map(function(s) {
    if (side === 'me') {
      var u = v.me.board[s], allowed = v.me.allowed.indexOf(s) >= 0;
      var sel = BT.sel && BT.sel.t === 'board' && BT.sel.slot === s;
      return '<button type="button" class="bt-cell' + (u ? ' full' : '') + (allowed ? '' : ' blocked') + (sel ? ' sel' : '') + '" data-slot="' + s + '"' + (allowed ? '' : ' disabled') + '>' +
        (u ? btUnitHTML(u, { uid: 'me.' + s }) : '<span class="bt-empty">' + (allowed ? BT_ART.swords() : '🚫') + '</span>') + '</button>';
    }
    var p = (BT.lastInit || []).filter(function(x){ return x.side === 'bot' && x.slot === s; })[0];
    return '<div class="bt-cell ghost' + (p ? ' full' : '') + '">' + (p ? btUnitHTML(p, { uid: 'bot.' + s }) : '<span class="bt-empty">' + BT_ART.swords() + '</span>') + '</div>';
  });
}

function btInfoHTML(v) {
  var s = BT.sel;
  if (s && s.t === 'offer') {
    var o = v.me.offer[s.i]; if (!o) return '';
    var sk = btSkill(o.skill_id), c = cardById(o.card_id);
    return '<span class="bt-skt"><b class="sk-' + RAR[ri(String(sk.rarity || 'C').toUpperCase())].cls + '">' + esc(sk.name) + '</b> <span class="muted">· ' + esc(BT_TRIG[sk.trigger] || '') + '</span></span>' +
      '<span class="bt-skdesc">' + esc(sk.description) + '</span>' +
      '<em>' + (o.cost == null ? 'Injouable avec ce héros.' : 'Touche un emplacement pour la poser (' + o.cost + ' ⚡).') + '</em>';
  }
  if (s && s.t === 'board') return '<span class="muted">Touche un autre emplacement pour déplacer ou échanger.</span>';
  var playable = v.me.offer.some(function(o){ return o && o.cost != null && o.cost <= v.me.energy; });
  return playable ? '<span class="muted">Touche une carte pour lire son skill, puis un emplacement pour la poser.</span>'
    : '<span class="muted">Rien de jouable (⚡ ' + v.me.energy + ') : relance, monte une carte d\'étoile ou passe. +1 ⚡ par manche.</span>';
}

/* fiche de la carte posée sélectionnée : prend la place des cartes tirées dans le panneau */
function btInfoBigHTML(v) {
  var s = BT.sel, u = v.me.board[s.slot]; if (!u) return '';
  var sk = btSkill(u.skill_id), c = cardById(u.card_id), boost = (v.cfg.stars[u.stars] || {}).skill_boost_pct || 0;
  var up = u.up_cost == null ? '<span class="muted">Étoiles au maximum</span>'
    : '<button type="button" class="bt-btn" id="bt-up"' + (v.me.energy < u.up_cost ? ' disabled' : '') + '>Monter ★ (' + u.up_cost + ' ⚡)</button>';
  return '<div class="bt-infobig"><button type="button" class="bt-close" data-close title="Fermer">✕</button>' +
    '<span><b>' + esc(c ? c.t : '?') + '</b> ' + '★'.repeat(u.stars) + ' · ATQ ' + u.atk + ' · PV ' + u.hp + '</span>' +
    '<span><b>' + esc(sk.name) + '</b> <span class="muted">(' + esc(BT_TRIG[sk.trigger] || '') + ', +' + boost + ' % skill)</span></span>' +
    '<span class="muted">' + esc(sk.description) + '</span>' + up + '</div>';
}

/* panneau de tirage (photo 3) : posé sur la zone ennemie pendant la préparation */
function btDrawHTML(v, enter) {
  var mid = (BT.sel && BT.sel.t === 'board' && v.me.board[BT.sel.slot])
    ? btInfoBigHTML(v)
    : '<div class="bt-offers">' + v.me.offer.map(function(o){ return btOffCardHTML(o, v.me.energy); }).join('') + '</div>';
  return '<div class="bt-draw' + (enter ? ' enter' : '') + '" id="bt-draw">' +
    '<div class="bt-dtop"><span class="bt-en" title="Énergie"><i>⚡</i><b>' + v.me.energy + '</b><small>/ ' + v.me.max_energy + '</small></span>' +
      '<button type="button" class="bt-btn" id="bt-reroll">Relancer (' + v.me.reroll_cost + ' ⚡)</button></div>' +
    '<div class="bt-dmid">' + mid + '</div>' +
    '<div class="bt-dbot"><div class="bt-info' + (BT.sel && BT.sel.t === 'offer' ? ' sk' : '') + '" id="bt-info">' + btInfoHTML(v) + '</div>' +
      '<button type="button" class="bt-btn go" id="bt-ready">Prêt ▶</button></div></div>';
}

/* duel : on est prêt, on attend que l'adversaire le soit (ou que le chrono tombe) */
function btWaitHTML(v) {
  return '<div class="bt-draw bt-wait" id="bt-draw"><div class="bt-waitin"><span class="bt-spin"></span><b>Prêt !</b>' +
    '<span>' + (v.bot.ready ? 'Le combat démarre…' : 'En attente de l\'adversaire (le chrono lance la manche s\'il tarde).') + '</span></div></div>';
}

function btRender(enter) {
  var g = $('bt-game'), v = BT.v; if (!g || !v) return;
  if (v.status === 'over') { btRenderOver(); return; }
  var pend = v.me.pending;
  g.innerHTML =
    '<div class="bt-bar"><button type="button" class="btn sm" id="bt-quit">Abandonner</button>' +
      '<span class="bt-round">Manche <b>' + v.round + '</b></span>' +
      (BT.pvp ? '<span class="bt-opp' + (v.bot.ready ? ' on' : '') + '">' + (v.bot.ready ? 'Adversaire prêt ✓' : 'Adversaire en préparation…') + '</span>' : '') +
      '<span class="bt-timer" id="bt-timer">—</span></div>' +
    btStageHTML(v.bot.hero, btBoardCells('bot', v), btBoardCells('me', v), v.me.hero, v.me.ready ? btWaitHTML(v) : btDrawHTML(v, enter)) +
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
  var r = await btGame({ action: 'act', a: a });
  BT.busy = false;
  if (r.error && !r.view) { toast(r.error); return r; }
  if (r.view) { if (r.error) toast(r.error); BT.sel = null; btApply(r.view); }
  return r;
}

async function btReady(auto) {
  if (BT.readySent || BT.busy || BT.replaying) return;
  BT.readySent = true; BT.busy = true;
  var dr = $('bt-draw'); if (dr) dr.classList.add('leaving');   // le panneau de tirage se retire, le décor de base réapparaît
  var rr = await Promise.all([btGame({ action: 'act', a: { t: 'ready' } }), btSleep(520)]);
  var r = rr[0];
  BT.busy = false;
  if (r.error && !r.view) { BT.readySent = false; toast(r.error); btRender(true); return; }
  if (!r.view) { BT.readySent = false; btRender(true); return; }
  if (BT.pvp && !(r.view.last && r.view.last.round > BT.seenRound)) { BT.v = r.view; btApply(r.view); return; }   // duel : on attend l'adversaire (readySent reste vrai)
  if (BT.pvp) BT.seenRound = r.view.last.round;
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
/* La carte attaquante charge vers sa cible : recul, élan, impact, retour */
function btAttack(aId, dId, ms) {
  var A = btUnitEl(aId), D = btUnitEl(dId); if (!A || !D || !A.animate) return;
  var ra = A.getBoundingClientRect(), rd = D.getBoundingClientRect();
  var dx = (rd.left + rd.width / 2) - (ra.left + ra.width / 2), dy = (rd.top + rd.height / 2) - (ra.top + ra.height / 2);
  A.style.zIndex = 40; A.classList.add('charging');
  var an = A.animate([
    { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
    { transform: 'translate(' + (-dx * 0.07) + 'px,' + (-dy * 0.07) + 'px) scale(1.06) rotate(' + (dx < 0 ? 3 : -3) + 'deg)', offset: 0.22, easing: 'ease-in' },
    { transform: 'translate(' + (dx * 0.82) + 'px,' + (dy * 0.82) + 'px) scale(1.18) rotate(' + (dx < 0 ? -5 : 5) + 'deg)', offset: 0.5, easing: 'ease-out' },
    { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 1 }
  ], { duration: Math.max(120, ms), easing: 'ease-in-out' });
  an.onfinish = an.oncancel = function(){ A.style.zIndex = ''; A.classList.remove('charging'); };
}
function btSlash(el) {
  var f = document.createElement('span'); f.className = 'bt-slash'; el.appendChild(f);
  setTimeout(function(){ if (f.parentNode) f.parentNode.removeChild(f); }, 420);
}

function btEvent(e) {
  var cls;
  switch (e.k) {
    case 'dmg': btFloat(e.u, '-' + e.d, 'dmg'); { var t = btUnitEl(e.u); if (t) { t.classList.add('hit'); setTimeout(function(){ t.classList.remove('hit'); }, 260); if (e.a) btSlash(t); } } break;
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
    cellsMe.push('<div class="bt-cell ghost' + (m ? ' full' : '') + '">' + (m ? btUnitHTML(m, { uid: 'me.' + s }) : '<span class="bt-empty">' + BT_ART.swords() + '</span>') + '</div>');
    cellsBot.push('<div class="bt-cell ghost' + (b ? ' full' : '') + '">' + (b ? btUnitHTML(b, { uid: 'bot.' + s }) : '<span class="bt-empty">' + BT_ART.swords() + '</span>') + '</div>');
  });
  BT.v = Object.assign({}, v, { skills: Object.assign({}, pv && pv.skills, v.skills) });
  var rd = last.round; BT.replayRound = rd;
  if (BT.pvp && typeof dlReplayWatch === 'function') dlReplayWatch(rd);   // duel : vitesse et « Passer » partagés
  g.innerHTML =
    '<div class="bt-bar"><span class="bt-round">Combat — manche <b>' + rd + '</b></span>' +
      '<span class="bt-speed"><button type="button" class="btn sm" id="bt-spd">×' + BT.speed + '</button> <button type="button" class="btn sm" id="bt-skip">Passer ⏭</button></span></div>' +
    btStageHTML(pv ? pv.bot.hero : v.bot.hero, cellsBot, cellsMe, pv ? pv.me.hero : v.me.hero, '', 'enter') +
    '<div class="bt-banner" id="bt-banner" hidden></div>';
  BT.skip = false;
  // rythme : l'animation doit tenir dans le temps de revue laissé par le serveur (sinon on perd du temps de préparation)
  var nAtk = 0, nOther = 0;
  last.ticks.forEach(function(tk){ tk.ev.forEach(function(e){ if (e.k === 'atk') nAtk++; else nOther++; }); });
  var est = nAtk * 430 + nOther * 70 + last.ticks.length * 220 + 500;
  var budget = Math.max(3000, (v.prep_start || 0) - btNow() - 2400);
  BT.auto = Math.max(1, Math.min(4, est / budget));
  var sp = function(){ return BT.speed * BT.auto; };
  await btSleep(500 / sp());
  for (var i = 0; i < last.ticks.length && !BT.skip; i++) {
    var tk = last.ticks[i], evs = tk.ev, tail = 0;
    for (var j = 0; j < evs.length && !BT.skip; j++) {
      var e = evs[j];
      if (e.k === 'atk') {
        if (tail > 0) { await btSleep(tail / sp()); tail = 0; }
        btAttack(e.a, e.d, 430 / sp()); await btSleep(215 / sp()); tail = 215;
      } else { btEvent(e); await btSleep(70 / sp()); }
    }
    if (tail > 0 && !BT.skip) await btSleep(tail / sp());
    btApplySnap(tk.snap);
    await btSleep(220 / sp());
  }
  if (BT.skip && last.ticks.length) btApplySnap(last.ticks[last.ticks.length - 1].snap);
  // bannière de résultat
  var ban = $('bt-banner');
  var txt = last.winner === 'me' ? '🏆 Manche gagnée' : last.winner === 'bot' ? '💀 Manche perdue' : '🤝 Égalité';
  if (ban) {
    ban.hidden = false;
    ban.innerHTML = '<b>' + txt + '</b><span>Ton héros : −' + (last.loss.me || 0) + ' PV · Adversaire : −' + (last.loss.bot || 0) + ' PV</span>';
  }
  ['me', 'bot'].forEach(function(w){
    var h = document.querySelector('[data-hhp="' + w + '"]'), bar = document.querySelector('.bt-side-' + w + ' .bt-hhp i'), hero = v[w].hero;
    if (h) { h.textContent = Math.max(0, hero.hp); h.classList.add('pulse'); }
    if (bar) bar.style.width = Math.max(0, Math.min(100, hero.hp / hero.max_hp * 100)) + '%';
  });
  await btSleep(BT.skip ? 700 : 1700);
  if (typeof dlReplayStop === 'function') dlReplayStop();
  BT.replaying = false; BT.sel = null;
  if (v.status === 'over') { BT.v = v; BT.reward = reward; btRenderOver(); return; }
  btApply(v, true);
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
    BT.id = null; BT.v = null; BT.reward = null; BT.active = null; BT.pvp = false; if (typeof dlPollStop === 'function') dlPollStop(); btShow(false);
    try { loadHeroes(); } catch (x) {}
    btRefreshMenu(); return;
  }
  if (!$('bt-game') || $('bt-game').hidden) return;
  if (t.closest('#bt-spd')) { BT.speed = BT.speed === 1 ? 2 : BT.speed === 2 ? 4 : 1; $('bt-spd').textContent = '×' + BT.speed; if (BT.pvp && typeof dlReplaySend === 'function') dlReplaySend({ speed: BT.speed }); return; }
  if (t.closest('#bt-skip')) { BT.skip = true; if (BT.pvp && typeof dlReplaySend === 'function') dlReplaySend({ skip: true }); return; }
  if (BT.replaying) return;
  if (t.closest('#bt-quit')) {
    if (!confirm('Abandonner la partie en cours ? Aucune récompense ne sera donnée.')) return;
    btGame({ action: 'forfeit' }).then(function(){ BT.id = null; BT.v = null; BT.active = null; BT.pvp = false; if (typeof dlPollStop === 'function') dlPollStop(); if (BT.timer) clearInterval(BT.timer); btShow(false); btRefreshMenu(); });
    return;
  }
  if (BT.v && BT.v.me && BT.v.me.ready) return;
  if (t.closest('#bt-items')) { toast('Les objets utilisables en combat arrivent bientôt.'); return; }
  if (t.closest('[data-close]')) { BT.sel = null; btRender(); return; }
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
