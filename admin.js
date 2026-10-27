'use strict';
/* Paramètres et gestion des cartes (admin) */

var confirmDel = null, setMsg = '', setErr = false;
var editId = null, openRar = {};
function editCard(){ if (!editId) return null; return cardById(editId) || (editId = null); }
function catList(){ var s = {}; cards.forEach(function(c){ s[c.cat] = 1; }); return Object.keys(s).sort(); }


function renderSettings(){
  var el = $('settings');
  var role = P.is_owner ? 'Owner' : (P.is_admin ? 'Admin' : 'Joueur');
  var h = '<div class="panel">'+
    '<div class="panel-h"><h2>Paramètres</h2><button type="button" class="btn sm" id="set-close">Fermer</button></div>';

  h += '<div class="sec"><h3>Compte</h3>'+
    '<p class="hint" style="font-size:15px;color:var(--ink)"><b>'+esc(P.username)+'</b> · '+esc(role)+'</p>'+
    '<div class="row"><button type="button" class="btn danger" id="logout">Se déconnecter</button></div>'+
    '<p class="msg'+(setErr?' err':'')+'" id="set-msg">'+esc(setMsg)+'</p></div>';

  h += '<div class="sec"><h3>Code promo</h3><p class="hint">Saisis un code pour obtenir des récompenses.</p>'+
    '<div class="row" style="align-items:center"><input type="text" id="promo-code" placeholder="Code promo..." style="max-width:200px;text-transform:uppercase;"><button type="button" class="btn primary" id="btn-promo">Valider</button></div></div>';

  if (P.is_owner){
    h += '<div class="sec"><h3>Membres ('+members.length+')</h3>'+
      '<p class="hint">Les admins peuvent ajouter, modifier et supprimer des cartes. Toi seul peux nommer ou retirer des admins.</p>';
    if (!members.length) h += '<p class="hint">Chargement…</p>';
    else h += '<div class="acc-body" style="padding:0">'+members.map(function(m){
      var tag = m.is_owner ? 'Owner' : (m.is_admin ? 'Admin' : 'Joueur');
      return '<div class="crow" style="background:var(--surface2)"><span>'+esc(m.username)+'</span><em>'+tag+'</em>'+
        (m.is_owner ? '' : '<button type="button" class="btn sm" data-adm="'+esc(m.id)+'" data-flag="'+(m.is_admin?'0':'1')+'">'+(m.is_admin?'Retirer admin':'Rendre admin')+'</button>')+'</div>';
    }).join('')+'</div>';
    h += '</div>';
  }
  h += '</div>';
  el.innerHTML = h;
}

