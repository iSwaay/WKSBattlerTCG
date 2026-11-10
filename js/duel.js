'use strict';
/* Duel entre joueurs : même boucle que contre un bot, mais l'adversaire est un joueur (code d'invitation ou ami).
   Toute la logique est sur le serveur (edge function "duel") ; ce fichier gère le salon d'attente, les invitations et la synchro (sondage). */

var DL = { lobby: null, lobbyT: null, invT: null, invites: [] };

function dlCall(body) { return btCall(body, 'duel'); }

/* ---------- salon / menu ---------- */
function dlDeckOptions() {
  var sel = $('dl-deck'); if (!sel) return;
  var decks = btCompleteDecks(), keep = sel.value;
  sel.innerHTML = decks.length ? decks.map(function(d){ return '<option value="' + esc(d.id) + '">' + esc(d.name) + '</option>'; }).join('') : '<option value="">Aucun deck complet</option>';
  if (keep && decks.some(function(d){ return d.id === keep; })) sel.value = keep;
  ['dl-create', 'dl-join', 'dl-invite'].forEach(function(id){ var b = $(id); if (b) b.disabled = !decks.length; });
}

function dlFriendOptions() {
  var sel = $('dl-friend'); if (!sel) return;
  var fr = (typeof myFriends !== 'undefined' ? myFriends : []), keep = sel.value;
  sel.innerHTML = fr.length ? fr.map(function(f){ return '<option value="' + esc(f.otherId) + '">' + esc(f.otherName) + '</option>'; }).join('') : '<option value="">Aucun ami pour l\'instant</option>';
  if (keep && fr.some(function(f){ return f.otherId === keep; })) sel.value = keep;
  var b = $('dl-invite'); if (b && !fr.length) b.disabled = true;
}

function dlRenderInvites() {
  var box = $('dl-invites'); if (!box) return;
  box.hidden = !DL.invites.length;
  box.innerHTML = DL.invites.map(function(i){
    return '<div class="dl-inv"><span><b>' + esc(i.from) + '</b> te défie</span>' +
      '<span><button type="button" class="btn sm primary" data-dl-accept="' + esc(i.duel_id) + '">Accepter</button> <button type="button" class="btn sm" data-dl-decline="' + esc(i.duel_id) + '">Refuser</button></span></div>';
  }).join('');
}

function dlRenderLobby() {
  var box = $('dl-lobby'), form = $('dl-form'); if (!box) return;
  var l = DL.lobby;
  box.hidden = !l; if (form) form.hidden = !!l;
  if (!l) { box.innerHTML = ''; return; }
  box.innerHTML = (l.invited
      ? '<p class="dl-wait"><span class="bt-spin"></span> Invitation envoyée : en attente de ton ami…</p>'
      : '<p class="dl-wait"><span class="bt-spin"></span> En attente d\'un adversaire…</p><div class="dl-code" id="dl-code" title="Copier">' + esc(l.code) + '</div><p class="hint" style="margin:0">Donne ce code à un ami : il le saisit dans « Rejoindre ». Valable 15 minutes.</p>') +
    '<div class="dl-row">' + (l.invited ? '' : '<button type="button" class="btn sm" id="dl-copy">Copier le code</button>') + '<button type="button" class="btn sm" id="dl-cancel">Annuler</button></div>';
}

async function dlRefresh() {
  dlDeckOptions(); dlFriendOptions();
  var r = await dlCall({ action: 'resume' });
  if (r.error || !r.ok) return;
  var d = r.duel, info = $('dl-resume');
  if (d && d.status === 'waiting') { DL.lobby = { id: d.id, code: d.code, invited: d.invited }; dlRenderLobby(); dlLobbyPoll(); }
  else if (d && d.status === 'prep') {
    if (info) { info.hidden = false; info.innerHTML = 'Un duel est en cours. <button type="button" class="btn sm primary" id="dl-resume-go" data-id="' + esc(d.id) + '">Reprendre</button> <button type="button" class="btn sm" id="dl-forfeit" data-id="' + esc(d.id) + '">Abandonner</button>'; }
  } else { if (info) info.hidden = true; DL.lobby = null; dlRenderLobby(); }
  dlInvitesRefresh();
}

