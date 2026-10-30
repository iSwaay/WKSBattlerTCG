'use strict';
/* Héros : catalogue, achat, équipement, niveaux et XP (niveau max 10) */

var HEROES = [], myHeroes = {}, heroLevels = [];

/* ---------- chargement ---------- */
async function loadHeroes() {
  var res = await Promise.all([
    sb.from('heroes').select('*').eq('active', true).order('sort'),
    sb.from('user_heroes').select('hero_id, level, xp, wins').eq('user_id', U.id),
    sb.from('hero_levels').select('level, xp_required').order('level')
  ]);
  if (res[0].error) throw res[0].error;
  HEROES = res[0].data || [];
  myHeroes = {};
  (res[1].data || []).forEach(function(r){ myHeroes[r.hero_id] = r; });
  heroLevels = res[2].data || [];
  renderHeroes();
}

function heroById(id) { for (var i = 0; i < HEROES.length; i++) if (HEROES[i].id === id) return HEROES[i]; return null; }

/* Niveau / progression d'un héros possédé */
function heroProgress(row) {
  var max = heroLevels.length ? heroLevels[heroLevels.length - 1].level : 10;
  var lvl = row ? row.level : 1, xp = row ? row.xp : 0;
  var cur = 0, next = null;
  heroLevels.forEach(function(l){ if (l.level === lvl) cur = l.xp_required; if (l.level === lvl + 1) next = l.xp_required; });
  var isMax = lvl >= max || next === null;
  return {
    level: lvl, xp: xp, max: max, isMax: isMax,
    into: isMax ? 1 : xp - cur, need: isMax ? 1 : next - cur,
    pct: isMax ? 100 : Math.max(0, Math.min(100, Math.round((xp - cur) / (next - cur) * 100)))
  };
}

/* ---------- carte héros (image plein cadre) ---------- */
function heroCardHTML(h, row, active) {
  var owned = !!row, pr = heroProgress(row);
  var cls = 'hcard' + (owned ? ' owned' : ' locked') + (active ? ' active' : '') + (pr.isMax && owned ? ' maxed' : '');
  return '<button type="button" class="' + cls + '" data-hero="' + esc(h.id) + '" aria-label="' + esc(h.name) + '">' +
    '<img class="hc-img" src="' + esc(h.image) + '" alt="' + esc(h.name) + '" loading="lazy" draggable="false">' +
    '<span class="hc-shine"></span>' +
    (owned
      ? '<span class="hc-lvl">Niv. ' + pr.level + (pr.isMax ? ' ★' : '') + '</span>'
      : '<span class="hc-lock" aria-hidden="true">🔒</span>') +
    (active ? '<span class="hc-tag">Équipé</span>' : '') +
    (owned ? '' : '<span class="hc-price">' + (h.price > 0 ? h.price + ' 🪙' : 'Offert') + '</span>') +
    (owned ? '<span class="hc-xp"><i style="width:' + pr.pct + '%"></i></span>' : '') +
  '</button>';
}

function renderHeroes() {
  var grid = $('heroes-grid');
  if (!grid) return;
  var active = (P && P.active_hero) || 'pionnier';
  var owned = HEROES.filter(function(h){ return myHeroes[h.id]; }).length;
  var cnt = $('heroes-count'); if (cnt) cnt.textContent = owned + ' / ' + HEROES.length + ' héros';
  grid.innerHTML = HEROES.map(function(h){ return heroCardHTML(h, myHeroes[h.id], h.id === active); }).join('') ||
    '<div class="empty-col">Aucun héros disponible.</div>';
  var line = $('arena-hero-line'), ah = heroById(active);
  if (line) line.textContent = ah ? 'Héros équipé : ' + ah.name + ' (niv. ' + heroProgress(myHeroes[ah.id]).level + ')' : '';
}

