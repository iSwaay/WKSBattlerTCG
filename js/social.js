'use strict';
/* Amis et échanges */



/* ---------- SOCIAL (Amis) ---------- */
async function loadSocial() {
    var r = await sb.from('friends').select('id, user_id, friend_id, status, u:profiles!user_id(username), f:profiles!friend_id(username)').or('user_id.eq.'+U.id+',friend_id.eq.'+U.id);
    if(!r.error) {
        myFriends = []; myRequests = [];
        r.data.forEach(function(row) {
            var isMeSender = row.user_id === U.id;
            var otherId = isMeSender ? row.friend_id : row.user_id;
            var otherName = isMeSender ? row.f.username : row.u.username;
            var rel = {id: row.id, otherId: otherId, otherName: otherName, status: row.status, isMeSender: isMeSender};
            if(row.status === 'accepted') myFriends.push(rel);
            else myRequests.push(rel);
        });
    }
    await loadTrades();
}

/* ---------- SOCIAL (Trades) ---------- */
var tradeHasInstCol = true; // passe à false si la colonne trade_items.instance_id n'existe pas
async function loadTrades() {
    function q(cols) {
        return sb.from('trades').select('id, sender_id, receiver_id, status, created_at, s:profiles!sender_id(username), r:profiles!receiver_id(username), trade_items(' + cols + ')').or('sender_id.eq.'+U.id+',receiver_id.eq.'+U.id).order('created_at', {ascending: false});
    }
    var r = await q(tradeHasInstCol ? 'id, card_id, instance_id, owner_id, qty' : 'id, card_id, owner_id, qty');
    if (r.error && tradeHasInstCol) { tradeHasInstCol = false; r = await q('id, card_id, owner_id, qty'); }
    if(!r.error) { myTrades = r.data; renderTrades(); }
    else console.error('loadTrades', r.error);
}

function renderTradeItems(items) {
    if(!items || !items.length) return '<span class="hint" style="font-size:11px">Rien</span>';
    return items.map(function(it){
        var c = cardById(it.card_id);
        if(!c && it.instance_id){ var mi = (window.myInstances||[]).find(function(x){ return x.instance_id === it.instance_id; }); if(mi) c = cardById(mi.card_id); }
        if(!c) return '<div style="width:56px;height:80px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;margin:0 4px 4px 0;border:1px dashed var(--line);color:var(--muted);font-size:18px" title="Carte introuvable">?</div>';
        var m = c.t.match(/[A-Za-zÀ-ÿ0-9]/); var ini = m ? m[0].toUpperCase() : '?';
        var has = c.img && /^http|data:image\//.test(c.img);
        var R = RAR[ri(c.r)];
        return '<div style="width:56px;height:80px;border-radius:6px;background:var(--'+R.cls+');display:inline-block;margin:0 4px 4px 0;position:relative;border:1px solid rgba(0,0,0,0.3);box-shadow:0 2px 4px rgba(0,0,0,0.2)" title="'+esc(c.t)+'"><div style="position:absolute;inset:3px;border-radius:4px;background:var(--surface);background-size:cover;background-position:center;'+(has?'background-image:url(\''+c.img+'\')':'')+'">'+(has?'':'<span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:16px;font-weight:bold">'+ini+'</span>')+'</div></div>';
    }).join('');
}

