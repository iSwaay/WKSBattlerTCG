'use strict';
/* Decks : liste, création / édition (20 cartes), suppression */

var DECK_SIZE = 20, MAX_DECKS = 10;
var myDecks = [];
var dk = { id: null, name: '', ids: [] };
var dkSort = 'rar_desc', dkQuery = '', dkRar = 'ALL', dkShown = 60;
var DK_SORTS = [
  ['rar_desc','Rareté ↓'], ['rar_asc','Rareté ↑'], ['skill_desc','Rareté du skill ↓'],
  ['note_desc','Note ↓'], ['atk_desc','Attaque ↓'], ['def_desc','Défense ↓'], ['hp_desc','PV ↓'],
  ['name_asc','Nom A → Z']
];

/* ---------- données ---------- */
function instMap() {
  var m = {};
  (window.myInstances || []).forEach(function(i){ m[i.instance_id] = i; });
  return m;
}

async function loadDecks() {
  var res = await Promise.all([
    sb.from('decks').select('id, name, updated_at, deck_cards(instance_id, position)').eq('user_id', U.id).order('updated_at', { ascending: false }),
    sb.from('game_config').select('key, value').in('key', ['deck_size', 'max_decks_per_user'])
  ]);
  if (res[0].error) throw res[0].error;
  (res[1].data || []).forEach(function(r){
    if (r.key === 'deck_size') DECK_SIZE = parseInt(r.value, 10) || 20;
    if (r.key === 'max_decks_per_user') MAX_DECKS = parseInt(r.value, 10) || 10;
  });
  myDecks = (res[0].data || []).map(function(d){
    d.cards = (d.deck_cards || []).slice().sort(function(a, b){ return a.position - b.position; })
                .map(function(x){ return x.instance_id; });
    return d;
  });
  renderDecks();
}

/* ---------- tuile compacte d'une carte ---------- */
function dkSkillRarCls(inst) {
  var s = inst.skills && inst.skills[0];
  var k = s ? String(s.rarity || '').trim().toUpperCase() : '';
  return RAR[ri(k)].cls;
}

function dkTile(inst, extraCls, attrs) {
  var c = cardById(inst.card_id); if (!c) return '';
  var R = RAR[ri(c.r)];
  var has = c.img && /^http|data:image\//.test(c.img);
  var m = c.t.match(/[A-Za-zÀ-ÿ0-9]/), ini = m ? m[0].toUpperCase() : '?';
  var sk = inst.skills && inst.skills[0];
  var note = calculateNote(c.r, inst.hp, inst.attack, inst.defense);
  return '<button type="button" class="dk-tile dk-r-' + R.cls + (extraCls ? ' ' + extraCls : '') + '" ' + (attrs || '') + ' title="' + esc(c.t) + '">' +
    '<span class="dk-img">' + (has ? '<img src="' + esc(c.img) + '" alt="" loading="lazy" draggable="false">' : '<b>' + esc(ini) + '</b>') + '</span>' +
    '<span class="dk-note">' + note + '</span>' +
    '<span class="dk-name">' + esc(c.t) + '</span>' +
    '<span class="dk-stats"><i>⚔ ' + inst.attack + '</i><i>🛡 ' + inst.defense + '</i><i>❤ ' + inst.hp + '</i></span>' +
    (sk ? '<span class="dk-skill dk-sk-' + dkSkillRarCls(inst) + '">' + esc(sk.name) + '</span>' : '<span class="dk-skill">—</span>') +
  '</button>';
}

