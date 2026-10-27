'use strict';
/* Gestionnaires d'événements globaux et init() */

/* ---------- événements ---------- */

document.addEventListener('click', async function(e){
  var t = e.target;
  
  // Menu Plus
  var btnPlus = t.closest('#btn-plus');
  if(btnPlus) {
      var pm = $('plus-menu');
      pm.classList.toggle('show');
      return;
  }
  if(!t.closest('#plus-menu') && $('plus-menu') && $('plus-menu').classList.contains('show')) {
      $('plus-menu').classList.remove('show');
  }

  var tab = t.closest('[data-tab]');
  if (tab){
    if (recycleMode) setRecycleMode(false);
    var which = tab.getAttribute('data-tab');
    if(t.closest('.bottom-nav')) {
        document.querySelectorAll('.bottom-nav button[data-tab]').forEach(function(b){ b.classList.toggle('on', b===tab); });
    }
    if(t.closest('.pm-item')) {
        document.querySelectorAll('.bottom-nav button[data-tab]').forEach(function(b){ b.classList.remove('on'); });
    }
    
    ['v-profile', 'v-packs', 'v-col', 'v-trades', 'v-friends', 'v-admin-cards', 'v-arena'].forEach(function(id) {
      if($(id)) $(id).hidden = (which !== id.replace('v-', ''));
    });
    
    if(which === 'admin-cards') { renderAdminCardsUI(); }

    if ((which === 'col' || which === 'admin-cards') && Date.now() - lastCardsLoad > 30000){
      try{ await loadCards(); await loadCol(); renderAll(); if(which==='admin-cards') renderAdminCardsUI(); }catch(err){}
    }
    return;
  }
  
  // Sous-onglets Collection
  if (t.closest('[data-coltab]')) {
      var tabBtn = t.closest('[data-coltab]');
      var targetId = tabBtn.getAttribute('data-coltab');
      if (recycleMode) setRecycleMode(false);
      document.querySelectorAll('#col-tabs button').forEach(function(b){ b.classList.toggle('on', b===tabBtn); });
      $('col-view-my').style.display = (targetId === 'my-col') ? 'block' : 'none';
      $('col-view-all').style.display = (targetId === 'all-cards') ? 'block' : 'none';
      return;
  }
  
  // Sous-onglets Arène
  if (t.closest('[data-arenatab]')) {
      var tabBtn = t.closest('[data-arenatab]');
      var targetId = tabBtn.getAttribute('data-arenatab');
      document.querySelectorAll('#arena-tabs button').forEach(function(b){ b.classList.toggle('on', b===tabBtn); });
      $('arena-view-combat').style.display = (targetId === 'combat') ? 'block' : 'none';
      $('arena-view-shop').style.display = (targetId === 'shop') ? 'block' : 'none';
      if($('arena-view-inventory')) $('arena-view-inventory').style.display = (targetId === 'inventory') ? 'block' : 'none';
      return;
  }

  
  var au = t.closest('[data-auth]');
  if (au){
    if ($('au-email')) authEmail = $('au-email').value;
    if ($('au-user')) authUser = $('au-user').value;
    authMode = au.getAttribute('data-auth'); renderAuth(); return;
  }
  if (t.closest('#au-retry')){ boot(); return; }
  if (t.closest('#au-out')){ sb.auth.signOut(); return; }
  if (t.closest('#pack') || t.closest('#btn-open')){ openPack(); return; }
  if (t.closest('#btn-settings')){ openSettings(); return; }
  if (t.closest('#set-close')){ closeSettings(); return; }
  if (t.closest('#settings') && t === $('settings')){ closeSettings(); return; }
  if (t.closest('#logout')){ closeSettings(); sb.auth.signOut(); return; }

  var chip = t.closest('.chip');
  if (chip){ 
    var tgt = chip.getAttribute('data-tgt');
    if(tgt === 'all') filterAll = chip.getAttribute('data-f');
    else filterCol = chip.getAttribute('data-f');
    renderViewCards(tgt); 
    return; 
  }
  if (t.closest('#btn-recycle')){ setRecycleMode(!recycleMode); return; }
  if (t.closest('#btn-stack')){ setStackMode(!stackMode); return; }
  if (t.closest('#zoom-prev')){ if (curNav) zoomGo(curNav.i - 1); return; }
  if (t.closest('#zoom-next')){ if (curNav) zoomGo(curNav.i + 1); return; }
  if (t.closest('.zdot')){ zoomGo(+t.closest('.zdot').getAttribute('data-zi')); return; }

  
  if (t.closest('#btn-next-pack') || t.closest('#btn-prev-pack')) {
      if (window.__setPack) window.__setPack($('pk-stage').getAttribute('data-active') === 'std' ? 'mega' : 'std');
      return;
  }

  if (t.closest('#btn-buy-packs')) {
      if (!confirm("Acheter 10 Packs Standard pour 200 🪙 ?")) return;
      var btn = t.closest('#btn-buy-packs'); btn.disabled = true;
      sb.rpc('buy_packs', { qty: 10, cost: 200 }).then(async function(res) {
          btn.disabled = false;
          if (res.error) { toast(errMsg(res.error)); return; }
          toast("10 Packs ajoutés !");
          await syncState();
          renderAll();
      });
      return;
  }

  if (t.closest('#btn-open-mega') || t.closest('#pack-mega')) {
      if (opening) return;
      if ((P.tokens || 0) < 100) { toast("Fonds insuffisants. Il te faut 100 🪙."); return; }
      if (!confirm("Ouvrir 1 Pack Méga pour 100 🪙 ?")) return;
      
      opening = true; renderPacks();
      var shown = null;
      try {
        var r = await sb.rpc('open_mega_pack');
        if (r.error) throw r.error;
        if (r.data && r.data.error) throw new Error(r.data.error);
        
        P.tokens -= 100; // Update UI locally
        updateInvUI();
        
        await loadCol();
        var used = {};
        var pairs = r.data.cards.map(function(x){
          var c = cardById(x.id);
          if (!c){ c = mapCard({id:x.id, title:x.title, r:x.rarity, cat:x.category, d:x.description, img:x.image}); cards.push(c); }
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
      } catch(e) {
        toast(errMsg(e));
        try{ await boot(); }catch(e2){}
      }
      opening = false;
      renderPacks(); renderCol(); renderProfile();
      if (shown) {
          showPack(shown.cards, shown.flags, 'Pack Méga');
      }
      return;
  }

  if (t.closest('#rc-exit')){ setRecycleMode(false); return; }
  if (t.closest('#rc-all')){
    document.querySelectorAll('#grid-col button.slot[data-inst]').forEach(function(b){ recycleSel[b.getAttribute('data-inst')] = true; });
    renderViewCards('col'); return;
  }
  if (t.closest('#rc-go')){ requestRecycle(Object.keys(recycleSel)); return; }
  if (t.closest('#rc-cancel')){ $('modal-recycle').hidden = true; pendingRecycle = []; return; }
  if (t.closest('#rc-ok')){ var ids = pendingRecycle.slice(); pendingRecycle = []; $('modal-recycle').hidden = true; doRecycle(ids); return; }
  if (t.closest('#st-recycle')){ requestRecycle([t.closest('#st-recycle').getAttribute('data-inst')]); return; }
  if (recycleMode && t.closest('#grid-col') && t.closest('button.slot[data-inst]')){
    var rs = t.closest('button.slot[data-inst]'), rid = rs.getAttribute('data-inst');
    if (recycleSel[rid]) delete recycleSel[rid]; else recycleSel[rid] = true;
    rs.classList.toggle('rc-sel', !!recycleSel[rid]);
    updateRecycleBar();
    return;
  }
  var slot = t.closest('button.slot') || t.closest('.vitrine-slot');
  if (slot && slot.getAttribute('data-id') && !t.closest('.ms-pick')){ 
    var c = cardById(slot.getAttribute('data-id')); 
    var instId = slot.getAttribute('data-inst');
    var inst = instId ? (window.myInstances || []).find(function(i){ return i.instance_id === instId; }) : null;
    if (c){
      var nav = null, grid = slot.closest ? (slot.closest('#grid-col') || slot.closest('#grid-all')) : null;
      if (grid && slot.tagName === 'BUTTON'){
        var zl = [], zi = 0;
        if (slot.getAttribute('data-stack')){
          stackInstances(c.id).forEach(function(x, k){ zl.push({id: c.id, inst: x.instance_id}); if (x.instance_id === instId) zi = k; });
        } else {
          Array.prototype.forEach.call(grid.querySelectorAll('button.slot'), function(el, k){
            zl.push({id: el.getAttribute('data-id'), inst: el.getAttribute('data-inst')});
            if (el === slot) zi = k;
          });
        }
        if (zl.length > 1) nav = {list: zl, i: zi, stack: !!slot.getAttribute('data-stack')};
      }
      showZoom(c, inst, nav);
    }
    return; 
  }

  if (t.closest('.empty-vitrine-slot')) {
      selectMode = 'vitrine';
      $('ms-title').textContent = 'Choisir pour la vitrine';
      var availCards = cards.filter(function(c){ return col[c.id] > 0 && !(P.showcase || []).includes(c.id); });
      if(!availCards.length) {
          $('ms-grid').innerHTML = '<div class="empty-col">Aucune nouvelle carte disponible.</div>';
      } else {
          $('ms-grid').innerHTML = availCards.map(function(c){
              return '<button type="button" class="slot ms-pick" data-id="'+c.id+'">'+cardHTML(c)+'</button>';
          }).join('');
      }
      $('modal-select').hidden = false;
      return;
  }

  
  if (t.closest('[data-trtab]')) {
      var tabBtn = t.closest('[data-trtab]');
      var targetId = tabBtn.getAttribute('data-trtab');
      document.querySelectorAll('#tr-tabs button').forEach(function(b){
          var on = b===tabBtn;
          b.classList.toggle('on', on);
          b.style.background = on ? 'var(--surface)' : 'none';
          b.style.color = on ? 'inherit' : 'var(--muted)';
          b.style.boxShadow = on ? '0 1px 2px rgba(0,0,0,0.1)' : 'none';
      });
      ['new', 'pending', 'history'].forEach(function(v){
          $('tr-view-'+v).style.display = (v === targetId) ? 'block' : 'none';
      });
      return;
  }
  
  if (t.closest('#tr-search')) { searchTradeUser($('tr-input').value.trim()); return; }
  if (t.closest('#tb-cancel')) { $('tr-builder').style.display = 'none'; return; }
  if (t.closest('#tb-add-give')) { openTradeSelect('give'); return; }
  if (t.closest('#tb-add-ask')) { openTradeSelect('ask'); return; }
  if (t.closest('#ms-close')) { $('modal-select').hidden = true; return; }
  
  if (t.closest('#ts-cancel')) {
      $('modal-select').hidden = true;
      return;
  }
  if (t.closest('#ts-ok')) {
      $('modal-select').hidden = true;
      var selectedIds = Object.keys(window.tradeSel || {});
      if (selectMode === 'give') tradeDraft.give = tradeDraft.give.concat(selectedIds);
      else if (selectMode === 'ask') tradeDraft.ask = tradeDraft.ask.concat(selectedIds);
      renderTradeBuilder();
      return;
  }
  
  if (t.closest('.ms-pick')) {
      var slotBtn = t.closest('.ms-pick');
      var cid = slotBtn.getAttribute('data-id');
      
      if (selectMode === 'vitrine') {
          $('modal-select').hidden = true;
          var sc = P.showcase || [];
          if(!sc.includes(cid) && sc.length < 5) {
              sc.push(cid);
              P.showcase = sc;
              renderProfile();
              sb.rpc('update_showcase', {new_showcase: sc}).then(function(res){
                  if(res.error) toast(errMsg(res.error));
                  else toast('Vitrine mise à jour !');
              });
          }
          return;
      }
      
      // Multi-select logic for trades
      if (!window.tradeSel) window.tradeSel = {};
      if (window.tradeSel[cid]) {
          delete window.tradeSel[cid];
          slotBtn.classList.remove('rc-sel');
      } else {
          window.tradeSel[cid] = true;
          slotBtn.classList.add('rc-sel');
      }
      
      var tsCount = $('ts-count');
      if (tsCount) tsCount.textContent = Object.keys(window.tradeSel).length;
      
      return;
  }
  
  if (t.closest('.tb-rm')) {
      var btn = t.closest('.tb-rm');
      var idx = parseInt(btn.getAttribute('data-idx'), 10);
      var m = btn.getAttribute('data-m');
      if (m === 'give') tradeDraft.give.splice(idx, 1);
      else tradeDraft.ask.splice(idx, 1);
      renderTradeBuilder();
      return;
  }
  
  if (t.closest('#tb-send')) { submitTrade(); return; }
  
  if (t.closest('.tr-act')) { 
      var btn = t.closest('.tr-act');
      handleTradeAct(btn.getAttribute('data-id'), btn.getAttribute('data-act'));
      return;
  }

  
  if (t.closest('.btn-buy')) {
      var btn = t.closest('.btn-buy');
      var item = btn.getAttribute('data-item');
      var price = parseInt(btn.getAttribute('data-price'));
      
      if ((P.tokens || 0) < price) { toast("Jetons insuffisants."); return; }
      
      btn.disabled = true;
      var newTokens = (P.tokens || 0) - price;
      var newInv = P.inventory || {};
      newInv[item] = (newInv[item] || 0) + 1;
      
      sb.rpc('buy_item', {item_name: item, item_price: price}).then(function(res) {
          btn.disabled = false;
          if(res.error) { toast(errMsg(res.error)); }
          else {
              if (res.data && res.data.success) {
                  P.tokens = res.data.tokens;
                  P.inventory = res.data.inventory;
                  updateInvUI();
                  toast('Achat réussi !');
                  if(window.audioCtx) sfx('flip');
              } else {
                  toast(res.data.error || 'Erreur lors de l\'achat.');
              }
          }
      });
      return;
  }

  if (t.closest('#fr-add')) { addFriend($('fr-input').value.trim()); return; }
  if (t.closest('.fr-btn')) { 
      var btn = t.closest('.fr-btn');
      respondFriend(btn.getAttribute('data-id'), btn.getAttribute('data-act') === 'accept'); 
      return; 
  }
  if (t.closest('[data-fprof]')) { openFriendProfile(t.closest('[data-fprof]').getAttribute('data-fprof')); return; }
  if (t.closest('#mf-close')) { $('modal-friend').hidden = true; return; }

  if (t.closest('#st-pin')){
      var id = t.closest('#st-pin').getAttribute('data-id');
      var sc = P.showcase || [];
      if(sc.includes(id)){
          sc = sc.filter(function(x){ return x !== id; });
      } else {
          if(sc.length >= 5) { toast('Ta vitrine est pleine (5 cartes max).'); return; }
          sc.push(id);
      }
      P.showcase = sc;
      renderProfile();
      reshowZoom(id);
      console.log("Updating showcase via RPC:", sc);
      sb.rpc('update_showcase', {new_showcase: sc}).then(function(res){
          console.log("RPC response:", res);
          if(res.error) {
              console.error("Showcase error:", res.error);
              toast('Erreur BDD: ' + errMsg(res.error));
          } else {
              toast('Vitrine mise à jour !');
          }
      });
      return;
  }

  var pkc = t.closest('.pkc');
  if (t.closest('#pk-zoom-x') || (t.closest('#pk-zoom') && !t.closest('.pk-zoom-card'))){ closePkZoom(); return; }
  if (pkc){
    var pi = +pkc.getAttribute('data-i'), psl = $('pk-s' + pi);
    if (cur.isMobile && !cur.done) {
        // Mode une carte à la fois : le clic est géré par handleSeqTap (onclick de la carte)
    } else if (cur.done) {
        openPkZoom(pi);
    } else {
        if (psl && psl.classList.contains('on')) openPkZoom(pi); else flipCard(pi);
    }
    return;
  }
  if (t.closest('#pk-all')){ flipAll(); return; }
  if (t.closest('#pk-next')){ var nb = $('pk-next'); if (nb && !nb.disabled){ closeStage(); openPack(); } return; }
  if (t.closest('#pk-col')){ closeStage(); var cb = document.querySelector('.bottom-nav button[data-tab="col"]'); if (cb) cb.click(); return; }
  if (t.closest('#pk-back')){ closeStage(); return; }
  if (t.closest('#st-done')){ closeStage(); return; }

  var ed = t.closest('[data-edit]');
  if (ed){
    editId = ed.getAttribute('data-edit');
    var ecard = editCard();
    if (ecard){ 
      openRar[ecard.r] = true; setMsg = ''; 
      window.currentCropData = null; 
      if(cropper){ cropper.destroy(); cropper = null; }
      renderAdminCardsUI(); 
      var tf = $('cf-t'); if (tf){ tf.scrollIntoView({block:'center'}); tf.focus({preventScroll:true}); } 
    }
    return;
  }
  if (t.closest('#cf-cancel')){ editId = null; setMsg = ''; window.currentCropData = null; if(cropper) cropper.destroy(); renderAdminCardsUI(); return; }
  var del = t.closest('[data-del]');
  if (del){
    var id = del.getAttribute('data-del');
    if (confirmDel === id){
      confirmDel = null;
      var rd = await sb.from('cards').delete().eq('id', id);
      if (rd.error){ setMsg = errMsg(rd.error); setErr = true; renderAdminCardsUI(); return; }
      cards = cards.filter(function(c){ return c.id !== id; });
      delete col[id];
      if (editId === id) editId = null;
      setMsg = ''; setErr = false;
      renderAdminCardsUI(); renderCol(); renderPacks(); toast('Carte supprimée');
    } else {
      confirmDel = id; renderAdminCardsUI();
      setTimeout(function(){ if (confirmDel === id){ confirmDel = null; renderAdminCardsUI(); } }, 3000);
    }
    return;
  }
  if (t.closest('#btn-promo')){
    var code = $('promo-code') ? $('promo-code').value.trim().toUpperCase() : '';
    if(!code) return;
    var btn = t.closest('#btn-promo');
    btn.disabled = true;
    var r = await sb.rpc('redeem_code', {p_code: code});
    btn.disabled = false;
    
    if (r.error) { toast(errMsg(r.error)); return; }
    var data = r.data;
    if (data.error) { toast(data.error); return; }
    
    if (data.success) {
        if (data.type === 'tokens') {
            P.tokens = data.total_tokens;
            updateInvUI();
            toast('Code valide ! +' + data.amount + ' Jetons 🪙');
        } else if (data.type === 'packs') {
            var rf = await sb.rpc('admin_fill_packs');
            if (!rf.error) { applyState(rf.data); renderPacks(); }
            toast('Code valide ! Stock de packs rempli 📦');
        }
        if($('promo-code')) $('promo-code').value = '';
        if(window.audioCtx) sfx('epic');
    }
    return;
  }
  var am = t.closest('[data-adm]');
  if (am){
    var ra = await sb.rpc('set_admin', {target: am.getAttribute('data-adm'), flag: am.getAttribute('data-flag') === '1'});
    if (ra.error){ toast(errMsg(ra.error)); return; }
    await loadMembers(); renderSettings(); toast('Rôle mis à jour'); return;
  }
});

document.addEventListener('submit', async function(e){
  var f = e.target;
  e.preventDefault();
  if (f.id === 'auth-form'){
    var email = $('au-email').value.trim(), pw = $('au-pw').value, msg = $('au-msg'), go = $('au-go');
    authEmail = email;
    go.disabled = true; msg.className = 'msg'; msg.textContent = '…';
    try{
      if (authMode === 'signup'){
        var un = $('au-user').value.trim(); authUser = un;
        var rs = await sb.auth.signUp({email:email, password:pw, options:{data:{username:un}}});
        if (rs.error) throw rs.error;
        if (!rs.data.session){ msg.className = 'msg'; msg.textContent = 'Compte créé. Confirme ton e-mail, puis connecte-toi.'; go.disabled = false; }
      } else {
        var rl = await sb.auth.signInWithPassword({email:email, password:pw});
        if (rl.error) throw rl.error;
      }
    }catch(err){ msg.className = 'msg err'; msg.textContent = errMsg(err); go.disabled = false; }
    return;
  }
  if (f.id === 'card-form'){
    try{ await submitCard(); }catch(err){ var m2 = $('cf-msg'); if (m2){ m2.className = 'msg err'; m2.textContent = errMsg(err); } var g = $('cf-go'); if (g) g.disabled = false; }
  }
});

document.addEventListener('toggle', function(e){
  var d = e.target;
  if (d && d.matches && d.matches('details.acc')) openRar[d.getAttribute('data-rk')] = d.open;
}, true);

document.addEventListener('keyup', function(e){
  if ((e.key === ' ' || e.code === 'Space') && !$('stage').hidden && $('stage').classList.contains('pk')) e.preventDefault();
});
document.addEventListener('keydown', function(e){
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && curNav && !$('stage').hidden && !$('stage').classList.contains('pk') && $('modal-recycle').hidden){
    var tgn = e.target && e.target.tagName;
    if (tgn !== 'INPUT' && tgn !== 'TEXTAREA'){ e.preventDefault(); zoomGo(curNav.i + (e.key === 'ArrowRight' ? 1 : -1)); return; }
  }
  if ((e.key === ' ' || e.code === 'Space') && !$('stage').hidden && $('stage').classList.contains('pk')){
    var tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA') return;
    e.preventDefault();
    if ($('pk-zoom')){ closePkZoom(); return; }
    if (cur.done){ var nb2 = $('pk-next'); if (nb2 && !nb2.disabled){ closeStage(); openPack(); } }
    else { 
        if(cur.isMobile) handleSeqTap();
        else { for (var k = 0; k < cur.cards.length; k++){ if (flipCard(k)) break; } }
    }
    return;
  }
  if (e.key === 'Escape'){
    if (!$('modal-recycle').hidden){ $('modal-recycle').hidden = true; pendingRecycle = []; return; }
    if (recycleMode && $('stage').hidden){ setRecycleMode(false); return; }
    if ($('pk-zoom')) closePkZoom();
    else if (!$('stage').hidden) closeStage();
    else if (!$('settings').hidden) closeSettings();
  }
});

/* ---------- démarrage ---------- */
function init(){
  renderRates();
  renderAll();
  if (!window.supabase || !SUPABASE_URL || /VOTRE/.test(SUPABASE_URL) || /VOTRE/.test(SUPABASE_KEY)){
    authMode = 'config'; renderAuth(); return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  authMode = 'loading'; renderAuth('Chargement…');
  sb.auth.onAuthStateChange(function(evt, session){
    if (session && session.user){
      var changed = !U || U.id !== session.user.id;
      U = session.user;
      if (changed) setTimeout(boot, 0);
    } else {
      U = null; resetLocal();
      authMode = 'login'; renderAuth();
    }
  });
  setInterval(function(){
    if (!U || !sb || $('auth').hidden === false) return;
    if (livePacks() !== shownPacks) renderPacks(); else renderTimer();
  }, 1000);
  document.addEventListener('visibilitychange', async function(){
    if (document.hidden || !U || $('auth').hidden === false) return;
    try{
      await syncState();
      if (Date.now() - lastCardsLoad > 60000){ await loadCards(); await loadCol(); }
      renderAll();
    }catch(err){}
  });
}
init();
