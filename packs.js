'use strict';
/* État serveur, stock de boosters, ouverture */

function applyState(s){
  SRV.packs = s.packs;
  SRV.last = new Date(s.last_tick).getTime();
  SRV.opened = s.opened;
  SRV.off = new Date(s.server_now).getTime() - Date.now();
}
async function syncState(){
  var r = await sb.rpc('sync_state');
  if (r.error) throw r.error;
  applyState(r.data);
}
async function loadCards(){
  var r = await sb.from('cards').select('*');
  if (r.error) throw r.error;
  cards = r.data.map(mapCard);
  lastCardsLoad = Date.now();
}
async function loadCol(){
  var r = await sb.from('card_instances').select('instance_id, card_id, hp, attack, defense, card_instance_skills(skill_id, skills(name, description, rarity, energy_cost))').eq('user_id', U.id);
  if (r.error) throw r.error;
  col = {};
  window.myInstances = r.data.map(function(inst) {
      col[inst.card_id] = (col[inst.card_id] || 0) + 1;
      var flatSkills = [];
      if (inst.card_instance_skills) {
          inst.card_instance_skills.forEach(function(cis) {
              if (cis.skills) flatSkills.push(cis.skills);
          });
      }
      return { 
          instance_id: inst.instance_id, 
          card_id: inst.card_id, 
          hp: inst.hp, 
          attack: inst.attack, 
          defense: inst.defense, 
          skills: flatSkills 
      };
  });
}
async function loadMembers(){
  if (!P.is_owner) return;
  var r = await sb.from('profiles').select('id,username,is_admin,is_owner').order('username');
  if (!r.error) members = r.data;
}

function nowSrv(){ return Date.now() + SRV.off; }
function livePacks(){
  if (SRV.packs >= MAX) return MAX;
  var n = Math.floor((nowSrv() - SRV.last)/INTERVAL);
  if (n < 0) n = 0;
  return Math.min(MAX, SRV.packs + n);
}
function nextLeft(){
  var el = nowSrv() - SRV.last; if (el < 0) el = 0;
  return INTERVAL - (el % INTERVAL);
}

function fmt(ms){
  var s = Math.max(0, Math.ceil(ms/1000)), m = Math.floor(s/60), r = s%60;
  return (m<10?'0':'')+m+':'+(r<10?'0':'')+r;
}
function renderRates(){
  if(!$('rates')) return;
  $('rates').innerHTML = RAR.map(function(r){
    return '<span class="rate r-'+r.cls+'" title="'+esc(r.name)+'"><i style="transform:rotate(45deg);border-radius:1px;"></i>'+esc(r.k)+' '+String(r.w).replace('.',',')+' %</span>';
  }).join('');
}

var shownPacks = -1;
function updateMegaUI(){
  var n = (P && P.mega_packs) || 0;
  var b = $('btn-open-mega');
  if (b) b.textContent = n > 0 ? ('Ouvrir un Méga Pack offert (' + n + ' 🎁)') : 'Ouvrir (100 🪙)';
  var f = $('mega-free');
  if (f){
    f.hidden = false;
    f.textContent = n > 0 ? ('🎁 ' + n + ' Méga Pack' + (n > 1 ? 's' : '') + ' offert' + (n > 1 ? 's' : '') + ' en stock') : 'Aucun Méga Pack offert en stock';
    f.style.opacity = n > 0 ? '1' : '.6';
  }
  var bd = $('mega-badge');
  if (bd){ bd.hidden = n <= 0; bd.textContent = '🎁 ×' + n; }
  var ar = $('btn-next-pack');
  if (ar) ar.classList.toggle('has-gift', n > 0);
}

function renderPacks(){
  updateMegaUI();
  var n = livePacks(), empty = !cards.length;
  shownPacks = n;
  if($('pk-n')) $('pk-n').textContent = n;
  if($('ly1')) $('ly1').hidden = n < 2;
  if($('ly2')) $('ly2').hidden = n < 3;
  if($('pack')) $('pack').disabled = n <= 0 || empty || opening;
  if($('btn-open')){
      $('btn-open').disabled = n <= 0 || empty || opening;
      $('btn-open').textContent = empty ? 'Aucune carte dans le jeu' : (n > 0 ? 'Ouvrir 1 booster' : 'Aucun booster disponible');
  }
  var segs = document.querySelectorAll('.pk-seg');
  segs.forEach(function(s, i) {
      s.classList.toggle('on', i < n);
  });
  renderTimer();
}
function renderTimer(){
  var txt;
  if (livePacks() >= MAX){
    txt = 'Stock plein.';
  } else {
    txt = 'prochain dans ' + fmt(nextLeft());
  }
  if (!cards.length) txt = "Aucune carte dans le jeu.";
  if($('pk-timer')) $('pk-timer').textContent = txt;
}


var opening = false;
async function openPack(){
  if (opening) return;
  if (!cards.length){ toast("Aucune carte dans le jeu : un admin doit en ajouter."); return; }
  if (livePacks() <= 0) return;
  opening = true; renderPacks();
  var shown = null;
  try{
    var r = await sb.rpc('open_pack');
    if (r.error) throw r.error;
    if (r.data && r.data.error) throw new Error(r.data.error);
    applyState(r.data.state);
    // Recharge les instances (stats + skills) créées par open_pack, sinon la collection reste vide
    await loadCol();
    var used = {};
    var pairs = r.data.cards.map(function(x){
      var c = cardById(x.id);
      if (!c){ c = mapCard({id:x.id, title:x.title, rarity:x.rarity, category:x.category, description:x.description, image:x.image}); cards.push(c); }
      var all = window.myInstances || [], inst = null;
      if (x.instance_id != null) inst = all.find(function(i){ return String(i.instance_id) === String(x.instance_id); }) || null;
      if (!inst) inst = all.find(function(i){
        return i.card_id === c.id && !used[i.instance_id] && i.hp == x.hp && i.attack == x.attack && i.defense == x.defense;
      }) || null;
      if (inst) used[inst.instance_id] = true;
      var cClone = Object.assign({}, c, {hp: x.hp, attack: x.attack, defense: x.defense});
      cClone._inst = inst || {hp:x.hp, attack:x.attack, defense:x.defense, skills: Array.isArray(x.skills) ? x.skills : []};
      return {c:cClone, isNew:x.is_new};
    });
    pairs.sort(function(a,b){ return ri(a.c.r) - ri(b.c.r); });
    shown = {cards: pairs.map(function(p){ return p.c; }), flags: pairs.map(function(p){ return p.isNew; })};
  }catch(e){
    toast(errMsg(e));
    try{ await syncState(); }catch(e2){}
  }
  opening = false;
  renderPacks(); renderCol(); renderProfile();
  if (shown) showPack(shown.cards, shown.flags);
}