function renderAdminCardsUI() {
  var c = $('admin-cards-container');
  if(!c) return;
  if(!P.is_admin) { c.innerHTML = '<p class="msg err">Accès refusé.</p>'; return; }
  
  var ec = editCard();
  var h = '<div class="panel" style="padding:16px;max-width:100%;margin-bottom:16px"><h3>'+(ec ? 'Modifier la carte' : 'Ajouter une carte')+'</h3>'+
      '<div class="admin-split" style="margin-top:12px">'+
        '<form id="card-form" style="display:flex;flex-direction:column;gap:12px" autocomplete="off">'+
          '<label>Titre<input type="text" id="cf-t" maxlength="40" placeholder="Ex. Mont Fuji" value="'+(ec ? esc(ec.t) : '')+'" required></label>'+
          '<div class="two">'+
            '<label>Rareté<select id="cf-r">'+RAR.map(function(r){ return '<option value="'+esc(r.k)+'"'+(ec && ec.r===r.k ? ' selected' : '')+'>'+esc(r.k)+' · '+esc(r.name)+'</option>'; }).join('')+'</select></label>'+
            '<label>Catégorie<input type="text" id="cf-c" maxlength="18" list="cats" placeholder="Ex. Lieux" value="'+(ec ? esc(ec.cat) : '')+'" required></label>'+
          '</div>'+
          '<datalist id="cats">'+catList().map(function(c){ return '<option value="'+esc(c)+'">'; }).join('')+'</datalist>'+
          '<label>Description<textarea id="cf-d" maxlength="95" placeholder="Une phrase courte (95 caractères maximum)" required>'+(ec ? esc(ec.d) : '')+'</textarea></label>'+
          '<label>Image<input type="file" id="cf-i" accept="image/*"></label>'+
          (ec && ec.img ? '<label style="flex-direction:row;align-items:center;gap:8px;font-weight:500;margin-top:4px"><input type="checkbox" id="cf-rm"> Supprimer l\'image actuelle</label>' : '')+
          '<div id="crop-zone" '+(ec && ec.img ? '' : 'hidden')+'><div class="cropper-container"><img id="crop-img" style="max-width:100%" '+(ec && ec.img ? 'src="'+ec.img+'"' : '')+'></div><p class="hint" style="text-align:center">Glisse l\'image pour la recadrer, l\'aperçu se met à jour en direct.</p></div>'+
          '<div class="row"><button class="btn primary" type="submit" id="cf-go">'+(ec ? 'Enregistrer les modifications' : 'Ajouter au jeu')+'</button>'+
            (ec ? '<button type="button" class="btn" id="cf-cancel">Annuler</button>' : '')+'</div>'+
          '<p class="msg" id="cf-msg"></p>'+
        '</form>'+
        '<div id="card-preview"></div>'+ 
      '</div></div>';

    h += '<div class="panel" style="padding:16px;max-width:100%"><h3>Cartes du jeu ('+cards.length+')</h3>'+
      '<p class="hint" style="margin-bottom:12px">Ouvre une rareté pour modifier ou supprimer ses cartes.</p>';
    RAR.forEach(function(r){
      var list = cards.filter(function(c){ return c.r === r.k; })
        .sort(function(a,b){ return a.t.localeCompare(b.t,'fr'); });
      h += '<details class="acc" data-rk="'+esc(r.k)+'"'+(openRar[r.k] ? ' open' : '')+'>'+
        '<summary><span style="display:flex;align-items:center;margin-right:8px">'+r.svg+'</span><span class="acc-n">'+esc(r.name)+'</span><span class="acc-c">'+list.length+'</span></summary>'+
        '<div class="acc-body">';
      if (!list.length) h += '<p class="hint" style="padding:2px 2px 0">Aucune carte '+esc(r.k)+' pour l\'instant.</p>';
      else h += list.map(function(c){
        var asking = confirmDel === c.id;
        return '<div class="crow"><span>'+esc(c.t)+'</span><em>'+esc(c.cat)+'</em>'+
          '<button type="button" class="btn sm" data-edit="'+esc(c.id)+'">Modifier</button>'+
          '<button type="button" class="btn sm danger" data-del="'+esc(c.id)+'">'+(asking?'Confirmer':'Supprimer')+'</button></div>';
      }).join('');
      h += '</div></details>';
    });
    h += '</div>';
    c.innerHTML = h;
    
    initCropperPreview();
}

function initCropperPreview() {
    var form = $('card-form');
    if(form) {
      var ec = editCard();
      if (ec && ec.img) {
        if(cropper) { cropper.destroy(); cropper = null; }
        cropper = new Cropper($('crop-img'), { 
        viewMode: 1, autoCropArea: 1, dragMode: 'move',
        crop: function() {
          clearTimeout(window.cropTimeout);
          window.cropTimeout = setTimeout(function() {
            var cvs = cropper.getCroppedCanvas({maxWidth: 512, maxHeight: 512});
            if(cvs) window.currentCropData = cvs.toDataURL('image/jpeg', 0.85);
            var tf = $('cf-t'); if (tf) tf.dispatchEvent(new Event('input'));
          }, 150);
        }
      });
      }
      var updatePreview = function() {
        var rm = $('cf-rm') && $('cf-rm').checked;
        if ($('cf-rm') && $('crop-zone')) { $('crop-zone').hidden = rm ? true : false; }
        var c = {
          t: $('cf-t') ? ($('cf-t').value || 'Titre') : 'Titre',
          r: $('cf-r') ? $('cf-r').value : 'C',
          cat: $('cf-c') ? ($('cf-c').value || 'Catégorie') : 'Catégorie',
          d: $('cf-d') ? ($('cf-d').value || 'Description') : 'Description',
          img: rm ? null : (window.currentCropData || (ec ? ec.img : null))
        };
        if($('card-preview')) $('card-preview').innerHTML = cardHTML(c);
      };
      ['cf-t', 'cf-c', 'cf-r', 'cf-d'].forEach(function(id) {
        if($(id)) $(id).addEventListener('input', updatePreview);
      });
      if ($('cf-rm')) $('cf-rm').addEventListener('change', updatePreview);
      updatePreview();
    }
}