/* ---------- liste des decks (onglet) ---------- */
function renderDecks() {
  var box = $('decks-list'); if (!box) return;
  var im = instMap();
  var cnt = $('decks-count'); if (cnt) cnt.textContent = myDecks.length + ' / ' + MAX_DECKS + ' decks';
  var nb = $('dk-new'); if (nb) nb.disabled = myDecks.length >= MAX_DECKS;

  if (!myDecks.length) {
    box.innerHTML = '<div class="empty-col">Aucun deck pour l\'instant.<br><span class="muted">Crée un deck de ' + DECK_SIZE + ' cartes pour pouvoir combattre.</span></div>';
    return;
  }
  box.innerHTML = myDecks.map(function(d){
    var owned = d.cards.filter(function(id){ return im[id]; });
    var complete = owned.length === DECK_SIZE;
    var rc = { C: 0, R: 0, E: 0, L: 0 };
    owned.forEach(function(id){ var c = cardById(im[id].card_id); if (c) rc[c.r] = (rc[c.r] || 0) + 1; });
    var thumbs = owned.slice(0, 6).map(function(id){
      var c = cardById(im[id].card_id), has = c && c.img && /^http|data:image\//.test(c.img);
      return '<span class="dkc-th dk-r-' + (c ? RAR[ri(c.r)].cls : 'c') + '">' + (has ? '<img src="' + esc(c.img) + '" alt="" loading="lazy">' : '') + '</span>';
    }).join('');
    return '<div class="dkc panel' + (complete ? ' ok' : '') + '" data-deck="' + esc(d.id) + '">' +
      '<div class="dkc-top"><b class="dkc-name">' + esc(d.name) + '</b>' +
        '<span class="dkc-badge ' + (complete ? 'ok' : 'warn') + '">' + (complete ? '✓ Prêt' : 'Incomplet') + ' · ' + owned.length + '/' + DECK_SIZE + '</span></div>' +
      '<div class="dkc-thumbs">' + thumbs + '</div>' +
      '<div class="dkc-rar">' +
        '<span class="dk-r-c">C ' + rc.C + '</span><span class="dk-r-r">R ' + rc.R + '</span><span class="dk-r-e">E ' + rc.E + '</span><span class="dk-r-l">L ' + rc.L + '</span></div>' +
      '<div class="dkc-act"><button type="button" class="btn sm primary dk-edit" data-deck="' + esc(d.id) + '">Modifier</button>' +
        '<button type="button" class="btn sm danger dk-del" data-deck="' + esc(d.id) + '">Supprimer</button></div>' +
    '</div>';
  }).join('');
}