function renderTrades() {
    var incHtml = '', outHtml = '', histHtml = '', pCount = 0;
    myTrades.forEach(function(t) {
        var isMeSender = t.sender_id === U.id;
        var otherName = isMeSender ? (t.r?t.r.username:'?') : (t.s?t.s.username:'?');
        var giveItems = t.trade_items.filter(function(i){ return i.owner_id === U.id; });
        var askItems = t.trade_items.filter(function(i){ return i.owner_id !== U.id; });
        
        var block = '<div class="trade-row" style="flex-direction:column;align-items:stretch;gap:12px">'+
          '<div style="display:flex;justify-content:space-between;align-items:center"><span class="trade-user">'+esc(otherName)+'</span><span class="trade-status">'+t.status+'</span></div>'+
          '<div style="display:flex;gap:10px;background:var(--surface2);padding:8px;border-radius:8px">'+
            '<div style="flex:1"><b style="font-size:11px;text-transform:uppercase;color:var(--muted)">Tu donnes</b><br>'+renderTradeItems(giveItems)+'</div>'+
            '<div style="flex:1"><b style="font-size:11px;text-transform:uppercase;color:var(--muted)">Tu reçois</b><br>'+renderTradeItems(askItems)+'</div>'+
          '</div>';
          
        if (t.status === 'pending') {
            if (isMeSender) {
                block += '<div style="text-align:right"><button type="button" class="btn sm danger tr-act" data-act="cancel" data-id="'+t.id+'">Annuler l\'offre</button></div>';
                outHtml += block + '</div>';
            } else {
                pCount++;
                block += '<div style="display:flex;gap:8px;justify-content:end"><button type="button" class="btn sm tr-act" data-act="reject" data-id="'+t.id+'">Refuser</button><button type="button" class="btn sm primary tr-act" data-act="accept" data-id="'+t.id+'">Accepter</button></div>';
                incHtml += block + '</div>';
            }
        } else {
            histHtml += block + '</div>';
        }
    });
    
    $('tr-list-inc').innerHTML = incHtml || '<p class="hint">Aucune offre reçue.</p>';
    $('tr-list-out').innerHTML = outHtml || '<p class="hint">Aucune offre envoyée.</p>';
    $('tr-list-hist').innerHTML = histHtml || '<p class="hint">Aucun historique.</p>';
    
    var b = $('tr-badge');
    if(b){ b.textContent = pCount; b.hidden = pCount === 0; }
}

async function searchTradeUser(username) {
    var friend = myFriends.find(function(f) { return f.otherName.toLowerCase() === username.toLowerCase(); });
    if (!friend) { toast("Ce joueur n'est pas dans ta liste d'amis."); return; }
    
    var u = await sb.from('profiles').select('id, username').eq('id', friend.otherId).single();
    if(u.error || !u.data) { toast('Erreur de chargement du profil.'); return; }
    
    var r = await sb.from('card_instances').select('instance_id, card_id, hp, attack, defense, card_instance_skills(skill_id, skills(name, description, rarity, energy_cost))').eq('user_id', u.data.id);
    var tCol = {};
    var tInstances = [];
    if(!r.error && r.data) {
        tInstances = r.data.map(function(inst) {
            tCol[inst.card_id] = (tCol[inst.card_id] || 0) + 1;
            var flatSkills = [];
            var cisList = inst.card_instance_skills ? [].concat(inst.card_instance_skills) : [];
            cisList.forEach(function(cis) { if (cis && cis.skills) flatSkills.push(cis.skills); });
            return { instance_id: inst.instance_id, card_id: inst.card_id, hp: inst.hp, attack: inst.attack, defense: inst.defense, skills: flatSkills };
        });
    }
    
    tradeDraft = { targetUser: u.data, give: [], ask: [], targetCol: tCol, targetInstances: tInstances };
    renderTradeBuilder();
    $('tr-builder').style.display = 'flex';
}