async function openSettings(){
  setMsg=''; setErr=false; confirmDel=null; editId=null;
  renderSettings(); $('settings').hidden = false; $('settings').scrollTop = 0;
  if (P.is_owner){ await loadMembers(); if (!$('settings').hidden && !editId) renderSettings(); }
}
function closeSettings(){ 
  $('settings').hidden = true; 
  window.currentCropData = null;
  if(cropper) { cropper.destroy(); cropper = null; }
}

document.addEventListener('change', function(e) {
  if(e.target.id === 'sort-col'){ sortCol = e.target.value; renderViewCards('col'); }
  if(e.target.id === 'sort-all'){ sortAll = e.target.value; renderViewCards('all'); }
  if(e.target.id === 'cf-i') {
    if($('cf-rm')) $('cf-rm').checked = false;
    var file = e.target.files[0];
    if (file) {
      var url = URL.createObjectURL(file);
      $('crop-img').src = url;
      $('crop-zone').hidden = false;
      if(cropper) { cropper.destroy(); cropper = null; }
      cropper = new Cropper($('crop-img'), { 
        viewMode: 1,
        autoCropArea: 1,
        dragMode: 'move',
        crop: function() {
          clearTimeout(window.cropTimeout);
          window.cropTimeout = setTimeout(function() {
            var cvs = cropper.getCroppedCanvas({maxWidth: 512, maxHeight: 512});
            if(cvs) window.currentCropData = cvs.toDataURL('image/jpeg', 0.85);
            var tf = $('cf-t');
            if (tf) tf.dispatchEvent(new Event('input'));
          }, 150);
        }
      });
    }
  }
});

async function submitCard(){
  var t = $('cf-t').value.trim(), r = $('cf-r').value, cat = $('cf-c').value.trim(), d = $('cf-d').value.trim();
  var msg = $('cf-msg'), go = $('cf-go');
  function fail(m){ msg.className = 'msg err'; msg.textContent = m; go.disabled = false; }
  if (!t || !cat || !d){ fail('Remplis le titre, la catégorie et la description.'); return; }
  var ec = editCard();
  var dup = cards.some(function(c){ return c.t.toLowerCase() === t.toLowerCase() && (!ec || c.id !== ec.id); });
  if (dup){ fail('Une carte porte déjà ce titre.'); return; }
  go.disabled = true; msg.className = 'msg'; msg.textContent = 'Enregistrement…';
  
  var rmImg = !!($('cf-rm') && $('cf-rm').checked);
  var img = window.currentCropData || null;

  var row = {title:t, rarity:r, category:cat, description:d};
  
  // Modification pour Supabase Storage
  if (img && img.startsWith('data:image')) {
    try {
      var arr = img.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
      while(n--){ u8arr[n] = bstr.charCodeAt(n); }
      var blob = new Blob([u8arr], {type:mime});
      var fname = 'card_' + Date.now() + '.jpg';
      var ru = await sb.storage.from('cards').upload(fname, blob);
      if (ru.error) throw ru.error;
      var rurl = sb.storage.from('cards').getPublicUrl(fname);
      img = rurl.data.publicUrl;
    } catch(err) {
      fail('Erreur lors de l\'upload de l\'image : ' + errMsg(err)); 
      return;
    }
  }
  
  if (img) row.image = img; 
  else if (rmImg) row.image = null;
  
  var q = ec ? sb.from('cards').update(row).eq('id', ec.id).select().single()
             : sb.from('cards').insert(row).select().single();
  var res = await q;
  if (res.error){ fail(errMsg(res.error)); return; }
  var card = mapCard(res.data);
  if (ec){ cards[cards.indexOf(ec)] = card; setMsg = 'Carte « '+t+' » modifiée.'; toast('Carte modifiée'); }
  else { cards.push(card); setMsg = 'Carte « '+t+' » ajoutée en '+r+'.'; toast('Carte ajoutée'); }
  
  setErr = false; openRar[r] = true; editId = null; window.currentCropData = null;
  if(cropper) { cropper.destroy(); cropper = null; }
  renderCol(); renderPacks(); renderAdminCardsUI();
}