async function dlInvitesRefresh() {
  var r = await dlCall({ action: 'invites' });
  if (r && r.ok) { DL.invites = r.invites || []; dlRenderInvites(); }
}

/* sondage pendant que l'hôte attend dans le salon */
function dlLobbyPoll() {
  if (DL.lobbyT) clearInterval(DL.lobbyT);
  var busy = false;
  DL.lobbyT = setInterval(async function() {
    if (!DL.lobby || busy) { if (!DL.lobby) { clearInterval(DL.lobbyT); DL.lobbyT = null; } return; }
    busy = true; var r = await dlCall({ action: 'poll', duel_id: DL.lobby.id }); busy = false;
    if (!DL.lobby) return;
    if (r.view) { clearInterval(DL.lobbyT); DL.lobbyT = null; DL.lobby = null; dlRenderLobby(); dlEnter(r.duel_id, r.view); return; }
    if (r.ended || r.error) { clearInterval(DL.lobbyT); DL.lobbyT = null; DL.lobby = null; dlRenderLobby(); toast(r.error || 'Le duel a expiré.'); }
  }, 2000);
}

/* ---------- entrée dans la partie ---------- */
function dlEnter(id, v) {
  BT.pvp = true; BT.id = id; BT.sel = null; BT.readySent = !!v.me.ready; BT.lastInit = null; BT.reward = null;
  BT.seenRound = v.last ? v.last.round : 0;
  btApply(v, true); btShow(true); dlPollStart();
}

async function dlCreate(friendId) {
  var deck = $('dl-deck').value; if (!deck) { toast('Choisis un deck.'); return; }
  var r = await dlCall({ action: 'create', deck_id: deck, friend_id: friendId || null });
  if (r.error) { toast(r.error); return; }
  DL.lobby = { id: r.duel_id, code: r.code, invited: !!r.invited }; dlRenderLobby(); dlLobbyPoll();
}

async function dlJoin(body) {
  var deck = $('dl-deck').value; if (!deck) { toast('Choisis un deck.'); return; }
  var r = await dlCall(Object.assign({ action: 'join', deck_id: deck }, body));
  if (r.error) { toast(r.error); return; }
  dlEnter(r.duel_id, r.view);
}

/* ---------- synchro pendant la partie ---------- */
function dlPollStop() { if (DL.pollT) { clearInterval(DL.pollT); DL.pollT = null; } }
function dlPollStart() {
  dlPollStop(); var busy = false;
  DL.pollT = setInterval(async function() {
    if (!BT.pvp || !BT.id || BT.busy || BT.replaying || busy) return;
    if (BT.v && BT.v.status === 'over') { dlPollStop(); return; }
    busy = true; var id = BT.id; var r = await dlCall({ action: 'poll', duel_id: id }); busy = false;
    if (!BT.pvp || BT.id !== id || BT.busy || BT.replaying) return;
    if (r.ended) { dlPollStop(); toast('Le duel est terminé.'); BT.id = null; BT.v = null; BT.pvp = false; btShow(false); btRefreshMenu(); return; }
    if (!r.view) return;
    dlIncoming(r.view, r.reward);
  }, 1800);
}

async function dlIncoming(v, reward) {
  var cur = BT.v;
  if (v.last && v.last.round > BT.seenRound) {            // une manche vient de se jouer : on rejoue le combat
    BT.seenRound = v.last.round; BT.readySent = true;
    await btReplay(v, reward); BT.readySent = !!(BT.v && BT.v.me && BT.v.me.ready); return;
  }
  if (v.status === 'over') { BT.v = v; BT.reward = reward; btRenderOver(); dlPollStop(); return; }
  if (!cur || v.round !== cur.round || v.me.ready !== cur.me.ready || v.bot.ready !== cur.bot.ready) { BT.v = v; btApply(v); }
  else { cur.deadline = v.deadline; cur.prep_start = v.prep_start; }
}

