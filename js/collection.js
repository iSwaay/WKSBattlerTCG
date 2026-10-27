'use strict';
/* Collection, recyclage, profil, tri/filtres */

/* ---------- vue collection et toutes cartes ---------- */
function renderViewCards(mode) {
  var isAll = mode === 'all';
  var filter = isAll ? filterAll : filterCol;
  var search = (isAll ? searchAll : searchCol).toLowerCase();
  var gridId = isAll ? 'grid-all' : 'grid-col';
  var chipsId = isAll ? 'chips-all' : 'chips-col';
  var subId = isAll ? 'all-sub' : 'col-sub';

  if (isAll){
    $(subId).textContent = cards.length + ' cartes au total';
    var chips = [{k:'ALL',n:'Toutes', svg:''}].concat(RAR.map(function(r){ return {k:r.k,n:r.k, svg:r.svg}; }));
    $(chipsId).innerHTML = chips.map(function(c){
      return '<button type="button" class="chip'+(filter===c.k?' on':'')+'" data-f="'+esc(c.k)+'" data-tgt="'+mode+'">'+(c.svg ? c.svg : esc(c.n))+'</button>';
    }).join('');
  } else {
    renderColHeader();
  }

  var list = cards.filter(function(c){
    var matchRarity = filter === 'ALL' || c.r === filter;
    var matchSearch = c.t.toLowerCase().includes(search) || c.cat.toLowerCase().includes(search);
    var matchPossession = isAll ? true : (col[c.id] > 0);
    return matchRarity && matchSearch && matchPossession;
  });

  var sortMode = isAll ? sortAll : sortCol;
  list.sort(function(a,b){
    if (sortMode === 'rar_desc') return ri(b.r) - ri(a.r) || a.t.localeCompare(b.t, 'fr');
    if (sortMode === 'rar_asc') return ri(a.r) - ri(b.r) || a.t.localeCompare(b.t, 'fr');
    if (sortMode === 'note_desc' || sortMode === 'note_asc') {
        var nA = calculateNote(a.r, a.hp, a.attack, a.defense);
        var nB = calculateNote(b.r, b.hp, b.attack, b.defense);
        var valA = nA === '?' ? 0 : parseInt(nA);
        var valB = nB === '?' ? 0 : parseInt(nB);
        if (sortMode === 'note_desc') return valB - valA || ri(b.r) - ri(a.r) || a.t.localeCompare(b.t, 'fr');
        return valA - valB || ri(a.r) - ri(b.r) || a.t.localeCompare(b.t, 'fr');
    }
    if (sortMode === 'az') return a.t.localeCompare(b.t, 'fr');
    if (sortMode === 'za') return b.t.localeCompare(a.t, 'fr');
    if (sortMode === 'qty_desc') return (col[b.id]||0) - (col[a.id]||0) || ri(b.r) - ri(a.r);
    return 0;
  });

  if (!isAll) $(gridId).classList.toggle('rc-mode', recycleMode);
  var stacked = !isAll && stackMode;
  if (!list.length){
    $(gridId).innerHTML = '<div class="empty-col">Aucune carte trouvée.</div>'; 
    if (!isAll){ recycleSel = {}; updateRecycleBar(); }
    return; 
  }

  var html = '', vis = {};
  list.forEach(function(c){
      var n = col[c.id] || 0;
      if (stacked){
        var insts = n > 0 ? stackInstances(c.id) : [];
        if (insts.length){
          var rep = insts[0];
          html += '<button type="button" class="slot slot-stack'+(insts.length > 1 ? ' multi' : '')+'" data-id="'+esc(c.id)+'" data-inst="'+rep.instance_id+'" data-stack="1" aria-label="Agrandir '+esc(c.t)+(insts.length > 1 ? ' (x'+insts.length+')' : '')+'">'+cardHTML(c, rep)+
                  (insts.length > 1 ? '<span class="stack-badge">x'+insts.length+'</span>' : '')+'</button>';
        }
        return;
      }
      if (!n && isAll) {
          html += '<button type="button" class="slot" data-id="'+esc(c.id)+'" style="filter:grayscale(1) opacity(0.5);" aria-label="Agrandir '+esc(c.t)+'">'+cardHTML(c)+'</button>';
      } else if (n > 0) {
          var instances = (window.myInstances || []).filter(function(inst) { return inst.card_id === c.id; });
          instances.forEach(function(inst) {
              vis[inst.instance_id] = true;
              html += '<button type="button" class="slot'+(!isAll && recycleSel[inst.instance_id] ? ' rc-sel' : '')+'" data-id="'+esc(c.id)+'" data-inst="'+inst.instance_id+'" aria-label="'+(recycleMode && !isAll ? 'Sélectionner ' : 'Agrandir ')+esc(c.t)+'">'+cardHTML(c, inst)+'</button>';
          });
      }
  });
  $(gridId).innerHTML = html;
  if (!isAll){
    Object.keys(recycleSel).forEach(function(k){ if (!vis[k]) delete recycleSel[k]; });
    updateRecycleBar();
  }
}