function renderTradeBuilder() {
    if(!tradeDraft.targetUser) return;
    $('tb-name').textContent = tradeDraft.targetUser.username;
    
    function renderDraftSide(arr, m) {
        if(!arr.length) return '';
        return arr.map(function(inst_id, idx){
            var inst = (m === 'give' ? window.myInstances : tradeDraft.targetInstances).find(function(i){ return i.instance_id === inst_id; });
            if(!inst) return '';
            var c = cardById(inst.card_id); if(!c) return '';
            
            var mStr = c.t.match(/[A-Za-zÀ-ÿ0-9]/); var ini = mStr ? mStr[0].toUpperCase() : '?';
            var has = c.img && /^http|data:image\//.test(c.img);
            var R = RAR[ri(c.r)];
            var renderBlock = '<div style="width:56px;height:80px;border-radius:6px;background:var(--'+R.cls+');display:inline-block;margin:0 4px 4px 0;position:relative;border:1px solid rgba(0,0,0,0.3);box-shadow:0 2px 4px rgba(0,0,0,0.2)" title="'+esc(c.t)+'"><div style="position:absolute;inset:3px;border-radius:4px;background:var(--surface);background-size:cover;background-position:center;'+(has?'background-image:url(\''+c.img+'\')':'')+'">'+(has?'':'<span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:16px;font-weight:bold">'+ini+'</span>')+'</div></div>';
            
            return '<div style="position:relative"><button type="button" class="btn sm danger tb-rm" data-idx="'+idx+'" data-m="'+m+'" style="position:absolute;top:-6px;right:-4px;padding:0;width:18px;height:18px;border-radius:50%;z-index:2;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;line-height:1">×</button>'+renderBlock+'</div>';
        }).join('');
    }
    
    $('tb-give').innerHTML = renderDraftSide(tradeDraft.give, 'give');
    $('tb-ask').innerHTML = renderDraftSide(tradeDraft.ask, 'ask');
    $('tb-send').disabled = (tradeDraft.give.length === 0 && tradeDraft.ask.length === 0);
}

var tradeSort = 'rar_desc', tradeQuery = '';
var TRADE_SORTS = [
    ['rar_desc','Rareté (haute → basse)'], ['rar_asc','Rareté (basse → haute)'],
    ['note_desc','Note (haute → basse)'], ['note_asc','Note (basse → haute)'],
    ['atk_desc','Attaque ↓'], ['def_desc','Défense ↓'], ['hp_desc','PV ↓'],
    ['name_asc','Nom A → Z'], ['name_desc','Nom Z → A']
];

function tradeSourceList() {
    var src = selectMode === 'give' ? (window.myInstances || []) : (tradeDraft.targetInstances || []);
    var already = selectMode === 'give' ? tradeDraft.give : tradeDraft.ask;
    var q = tradeQuery.trim().toLowerCase();
    var list = [];
    src.forEach(function(inst){
        if (already.indexOf(inst.instance_id) !== -1) return;
        var c = cardById(inst.card_id); if (!c) return;
        if (q && c.t.toLowerCase().indexOf(q) === -1 && String(c.cat||'').toLowerCase().indexOf(q) === -1) return;
        list.push({inst: inst, c: c, note: calculateNote(c.r, inst.hp, inst.attack, inst.defense)});
    });
    var key = tradeSort.split('_')[0], dir = tradeSort.split('_')[1] === 'asc' ? 1 : -1;
    list.sort(function(a, b){
        var va, vb;
        if (key === 'rar') { va = ri(a.c.r); vb = ri(b.c.r); }
        else if (key === 'note') { va = a.note; vb = b.note; }
        else if (key === 'atk') { va = a.inst.attack; vb = b.inst.attack; }
        else if (key === 'def') { va = a.inst.defense; vb = b.inst.defense; }
        else if (key === 'hp') { va = a.inst.hp; vb = b.inst.hp; }
        else { return a.c.t.localeCompare(b.c.t, 'fr') * dir; }
        if (va === vb) { // égalité : note puis nom
            if (a.note !== b.note) return b.note - a.note;
            return a.c.t.localeCompare(b.c.t, 'fr');
        }
        return (va - vb) * dir;
    });
    return list;
}

function renderTradeSelectGrid() {
    var grid = $('ms-grid'), sel = window.tradeSel || {};
    var list = tradeSourceList();
    if (!list.length) {
        grid.innerHTML = '<div class="empty-col">' + (tradeQuery ? 'Aucune carte ne correspond.' : 'Aucune carte disponible.') + '</div>';
        grid.classList.remove('rc-mode');
        return;
    }
    grid.innerHTML = list.map(function(o){
        return '<button type="button" class="slot ms-pick' + (sel[o.inst.instance_id] ? ' rc-sel' : '') + '" data-id="' + o.inst.instance_id + '">' + cardHTML(o.c, o.inst) + '</button>';
    }).join('');
    grid.classList.add('rc-mode');
}