/* ---------- éditeur ---------- */
function dkOpen(deckId) {
  var im = instMap();
  if (deckId) {
    var d = myDecks.filter(function(x){ return x.id === deckId; })[0]; if (!d) return;
    dk = { id: d.id, name: d.name, ids: d.cards.filter(function(id){ return im[id]; }) };
  } else {
    dk = { id: null, name: 'Deck ' + (myDecks.length + 1), ids: [] };
  }
  dkSort = 'rar_desc'; dkQuery = ''; dkRar = 'ALL'; dkShown = 60;
  var m = $('modal-deck');
  m.innerHTML =
    '<div class="panel dke">' +
      '<div class="dke-head">' +
        '<input type="text" id="dk-name" maxlength="30" value="' + esc(dk.name) + '" aria-label="Nom du deck">' +
        '<span class="dke-count" id="dk-count"></span>' +
        '<button type="button" class="btn sm" id="dk-cancel">Fermer</button>' +
      '</div>' +
      '<div class="dke-slots" id="dk-slots"></div>' +
      '<div class="dke-tools">' +
        '<input type="text" id="dk-search" class="search-input" placeholder="Rechercher (carte, skill)…" autocomplete="off">' +
        '<select id="dk-sort" aria-label="Trier">' + DK_SORTS.map(function(o){ return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select>' +
        '<div class="dke-rar" id="dk-rar">' +
          ['ALL','C','R','E','L'].map(function(k){ return '<button type="button" class="chip dk-rarbtn' + (k === 'ALL' ? ' on' : '') + '" data-r="' + k + '">' + (k === 'ALL' ? 'Toutes' : k) + '</button>'; }).join('') +
        '</div>' +
      '</div>' +
      '<div class="dke-grid" id="dk-grid"></div>' +
      '<div class="dke-foot"><button type="button" class="btn primary" id="dk-save">Enregistrer le deck</button></div>' +
    '</div>';
  m.hidden = false;
  dkRenderAll();
}

function dkClose() { var m = $('modal-deck'); if (m) { m.hidden = true; m.innerHTML = ''; } }

/* Une carte est-elle déjà "couverte" par le deck : même instance, ou même carte avec le même skill */
function dkConflict(inst, im) {
  var sid = inst.skills && inst.skills[0] ? inst.skills[0].name : '';
  for (var i = 0; i < dk.ids.length; i++) {
    var o = im[dk.ids[i]]; if (!o) continue;
    if (o.instance_id === inst.instance_id) return 'in';
    var os = o.skills && o.skills[0] ? o.skills[0].name : '';
    if (o.card_id === inst.card_id && os === sid) return 'dup';
  }
  return null;
}

function dkRenderAll() { dkRenderSlots(); dkRenderGrid(); }

function dkRenderSlots() {
  var im = instMap(), box = $('dk-slots'); if (!box) return;
  var html = '';
  for (var i = 0; i < DECK_SIZE; i++) {
    var inst = im[dk.ids[i]];
    html += inst ? dkTile(inst, 'dk-slot', 'data-rm="' + inst.instance_id + '"') : '<span class="dk-empty">' + (i + 1) + '</span>';
  }
  box.innerHTML = html;
  var n = dk.ids.length, c = $('dk-count');
  if (c) { c.textContent = n + ' / ' + DECK_SIZE; c.className = 'dke-count' + (n === DECK_SIZE ? ' ok' : ''); }
  var s = $('dk-save'); if (s) s.textContent = n === DECK_SIZE ? 'Enregistrer le deck' : 'Enregistrer (brouillon ' + n + '/' + DECK_SIZE + ')';
}

function dkFiltered() {
  var q = dkQuery.trim().toLowerCase(), list = [];
  (window.myInstances || []).forEach(function(inst){
    var c = cardById(inst.card_id); if (!c) return;
    if (dkRar !== 'ALL' && c.r !== dkRar) return;
    var sk = inst.skills && inst.skills[0];
    if (q && c.t.toLowerCase().indexOf(q) === -1 && !(sk && sk.name.toLowerCase().indexOf(q) !== -1) && String(c.cat || '').toLowerCase().indexOf(q) === -1) return;
    list.push({ inst: inst, c: c, note: calculateNote(c.r, inst.hp, inst.attack, inst.defense),
                skr: sk ? ri(String(sk.rarity || '').trim().toUpperCase()) : -1 });
  });
  var key = dkSort.split('_')[0], dir = dkSort.split('_')[1] === 'asc' ? 1 : -1;
  list.sort(function(a, b){
    var va, vb;
    if (key === 'rar') { va = ri(a.c.r); vb = ri(b.c.r); }
    else if (key === 'skill') { va = a.skr; vb = b.skr; }
    else if (key === 'note') { va = a.note; vb = b.note; }
    else if (key === 'atk') { va = a.inst.attack; vb = b.inst.attack; }
    else if (key === 'def') { va = a.inst.defense; vb = b.inst.defense; }
    else if (key === 'hp') { va = a.inst.hp; vb = b.inst.hp; }
    else return a.c.t.localeCompare(b.c.t, 'fr') * dir;
    if (va !== vb) return (va - vb) * dir;
    if (a.note !== b.note) return b.note - a.note;
    return a.c.t.localeCompare(b.c.t, 'fr');
  });
  return list;
}

function dkRenderGrid() {
  var grid = $('dk-grid'); if (!grid) return;
  var im = instMap(), list = dkFiltered();
  if (!list.length) { grid.innerHTML = '<div class="empty-col">' + ((window.myInstances || []).length ? 'Aucune carte ne correspond.' : 'Ta collection est vide : ouvre des packs !') + '</div>'; return; }
  var full = dk.ids.length >= DECK_SIZE;
  var html = list.slice(0, dkShown).map(function(o){
    var st = dkConflict(o.inst, im);
    var cls = st === 'in' ? 'dk-in' : (st === 'dup' ? 'dk-dup' : (full ? 'dk-full' : ''));
    var tag = st === 'in' ? '<span class="dk-flag">Dans le deck</span>' : (st === 'dup' ? '<span class="dk-flag warn">Même skill</span>' : '');
    return '<div class="dk-cell">' + dkTile(o.inst, cls, 'data-add="' + o.inst.instance_id + '"') + tag + '</div>';
  }).join('');
  if (list.length > dkShown) html += '<button type="button" class="btn dk-more" id="dk-more">Afficher plus (' + (list.length - dkShown) + ' restantes)</button>';
  grid.innerHTML = html;
}

/* ---------- actions ---------- */
async function dkSave(btn) {
  var name = ($('dk-name').value || '').trim();
  if (!name) { toast('Donne un nom à ton deck.'); return; }
  btn.disabled = true;
  var r = await sb.rpc('save_deck', { p_deck_id: dk.id, p_name: name, p_instance_ids: dk.ids });
  btn.disabled = false;
  if (r.error || !r.data || r.data.error) { toast(r.error ? errMsg(r.error) : r.data.error); return; }
  toast(r.data.complete ? 'Deck enregistré : prêt à combattre !' : 'Brouillon enregistré (' + r.data.count + '/' + DECK_SIZE + ').');
  dkClose();
  await loadDecks();
}

async function dkDelete(id) {
  var d = myDecks.filter(function(x){ return x.id === id; })[0]; if (!d) return;
  if (!window.confirm('Supprimer le deck « ' + d.name + ' » ? Les cartes restent dans ta collection.')) return;
  var r = await sb.rpc('delete_deck', { p_deck_id: id });
  if (r.error || !r.data || r.data.error) { toast(r.error ? errMsg(r.error) : r.data.error); return; }
  toast('Deck supprimé.');
  await loadDecks();
}

document.addEventListener('click', function(e) {
  var t = e.target;
  if (t.closest('#dk-new')) { if (myDecks.length >= MAX_DECKS) { toast('Limite de ' + MAX_DECKS + ' decks atteinte.'); return; } dkOpen(null); return; }
  var ed = t.closest('.dk-edit'); if (ed) { dkOpen(ed.getAttribute('data-deck')); return; }
  var dl = t.closest('.dk-del'); if (dl) { dkDelete(dl.getAttribute('data-deck')); return; }
  if (t.closest('#dk-cancel') || t === $('modal-deck')) { dkClose(); return; }
  var sv = t.closest('#dk-save'); if (sv) { dkSave(sv); return; }
  var rm = t.closest('[data-rm]'); if (rm && $('modal-deck') && !$('modal-deck').hidden) {
    var rid = rm.getAttribute('data-rm'); dk.ids = dk.ids.filter(function(x){ return x !== rid; }); dkRenderAll(); return;
  }
  var ad = t.closest('[data-add]'); if (ad && $('modal-deck') && !$('modal-deck').hidden) {
    var id = ad.getAttribute('data-add'), im = instMap(), inst = im[id]; if (!inst) return;
    if (dk.ids.length >= DECK_SIZE) { toast('Le deck est complet (' + DECK_SIZE + ' cartes).'); return; }
    var st = dkConflict(inst, im);
    if (st === 'in') return;
    if (st === 'dup') { toast('Tu as déjà cette carte avec ce skill dans le deck.'); return; }
    dk.ids.push(id); dkRenderAll(); return;
  }
  if (t.closest('#dk-more')) { dkShown += 60; dkRenderGrid(); return; }
  var rb = t.closest('.dk-rarbtn'); if (rb) {
    dkRar = rb.getAttribute('data-r'); dkShown = 60;
    document.querySelectorAll('#dk-rar .dk-rarbtn').forEach(function(b){ b.classList.toggle('on', b === rb); });
    dkRenderGrid(); return;
  }
});
document.addEventListener('input', function(e) {
  if (e.target && e.target.id === 'dk-search') { dkQuery = e.target.value; dkShown = 60; dkRenderGrid(); }
});
document.addEventListener('change', function(e) {
  if (e.target && e.target.id === 'dk-sort') { dkSort = e.target.value; dkShown = 60; dkRenderGrid(); }
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && $('modal-deck') && !$('modal-deck').hidden) dkClose();
});
