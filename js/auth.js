'use strict';
/* Connexion / inscription / démarrage */

var authMode = 'login', authEmail = '', authUser = '';
function renderAuth(msg, err){
  var el = $('auth'), h = '<div class="panel" style="margin-top:6vh"><div class="panel-h"><h2>Wiki Packs</h2></div>';
  if (authMode === 'config'){
    h += '<p class="msg err">Le jeu n\'est pas encore relié à sa base de données.</p>'+
      '<p class="hint">Ouvre <b>index.html</b>, remplace <b>SUPABASE_URL</b> et <b>SUPABASE_KEY</b>.</p>';
  } else if (authMode === 'loading'){
    h += '<p class="hint">'+esc(msg || 'Chargement…')+'</p>';
  } else if (authMode === 'error'){
    h += '<p class="msg err">'+esc(msg || 'Erreur')+'</p>'+
      '<div class="row"><button type="button" class="btn primary" id="au-retry">Réessayer</button><button type="button" class="btn" id="au-out">Se déconnecter</button></div>';
  } else {
    var su = authMode === 'signup';
    h += '<div class="tabs" style="display:flex;gap:6px;background:var(--surface2);border:1px solid var(--line);border-radius:12px;padding:6px;margin-bottom:18px;" role="tablist">'+
        '<button type="button" style="flex:1;border:0;padding:10px;border-radius:8px;font-weight:600;font-size:14px;transition:all 0.2s;' + (su ? 'background:none;color:var(--muted);' : 'background:var(--accent);color:var(--accent-ink);box-shadow:0 4px 12px rgba(47,95,208,0.3);') + '" data-auth="login">Connexion</button>'+
        '<button type="button" style="flex:1;border:0;padding:10px;border-radius:8px;font-weight:600;font-size:14px;transition:all 0.2s;' + (su ? 'background:var(--accent);color:var(--accent-ink);box-shadow:0 4px 12px rgba(47,95,208,0.3);' : 'background:none;color:var(--muted);') + '" data-auth="signup">Créer un compte</button></div>'+
      '<form id="auth-form" style="display:flex;flex-direction:column;gap:12px;">'+
        '<label>E-mail<input type="email" id="au-email" required autocomplete="email" value="'+esc(authEmail)+'"></label>'+
        (su ? '<label>Pseudo<input type="text" id="au-user" maxlength="24" required autocomplete="nickname" value="'+esc(authUser)+'"></label>' : '')+
        '<label>Mot de passe<input type="password" id="au-pw" minlength="6" required autocomplete="'+(su?'new-password':'current-password')+'"></label>'+
        '<button class="btn primary" type="submit" id="au-go">'+(su ? 'Créer mon compte' : 'Se connecter')+'</button>'+
        '<p class="msg'+(err?' err':'')+'" id="au-msg">'+esc(msg || '')+'</p>'+
      '</form>';
  }
  h += '</div>';
  el.innerHTML = h;
  el.hidden = false;
}

function resetLocal(){
  cards = []; col = {}; members = []; P = {username:'', is_admin:false, is_owner:false};
  SRV = {packs:0, last:Date.now(), opened:0, off:0};
  closeStage(); $('settings').hidden = true; editId = null; openRar = {};
  renderAll();
}

async function boot(){
  authMode = 'loading'; renderAuth('Chargement de ta partie…');
  try{
    var pr = await sb.from('profiles').select('username,is_admin,is_owner,showcase,tokens,inventory,active_card').eq('id', U.id).single();
    if (pr.error) throw pr.error;
    P = pr.data;
    await syncState();
    await loadCards();
    await loadCol();
    await loadSocial();
    $('auth').hidden = true;
    renderAll();
  }catch(e){
    authMode = 'error'; renderAuth(errMsg(e));
  }
}