function openTradeSelect(mode) {
    selectMode = mode;
    window.tradeSel = {}; // Reset selection
    tradeQuery = '';
    $('ms-title').textContent = mode === 'give' ? 'Ta collection' : ('Collection de ' + tradeDraft.targetUser.username);

    // Barre de tri / recherche (recréée à chaque ouverture)
    var oldTools = $('ms-tools'); if (oldTools) oldTools.remove();
    var tools = document.createElement('div');
    tools.id = 'ms-tools';
    tools.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px';
    tools.innerHTML =
        '<input type="text" id="ms-search" class="search-input" placeholder="Rechercher une carte…" autocomplete="off" style="flex:1 1 140px;min-width:0;padding:8px 10px">' +
        '<select id="ms-sort" aria-label="Trier" style="flex:0 1 210px;padding:8px 10px">' +
        TRADE_SORTS.map(function(o){ return '<option value="'+o[0]+'"'+(o[0]===tradeSort?' selected':'')+'>'+o[1]+'</option>'; }).join('') +
        '</select>';
    $('ms-grid').parentNode.insertBefore(tools, $('ms-grid'));
    $('ms-sort').onchange = function(){ tradeSort = this.value; renderTradeSelectGrid(); };
    $('ms-search').oninput = function(){ tradeQuery = this.value; renderTradeSelectGrid(); };

    renderTradeSelectGrid();

    var oldActions = $('ts-actions');
    if (oldActions) oldActions.remove();
    if (mode === 'give' || mode === 'ask') {
        var actions = document.createElement('div');
        actions.id = 'ts-actions';
        actions.style = 'margin-top:16px;display:flex;justify-content:flex-end;gap:8px;';
        actions.innerHTML = '<button type="button" class="btn" id="ts-cancel">Annuler</button><button type="button" class="btn primary" id="ts-ok">Valider (<span id="ts-count">0</span>)</button>';
        $('ms-grid').parentNode.appendChild(actions);
    } else {
        $('ms-grid').classList.remove('rc-mode');
    }

    $('modal-select').hidden = false;
}

async function submitTrade() {
    if(tradeDraft.give.length === 0 && tradeDraft.ask.length === 0) return;
    $('tb-send').disabled = true;
    var r = await sb.from('trades').insert({sender_id: U.id, receiver_id: tradeDraft.targetUser.id}).select().single();
    if(r.error) { toast(errMsg(r.error)); $('tb-send').disabled = false; return; }

    var tid = r.data.id;
    function mk(instId, list, owner) {
        var inst = list.find(function(i){ return i.instance_id === instId; });
        if (!inst) return null;
        return {trade_id: tid, card_id: inst.card_id, instance_id: inst.instance_id, owner_id: owner, qty: 1};
    }
    var items = [];
    tradeDraft.give.forEach(function(id){ var o = mk(id, window.myInstances || [], U.id); if (o) items.push(o); });
    tradeDraft.ask.forEach(function(id){ var o = mk(id, tradeDraft.targetInstances || [], tradeDraft.targetUser.id); if (o) items.push(o); });

    var ins = await sb.from('trade_items').insert(items);
    if (ins.error && /instance_id/.test(ins.error.message || '')) {
        // colonne instance_id absente : on enregistre au moins la vraie carte (card_id)
        tradeHasInstCol = false;
        ins = await sb.from('trade_items').insert(items.map(function(o){ return {trade_id:o.trade_id, card_id:o.card_id, owner_id:o.owner_id, qty:o.qty}; }));
    }
    if (ins.error || !items.length) {
        await sb.from('trades').delete().eq('id', tid); // pas d'échange vide
        toast(ins.error ? errMsg(ins.error) : "Aucune carte valide dans l'offre.");
        $('tb-send').disabled = false;
        return;
    }

    toast('Offre envoyée !');
    $('tr-builder').style.display = 'none';
    $('tr-input').value = '';
    tradeDraft.give = []; tradeDraft.ask = [];
    await loadTrades();
}