/* ---------- replay synchronisé : vitesse ×1/×2/×4 et « Passer » valent pour les deux joueurs ---------- */
function dlReplaySend(o) {
  if (!BT.pvp || !BT.id) return;
  dlCall(Object.assign({ action: 'replay_set', duel_id: BT.id, round: BT.replayRound || 0 }, o)).then(function(r){ if (r && r.replay) dlReplayApply(r.replay); });
}
function dlReplayApply(rp) {
  if (!rp) return;
  if ([1, 2, 4].indexOf(rp.speed) >= 0 && rp.speed !== BT.speed) { BT.speed = rp.speed; var b = $('bt-spd'); if (b) b.textContent = '×' + BT.speed; }
  if (BT.replaying && rp.skip_round && rp.skip_round === BT.replayRound) BT.skip = true;
}
function dlReplayWatch(round) {
  dlReplayStop(); var busy = false, id = BT.id;
  var tick = async function() {
    if (busy || !BT.pvp || BT.id !== id) return;
    busy = true; var r = await dlCall({ action: 'replay_get', duel_id: id }); busy = false;
    if (r && r.replay) dlReplayApply(r.replay);
  };
  tick(); DL.rpT = setInterval(tick, 700);
}
function dlReplayStop() { if (DL.rpT) { clearInterval(DL.rpT); DL.rpT = null; } }

/* ---------- événements ---------- */
document.addEventListener('click', async function(e) {
  var t = e.target;
  if (t.closest('#dl-create')) { dlCreate(null); return; }
  if (t.closest('#dl-invite')) { var f = $('dl-friend').value; if (!f) { toast('Choisis un ami.'); return; } dlCreate(f); return; }
  if (t.closest('#dl-join')) { var c = ($('dl-code-in').value || '').trim(); if (!c) { toast('Saisis le code reçu.'); return; } dlJoin({ code: c }); return; }
  if (t.closest('#dl-copy') || t.closest('#dl-code')) {
    try { await navigator.clipboard.writeText(DL.lobby.code); toast('Code copié : ' + DL.lobby.code); } catch (x) { toast('Code : ' + DL.lobby.code); } return;
  }
  if (t.closest('#dl-cancel')) {
    var id = DL.lobby && DL.lobby.id; DL.lobby = null; dlRenderLobby();
    if (id) await dlCall({ action: 'cancel', duel_id: id }); return;
  }
  var ac = t.closest('[data-dl-accept]');
  if (ac) { dlJoin({ duel_id: ac.getAttribute('data-dl-accept') }); return; }
  var de = t.closest('[data-dl-decline]');
  if (de) { await dlCall({ action: 'decline', duel_id: de.getAttribute('data-dl-decline') }); dlInvitesRefresh(); return; }
  var rg = t.closest('#dl-resume-go');
  if (rg) { var r = await dlCall({ action: 'poll', duel_id: rg.getAttribute('data-id') }); if (r.view) dlEnter(r.duel_id, r.view); else { toast(r.error || 'Ce duel est terminé.'); dlRefresh(); } return; }
  var fg = t.closest('#dl-forfeit');
  if (fg) { if (!confirm('Abandonner le duel en cours ? Ton adversaire sera déclaré vainqueur.')) return; await dlCall({ action: 'forfeit', duel_id: fg.getAttribute('data-id') }); dlRefresh(); return; }
});

/* le menu rafraîchit aussi la partie « duel » ; les invitations d'amis sont sondées tant que le menu est visible */
(function() {
  var base = btRefreshMenu;
  btRefreshMenu = async function() { try { await base(); } finally { try { await dlRefresh(); } catch (x) { console.error('dlRefresh', x); } } };
  if (DL.invT) clearInterval(DL.invT);
  DL.invT = setInterval(function() {
    var m = $('bt-menu'); if (!m || m.hidden || !m.offsetParent || document.hidden || typeof U === 'undefined' || !U) return;
    dlInvitesRefresh();
  }, 6000);
})();