/* ---------- fiche détaillée ---------- */
function heroModalHTML(h) {
  var row = myHeroes[h.id], owned = !!row, active = ((P && P.active_hero) || 'pionnier') === h.id;
  var pr = heroProgress(row);
  var pips = '';
  for (var i = 1; i <= pr.max; i++) pips += '<i class="hm-pip' + (owned && i <= pr.level ? ' on' : '') + '"></i>';
  var hpTxt = h.base_hp === h.hp_lvl10 ? h.base_hp + ' PV' : h.base_hp + ' PV <span class="muted">(' + h.hp_lvl10 + ' au niv. ' + pr.max + ')</span>';
  var action;
  if (!owned) {
    var can = (P.tokens || 0) >= h.price;
    action = '<button type="button" class="btn primary hm-buy" data-hero="' + esc(h.id) + '"' + (can ? '' : ' disabled') + '>Acheter · ' + h.price + ' 🪙</button>' +
             (can ? '' : '<p class="hint" style="margin:6px 0 0">Il te manque ' + (h.price - (P.tokens || 0)) + ' 🪙.</p>');
  } else if (active) {
    action = '<button type="button" class="btn" disabled>✓ Héros équipé</button>';
  } else {
    action = '<button type="button" class="btn primary hm-equip" data-hero="' + esc(h.id) + '">Équiper ce héros</button>';
  }
  return '<div class="panel hm">' +
    '<div class="panel-h"><h2>' + esc(h.name) + '</h2><button type="button" class="btn sm" id="hm-close">Fermer</button></div>' +
    '<div class="hm-body">' +
      '<div class="hm-card">' + heroCardHTML(h, row, active) + '</div>' +
      '<div class="hm-info">' +
        '<p class="hm-arch">' + esc(h.archetype) + '</p>' +
        '<div class="hm-stats"><div><b>' + hpTxt + '</b><span>Santé</span></div>' +
          '<div><b>' + h.energy_cap + '</b><span>Énergie max</span></div>' +
          '<div><b>' + h.field_slots + '</b><span>Emplacements</span></div></div>' +
        '<div class="hm-perk good"><b>Avantage</b><span>' + esc(h.advantage) + '</span></div>' +
        '<div class="hm-perk bad"><b>Contrepartie</b><span>' + esc(h.drawback) + '</span></div>' +
        '<div class="hm-perk star"><b>Niveau ' + pr.max + '</b><span>' + esc(h.lvl10_bonus) + '</span></div>' +
        '<div class="hm-lvl"><div class="hm-lvl-top"><b>' + (owned ? 'Niveau ' + pr.level : 'Niveau 1') + '</b>' +
          '<span>' + (!owned ? 'Gagne de l\'XP en remportant des combats' : pr.isMax ? 'Niveau maximum' : pr.into + ' / ' + pr.need + ' XP') + '</span></div>' +
          '<div class="hm-bar"><i style="width:' + (owned ? pr.pct : 0) + '%"></i></div>' +
          '<div class="hm-pips">' + pips + '</div></div>' +
        '<div class="hm-action">' + action + '</div>' +
      '</div>' +
    '</div></div>';
}

function openHeroModal(id) {
  var h = heroById(id); if (!h) return;
  var m = $('modal-hero'); if (!m) return;
  m.innerHTML = heroModalHTML(h);
  m.hidden = false;
}
function closeHeroModal() { var m = $('modal-hero'); if (m) { m.hidden = true; m.innerHTML = ''; } }

/* ---------- actions ---------- */
async function buyHero(id, btn) {
  if (btn) btn.disabled = true;
  var r = await sb.rpc('buy_hero', { p_hero: id });
  if (r.error || !r.data || r.data.error) { toast(r.error ? errMsg(r.error) : r.data.error); if (btn) btn.disabled = false; return; }
  P.tokens = r.data.tokens;
  if ($('ui-tokens')) $('ui-tokens').textContent = P.tokens;
  var h = heroById(id);
  toast((h ? h.name : 'Héros') + ' débloqué !');
  await loadHeroes();
  openHeroModal(id);
}

async function equipHero(id, btn) {
  if (btn) btn.disabled = true;
  var r = await sb.rpc('select_hero', { p_hero: id });
  if (r.error || !r.data || r.data.error) { toast(r.error ? errMsg(r.error) : r.data.error); if (btn) btn.disabled = false; return; }
  P.active_hero = id;
  renderHeroes();
  openHeroModal(id);
  toast('Héros équipé !');
}

document.addEventListener('click', function(e) {
  var t = e.target;
  if (t.closest('#hm-close') || t === $('modal-hero')) { closeHeroModal(); return; }
  var buy = t.closest('.hm-buy'); if (buy) { buyHero(buy.getAttribute('data-hero'), buy); return; }
  var eq = t.closest('.hm-equip'); if (eq) { equipHero(eq.getAttribute('data-hero'), eq); return; }
  var card = t.closest('#heroes-grid .hcard'); if (card) { openHeroModal(card.getAttribute('data-hero')); return; }
});
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeHeroModal(); });