async function handleTradeAct(id, act) {
    if (act === 'cancel' || act === 'reject') {
        var st = act === 'cancel' ? 'canceled' : 'rejected';
        var r = await sb.from('trades').update({status: st}).eq('id', id);
        if(!r.error) { toast('Échange ' + (act==='cancel'?'annulé':'refusé')); loadTrades(); }
        else toast(errMsg(r.error));
    } else if (act === 'accept') {
        try {
            var r = await sb.rpc('accept_trade', {t_id: id});
            if(r.error) throw r.error;
            toast('Échange accepté !');
            await loadCol();
            await loadTrades();
            renderAll();
        } catch(e) {
            toast(errMsg(e));
        }
    }
}


function renderFriends() {
    var reqHtml = '', listHtml = '';
    
    var pendingInc = myRequests.filter(function(r){ return !r.isMeSender; });
    if(pendingInc.length > 0) {
        reqHtml += '<h3>Demandes reçues</h3><div class="clist" style="margin-bottom:16px">';
        pendingInc.forEach(function(req) {
            reqHtml += '<div class="crow"><span>'+esc(req.otherName)+'</span>'+
            '<button type="button" class="btn sm primary fr-btn" data-act="accept" data-id="'+req.id+'">Accepter</button>'+
            '<button type="button" class="btn sm fr-btn" data-act="reject" data-id="'+req.id+'">Refuser</button></div>';
        });
        reqHtml += '</div>';
    }
    $('fr-requests').innerHTML = reqHtml;

    if(myFriends.length === 0) {
        listHtml = '<p class="hint" style="text-align:center;padding:20px;">Tu n\'as pas encore d\'amis.</p>';
    } else {
        myFriends.forEach(function(f) {
            listHtml += '<div class="crow" style="cursor:pointer" data-fprof="'+f.otherId+'"><span>'+esc(f.otherName)+'</span><em>Voir profil</em></div>';
        });
    }
    $('fr-list').innerHTML = listHtml;
}

async function addFriend(username) {
    var u = await sb.from('profiles').select('id').ilike('username', username).single();
    if(u.error || !u.data) { toast('Joueur introuvable.'); return; }
    if(u.data.id === U.id) { toast('Tu ne peux pas t\'ajouter toi-même.'); return; }
    var exist = myFriends.concat(myRequests).find(function(x){ return x.otherId === u.data.id; });
    if(exist) { toast('Relation déjà existante.'); return; }
    
    var r = await sb.from('friends').insert({user_id: U.id, friend_id: u.data.id});
    if(r.error) toast(errMsg(r.error));
    else { toast('Demande envoyée !'); $('fr-input').value = ''; await loadSocial(); renderFriends(); }
}

async function respondFriend(id, accept) {
    if(accept) {
        var r = await sb.from('friends').update({status: 'accepted'}).eq('id', id);
        if(!r.error) toast('Ami ajouté !');
    } else {
        var r = await sb.from('friends').delete().eq('id', id);
    }
    await loadSocial(); renderFriends();
}

async function openFriendProfile(userId) {
    var r = await sb.from('profiles').select('username, showcase').eq('id', userId).single();
    if(r.error) return;
    
    var c = await sb.from('card_instances').select('card_id').eq('user_id', userId);
    var tot = 0, uniq = 0;
    var uniques = {};
    if(!c.error && c.data) {
        tot = c.data.length;
        c.data.forEach(function(inst) { uniques[inst.card_id] = true; });
        uniq = Object.keys(uniques).length;
    }
    
    $('mf-name').textContent = r.data.username;
    $('mf-cards').textContent = tot;
    $('mf-uniq').textContent = uniq;
    
    var vGrid = $('mf-vitrine');
    var sc = r.data.showcase || [];
    var h = '';
    for(var i=0; i<5; i++){
        if(i < sc.length && cardById(sc[i])){
            var cObj = cardById(sc[i]);
            h += '<div class="vitrine-slot" style="border:0;background:none">'+cardHTML(cObj)+'</div>';
        } else {
            h += '<div class="vitrine-slot" style="cursor:default"></div>';
        }
    }
    vGrid.innerHTML = h;
    $('modal-friend').hidden = false;
}