/* ---------- navigation dans le zoom / mode "Par collection" ---------- */
var stackMode = false, curNav = null, curZoom = null;
function stackInstances(cid){
  return (window.myInstances || []).filter(function(i){ return i.card_id === cid; })
    .sort(function(a, b){ return (b.hp + b.attack + b.defense) - (a.hp + a.attack + a.defense); });
}
function syncStackBtn(){
  var b = $('btn-stack'); if (!b) return;
  b.classList.toggle('on', stackMode); b.setAttribute('aria-pressed', stackMode ? 'true' : 'false');
}
function setStackMode(on){
  if (on && recycleMode){ recycleMode = false; recycleSel = {}; updateRecycleBar(); }
  stackMode = !!on;
  syncStackBtn();
  renderViewCards('col');
}
function zoomGo(j){
  if (!curNav || j < 0 || j >= curNav.list.length || j === curNav.i) return;
  var it = curNav.list[j], c = cardById(it.id);
  if (!c) return;
  var inst = it.inst ? ((window.myInstances || []).find(function(x){ return x.instance_id === it.inst; }) || null) : null;
  showZoom(c, inst, {list: curNav.list, i: j, stack: curNav.stack});
}
function reshowZoom(id){
  if (curZoom && curZoom.c && curZoom.c.id === id) showZoom(curZoom.c, curZoom.inst, curZoom.nav);
  else showZoom(cardById(id));
}
(function(){
  var x0 = null, y0 = 0;
  document.addEventListener('touchstart', function(e){
    if (!curNav || $('stage').hidden || !e.target.closest || !e.target.closest('.zoom-row')){ x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, {passive:true});
  document.addEventListener('touchend', function(e){
    if (x0 === null || !curNav) return;
    var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) zoomGo(curNav.i + (dx < 0 ? 1 : -1));
  }, {passive:true});
})();

/* ---------- recyclage ---------- */
var recycleMode = false, recycleSel = {}, recycling = false, pendingRecycle = [];
function updateRecycleBar(){
  var bar = $('rc-bar'); if (!bar) return;
  var n = Object.keys(recycleSel).length;
  bar.hidden = !recycleMode;
  if ($('btn-recycle')) $('btn-recycle').classList.toggle('on', recycleMode);
  $('rc-count').textContent = n + ' carte' + (n > 1 ? 's' : '') + ' sélectionnée' + (n > 1 ? 's' : '');
  $('rc-gain').textContent = '+' + n + ' jeton' + (n > 1 ? 's' : '');
  $('rc-go').disabled = n === 0;
}
function setRecycleMode(on){
  if (on && stackMode){ stackMode = false; syncStackBtn(); }
  recycleMode = !!on;
  if (!recycleMode) recycleSel = {};
  renderViewCards('col');
  updateRecycleBar();
}
function instRarity(id){
  var inst = (window.myInstances || []).find(function(i){ return i.instance_id === id; });
  var c = inst ? cardById(inst.card_id) : null;
  return c ? c.r : null;
}
function requestRecycle(ids){
  if (recycling || !ids.length) return;
  var nRare = ids.filter(function(id){ var r = instRarity(id); return r === 'L' || r === 'E'; }).length;
  if (nRare > 0){
    pendingRecycle = ids.slice();
    $('rc-text').innerHTML = 'Tu es sur le point de recycler <b>' + ids.length + ' carte' + (ids.length > 1 ? 's' : '') + '</b>' +
      ', dont <b>' + nRare + ' carte' + (nRare > 1 ? 's' : '') + ' Épique(s) ou Légendaire(s)</b>, contre <b>' + ids.length + ' jeton' + (ids.length > 1 ? 's' : '') + '</b>. ' +
      'Cette action est définitive.';
    $('modal-recycle').hidden = false;
    $('rc-cancel').focus();
    return;
  }
  doRecycle(ids);
}
async function doRecycle(ids){
  if (recycling || !ids.length) return;
  recycling = true;
  var ok = false;
  try{
    var r = await sb.rpc('recycle_cards', {p_instance_ids: ids});
    if (r.error) throw r.error;
    if (r.data && r.data.error) throw new Error(r.data.error);
    P.tokens = r.data.tokens;
    if (Array.isArray(r.data.showcase)) P.showcase = r.data.showcase;
    var n = r.data.recycled || ids.length;
    toast(n + ' carte' + (n > 1 ? 's recyclées' : ' recyclée') + ' : +' + n + ' jeton' + (n > 1 ? 's' : '') + ' !');
    if (window.audioCtx) sfx('flip');
    ok = true;
  }catch(e){
    toast(errMsg(e));
  }
  try{ await loadCol(); }catch(e2){}
  recycling = false;
  recycleMode = false; recycleSel = {};
  if (!$('stage').hidden) closeStage();
  renderAll(); updateInvUI(); updateRecycleBar();
}

function renderCol() {
  renderViewCards('col');
  renderViewCards('all');
}

function renderAdminFlag(){ $('adm-flag').hidden = !P.is_admin; if($('pm-admin')) $('pm-admin').hidden = !P.is_admin; }

function renderProfile() {
    $('prof-user').textContent = P.username || 'Joueur';
    $('st-packs').textContent = SRV.opened || 0;
    if($('ui-tokens')) $('ui-tokens').textContent = P.tokens || 0;
    var tot = 0, uniq = 0;
    for (var k in col) { if(col[k] > 0) { tot += col[k]; uniq++; } }
    $('st-cards').textContent = tot;
    $('st-uniq').textContent = uniq;
    
    var vGrid = $('vitrine-grid');
    if(vGrid) {
        var sc = P.showcase || [];
        var h = '';
        for(var i=0; i<5; i++){
            if(i < sc.length && cardById(sc[i])){
                var c = cardById(sc[i]);
                h += '<div class="vitrine-slot" style="border:0;background:none" data-id="'+c.id+'">'+cardHTML(c)+'</div>';
            } else {
                h += '<div class="vitrine-slot empty-vitrine-slot" style="cursor:pointer" title="Ajouter une carte">+</div>';
            }
        }
        vGrid.innerHTML = h;
    }
}


function updateInvUI() {
    if($('ui-tokens')) $('ui-tokens').textContent = P.tokens || 0;
    var inv = P.inventory || {};
    if($('inv-potion_soin')) $('inv-potion_soin').textContent = inv.potion_soin || 0;
    if($('inv-potion_energie')) $('inv-potion_energie').textContent = inv.potion_energie || 0;
    if($('inv-tab-potion_soin')) $('inv-tab-potion_soin').textContent = inv.potion_soin || 0;
    if($('inv-tab-potion_energie')) $('inv-tab-potion_energie').textContent = inv.potion_energie || 0;
}

function renderAll(){ renderPacks(); renderCol(); renderProfile(); renderAdminFlag(); renderFriends(); updateInvUI(); }

/* ---------- en-tête de "Ma collection" ---------- */
var RAR_LBL = {L:'légendaire', E:'épique', R:'rare', C:'commune'};
function renderColHeader(){
  var cnt = {L:0, E:0, R:0, C:0}, uniq = 0, total = 0;
  cards.forEach(function(c){
    var n = col[c.id] || 0;
    if (n > 0){ uniq++; total += n; cnt[c.r] = (cnt[c.r] || 0) + 1; }
  });
  $('cx-uniq').textContent = uniq;
  $('cx-total').textContent = total;
  var order = ['L','E','R','C'];
  $('cx-bar').innerHTML = order.map(function(k){
    return cnt[k] ? '<span class="cx-seg cx-seg-'+k.toLowerCase()+'" style="flex-grow:'+cnt[k]+'" title="'+cnt[k]+' '+RAR_LBL[k]+(cnt[k]>1?'s':'')+'"></span>' : '';
  }).join('');
  $('cx-legend').innerHTML = order.map(function(k){
    return '<span class="cx-lg cx-lg-'+k.toLowerCase()+'">'+RAR[ri(k)].svg+'<b>'+cnt[k]+'</b><span class="cx-lgn">'+RAR_LBL[k]+(cnt[k]>1?'s':'')+'</span></span>';
  }).join('');
  var rar = $('cx-rar');
  if (!rar.children.length){
    rar.innerHTML = order.map(function(k){
      return '<button type="button" class="cx-rbtn" data-f="'+k+'" title="'+esc(RAR[ri(k)].name)+'" aria-label="'+esc(RAR[ri(k)].name)+'">'+RAR[ri(k)].svg+'</button>';
    }).join('');
  }
  Array.prototype.forEach.call(rar.children, function(b){
    var on = b.getAttribute('data-f') === filterCol;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  Array.prototype.forEach.call(document.querySelectorAll('.cx-sort-item'), function(b){
    b.classList.toggle('on', b.getAttribute('data-sort') === sortCol);
  });
}
document.addEventListener('click', function(e){
  var menu = $('sort-menu'); if (!menu) return;
  var t = e.target, sortBtn = $('btn-sort');
  if (t.closest('#btn-sort')){
    menu.hidden = !menu.hidden;
    sortBtn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    return;
  }
  var it = t.closest('.cx-sort-item');
  if (it){
    sortCol = it.getAttribute('data-sort');
    menu.hidden = true; sortBtn.setAttribute('aria-expanded', 'false');
    renderViewCards('col');
    return;
  }
  var rb = t.closest('.cx-rbtn');
  if (rb){
    var f = rb.getAttribute('data-f');
    filterCol = (filterCol === f) ? 'ALL' : f;
    renderViewCards('col');
    return;
  }
  if (!menu.hidden){ menu.hidden = true; sortBtn.setAttribute('aria-expanded', 'false'); }
});

/* ---------- recherche ---------- */
document.addEventListener('input', function(e){
  if(e.target.id === 'search-col'){ searchCol = e.target.value; renderViewCards('col'); }
  if(e.target.id === 'search-all'){ searchAll = e.target.value; renderViewCards('all'); }
});

