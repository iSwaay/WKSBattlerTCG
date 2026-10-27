'use strict';
/* Animation d'ouverture de pack, zoom, toasts */

var GLOW = {E:'var(--e)', L:'var(--l)'};
var cur = {n:0, torn:false, shown:false, top:0, timers:[]};
var BURST = ['var(--accent)','var(--r)','var(--e)','var(--l)','#ffffff'];
function clearTimers(){ cur.timers.forEach(clearTimeout); cur.timers = []; cur.n++; }
function later(fn, ms){ var tok = cur.n; cur.timers.push(setTimeout(function(){ if (tok === cur.n) fn(); }, ms)); }
function reducedMotion(){ return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }

function zigzag(){
  var pts = [], i;
  for (i=0;i<=16;i++) pts.push([i*100/16, i%2 ? 15.6 : 13]);
  function poly(a){ return 'polygon('+a.map(function(p){ return p[0]+'% '+p[1]+'%'; }).join(',')+')'; }
  return {
    top: poly([[0,0],[100,0]].concat(pts.slice().reverse())),
    bot: poly(pts.concat([[100,100],[0,100]]))
  };
}

function flipHTML(c, i, isNew, extra, id, delay){
  var hi = ri(c.r) >= 3;
  return '<button type="button" class="flip'+(hi?' hi':'')+(extra?' '+extra:'')+'"'+(id?' id="'+id+'"':'')+' data-i="'+i+'" style="--glow:'+(GLOW[c.r]||'transparent')+';--d:'+delay+'s" aria-label="Retourner la carte '+(i+1)+'">'+
    '<div class="flip-in"><div class="face back"><img src="logo.png" style="width:50%;"></div><div class="face front">'+cardHTML(c)+(isNew?'<em class="new">Nouvelle</em>':'')+'</div></div></button>';
}

// Ces tailles décident si les cartes tiennent sur une ligne (sinon : une carte à la fois)
var PK_MIN_W = 150, PK_MAX_W = 230, PK_GAP = 16;
function pkPerRow(n){ return Math.min(n, 5); }
function pkFitsRow(n){
    var per = pkPerRow(n);
    var vw = window.innerWidth || document.documentElement.clientWidth || 360;
    var avail = Math.min(vw, 1260) - 32;
    return per * PK_MIN_W + (per - 1) * PK_GAP <= avail;
}

function showPack(cards, flags, title){
    var st = $('stage');
    clearTimers();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    cur.cards = cards; cur.flags = flags; cur.done = false; cur.title = title || '';
    cur.top = 0;
    cards.forEach(function(c){ cur.top = Math.max(cur.top, ri(c.r)); });
    
    var n = cards.length;
    var perRow = pkPerRow(n);
    cur.isMobile = !pkFitsRow(n);   // true = une carte à la fois, false = toutes les cartes sur une ou deux lignes

    if (cur.isMobile) {
        cur.idx = 0; cur.step = 0;
        var dotsHtml = '<div class="pk-dots" id="pk-dots">' + cards.map(function(c, i) {
            return '<span class="pk-dot" id="pk-dot-'+i+'"></span>';
        }).join('') + '</div>';

        st.className = 'stage pk';
        st.innerHTML =
          '<div class="burst" id="burst"></div><div id="sparks"></div>'+
          '<div class="stage-in pk-seq-mode" style="justify-content:space-between; height:100dvh; padding:4vh 16px;">'+
            dotsHtml +
            '<div id="pk-active-card-container" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%;"></div>' +
            '<div id="pk-miniatures" class="pk-miniatures'+(n > 5 ? ' many' : '')+'"></div>' +
            '<p class="pk-hint" id="pk-hint" style="margin:2vh 0 0; color:var(--muted); font-weight:500;">Touchez pour révéler</p>' +
          '</div>';
        
        st.hidden = false;
        st.scrollTop = 0;
        sfx('tear');
        renderSeqCard();
    } else {
        cur.flipped = 0;
        var slots = cards.map(function(c, i){
          var rIdx = ri(c.r), R = RAR[rIdx], mid = (perRow - 1) / 2;
          var rot = (((i % perRow) - mid) * 2.2).toFixed(1), y = 0;
          var setName = c.cat ? esc(c.cat) : 'Wiki Packs';
          return '<div class="pk-slot" id="pk-s'+i+'" style="--rot:'+rot+'deg;--y:'+y+'px;--d:'+(i*0.09).toFixed(2)+'s;">'+
            '<button type="button" class="pkc'+(rIdx >= 2 ? ' shine' : '')+(rIdx === 3 ? ' rainbow' : '')+'" data-i="'+i+'" style="--glow:'+(GLOW[c.r] || 'var(--accent)')+'" aria-label="Retourner la carte '+(i+1)+'">'+
              '<span class="pkc-in">'+
                '<span class="pkc-face pkc-back"><span class="pkc-bi"><span class="pkc-art">'+
                  '<img src="logo.png" alt="WKS TCG" style="position:absolute; top:45%; left:50%; transform:translate(-50%, -50%); width:75%; z-index:2; filter:drop-shadow(0 4px 10px rgba(0,0,0,0.5));">'+
                  '<span class="pkc-set"><small>SET</small>'+setName+'</span>'+
                '</span></span></span>'+
                '<span class="pkc-face pkc-front">'+cardHTML(c)+'</span>'+
              '</span>'+
            '</button>'+
            (flags[i] ? '<em class="pk-new">Nouveau</em>' : '')+
            '<div class="pk-meta"><span class="pk-pill" style="--pc:var(--'+R.cls+')">'+R.svg+'</span>'+
              (flags[i] ? '<span class="pk-newtxt">Nouvelle carte</span>' : '<span class="pk-dup">Déjà possédée</span>')+'</div>'+
          '</div>';
        }).join('');
        st.className = 'stage pk';
        st.innerHTML =
          '<div class="burst" id="burst"></div><div id="sparks"></div>'+
          '<div class="stage-in">'+
            '<h2 class="pk-title"><span id="pk-t">'+(cur.title ? esc(cur.title) : 'Retournez vos cartes')+'</span> <small id="pk-count">0/'+n+'</small></h2>'+
            '<div class="pk-row pk-grid" id="pk-row" style="--cols:'+perRow+'; max-width:'+(perRow*PK_MAX_W + (perRow-1)*PK_GAP)+'px;">'+slots+'</div>'+
            '<p class="pk-hint" id="pk-hint">Cliquez sur une carte, dans l\'ordre que vous voulez. Les dos qui brillent cachent les meilleures.</p>'+
            '<button type="button" class="pk-all" id="pk-all">Tout retourner</button>'+
            '<div class="pk-bar" id="pk-bar" hidden>'+
              '<div class="pk-bar-l"><b>'+n+' cartes ajoutées</b><span>Les cartes sont rangées dans votre collection.</span></div>'+
              '<div class="pk-bar-r">'+
                '<button type="button" class="pk-btn" id="pk-col">Voir ma collection</button>'+
                '<button type="button" class="pk-btn" id="pk-back">Retour</button>'+
                '<button type="button" class="pk-btn next" id="pk-next"></button>'+
              '</div>'+
            '</div>'+
          '</div>';
        st.hidden = false;
        st.scrollTop = 0;
        sfx('tear');
    }
}

function renderSeqCard() {
    var i = cur.idx;
    var c = cur.cards[i];
    var isNew = cur.flags[i];
    var rIdx = ri(c.r);
    var R = RAR[rIdx];
    var setName = c.cat ? esc(c.cat) : 'Wiki Packs';
    var container = $('pk-active-card-container');
    
    var flipHtml = '<div class="pk-slot" id="pk-s'+i+'" style="flex:none; width:min(70vw, 280px); margin:0 auto; transform:none; animation:pkzpop 0.4s cubic-bezier(.2,.9,.3,1.2) both; cursor:pointer;">'+
        '<div class="pkc'+(rIdx >= 2 ? ' shine' : '')+(rIdx === 3 ? ' rainbow' : '')+'" id="pk-c-el">'+
          '<div class="pkc-in" id="pkc-in-el">'+
            '<div class="pkc-face pkc-back"><div class="pkc-bi"><div class="pkc-art">'+
              '<img src="logo.png" alt="WKS TCG" style="position:absolute; top:45%; left:50%; transform:translate(-50%, -50%); width:75%; z-index:2; filter:drop-shadow(0 4px 10px rgba(0,0,0,0.5));">'+
              '<div class="pkc-set"><small>SET</small>'+setName+'</div>'+
            '</div></div></div>'+
            '<div class="pkc-face pkc-front">'+cardHTML(c)+'</div>'+
          '</div>'+
        '</div>'+
      '</div>';

    var metaHtml = '<div class="pk-seq-meta" id="pk-seq-meta" style="opacity:0; transform:translateY(10px); transition:all 0.3s; text-align:center; margin-top:20px; height:60px;">' +
        '<div class="pk-pill" style="--pc:var(--'+R.cls+'); margin-bottom:8px; display:inline-block; font-size:14px; padding:6px 16px; background:var(--surface); color:var(--ink); border-radius:99px; font-weight:700;">'+R.svg.replace('height:1.2em','height:2em')+'</div>' +
        '<div style="font-weight:800; font-size:18px;">'+ (isNew ? '<span style="color:var(--ink);">Nouvelle carte !</span>' : '<span style="color:var(--muted)">Déjà possédée</span>') + '</div>' +
        '</div>';
        
    var counterHtml = '<div id="pk-seq-count" style="margin-top:20px; font-weight:700; font-size:18px; color:var(--ink); height:60px; display:flex; align-items:center; transition:opacity 0.3s;">Carte '+(i+1)+' / '+cur.cards.length+'</div>';

    container.innerHTML = flipHtml + '<div style="position:relative; height:80px; display:flex; justify-content:center; align-items:flex-start; width:100%;">' + 
        '<div style="position:absolute; top:0;" id="pk-seq-count-wrap">' + counterHtml + '</div>' + 
        '<div style="position:absolute; top:0; pointer-events:none;">' + metaHtml + '</div>' + 
        '</div>';
    
    $('pk-s'+i).onclick = handleSeqTap;
    $('pk-hint').textContent = 'Touchez pour révéler';
    
    document.querySelectorAll('.pk-dot').forEach(function(d, idx){
       if (idx === i) d.style.boxShadow = '0 0 0 2px var(--ink)';
       else d.style.boxShadow = 'none';
    });
}

function handleSeqTap() {
    if (cur.done) return;
    var i = cur.idx;
    var c = cur.cards[i];
    var rIdx = ri(c.r);
    var R = RAR[rIdx];

    if (cur.step === 0) {
        cur.step = 1;
        $('pk-s'+i).classList.add('on');
        $('pkc-in-el').style.transform = 'rotateY(180deg)';
        
        $('pk-seq-count-wrap').style.opacity = '0';
        $('pk-seq-meta').style.opacity = '1';
        $('pk-seq-meta').style.transform = 'translateY(0)';
        
        var dot = $('pk-dot-'+i);
        dot.style.background = 'var(--' + R.cls + ')';
        dot.style.boxShadow = 'none';
        dot.classList.add('pop');
        
        var has = c.img && /^http|data:image\//.test(c.img);
        var miniHtml = '<div class="pk-mini r-'+R.cls+'" style="border: 2px solid var(--'+R.cls+');">' +
            '<div class="pk-mini-in" style="'+(has?'background-image:url(\''+c.img+'\')':'')+'"></div>'+
            (cur.flags[i] ? '<div class="pk-mini-new">Nouveau</div>' : '') +
        '</div>';
        $('pk-miniatures').insertAdjacentHTML('beforeend', miniHtml);
        
        if (i < cur.cards.length - 1) {
            $('pk-hint').textContent = 'Touchez pour continuer';
        } else {
            $('pk-hint').textContent = 'Touchez pour voir le résumé';
        }

        if (rIdx >= 2){
          burst(rIdx); sfx('epic');
          if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
        } else {
          if (rIdx >= 1) burst(rIdx);
          sfx('flip');
          if (navigator.vibrate) navigator.vibrate(30);
        }
    } else {
        cur.idx++;
        if (cur.idx < cur.cards.length) {
            cur.step = 0;
            renderSeqCard();
        } else {
            finishRevealSeq();
        }
    }
}

function finishRevealSeq() {
    cur.done = true;
    var st = $('stage');
    var n = cur.cards.length;
    var slots = cur.cards.map(function(c, i){
      var rIdx = ri(c.r), R = RAR[rIdx];
      return '<div class="pk-slot on" style="width:min(45%, 150px); animation:pkzpop .4s cubic-bezier(.2,.9,.3,1.2) '+(i*0.05)+'s both;">'+
        '<div class="pkc" data-i="'+i+'">'+
          '<div class="pkc-in" style="transform:rotateY(180deg)">'+
            '<div class="pkc-face pkc-front">'+cardHTML(c)+'</div>'+
          '</div>'+
        '</div>'+
      '</div>';
    }).join('');
    
    st.innerHTML =
      '<div class="burst" id="burst"></div><div id="sparks"></div>'+
      '<div class="stage-in" style="padding-top:40px; padding-bottom:120px; height:auto; min-height:100dvh;">'+
        '<h2 class="pk-title" style="color:#fff;">Résumé du tirage</h2>'+
        '<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:16px; width:100%; margin-bottom:40px;">'+slots+'</div>'+
        '<div class="pk-bar" id="pk-bar" style="position:fixed; transform:none; left:50%; transform:translateX(-50%); bottom:calc(18px + env(safe-area-inset-bottom,0px)); width:min(960px,calc(100% - 24px)); display:flex;">'+
          '<div class="pk-bar-l"><b style="color:var(--ink);">'+n+' cartes ajoutées</b><span style="color:var(--muted);">Les cartes sont rangées dans votre collection.</span></div>'+
          '<div class="pk-bar-r">'+
            '<button type="button" class="pk-btn" id="pk-col">Voir ma collection</button>'+
            '<button type="button" class="pk-btn" id="pk-back">Retour</button>'+
            '<button type="button" class="pk-btn next" id="pk-next"></button>'+
          '</div>'+
        '</div>'+
      '</div>';
      
    var left = livePacks(), nb = $('pk-next');
    if(nb) {
        nb.disabled = left <= 0;
        nb.innerHTML = (left > 0 ? 'Ouvrir le suivant · ' + left + ' booster' + (left > 1 ? 's' : '') + ' <kbd>Espace</kbd>' : 'Plus de booster disponible');
    }
    st.scrollTop = 0;
}

function flipCard(i){
  var sl = $('pk-s' + i);
  if (!sl || sl.classList.contains('on') || cur.done) return false;
  sl.classList.add('on');
  var c = cur.cards[i], r = ri(c.r);
  cur.flipped++;
  $('pk-count').textContent = cur.flipped + '/' + cur.cards.length;
  if (r >= 2){
    burst(r); sfx('epic');
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  } else {
    if (r >= 1) burst(r);
    sfx('flip');
    if (navigator.vibrate) navigator.vibrate(30);
  }
  if (cur.flipped >= cur.cards.length) later(finishReveal, reducedMotion() ? 0 : 900);
  return true;
}

function openPkZoom(i){
  var c = cur.cards[i], st = $('stage');
  if (!c || !st || $('pk-zoom')) return;
  var d = document.createElement('div');
  d.className = 'pk-zoom'; d.id = 'pk-zoom';
  d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Carte en grand');
  d.innerHTML = '<div class="pk-zoom-in"><div class="pk-zoom-card">' + cardHTML(c) + '</div>' +
    '<button type="button" class="pk-btn" id="pk-zoom-x">Fermer</button></div>';
  st.appendChild(d);
}
function closePkZoom(){ var z = $('pk-zoom'); if (z) z.remove(); }

function flipAll(){
  var k = 0;
  cur.cards.forEach(function(c, i){
    var sl = $('pk-s' + i);
    if (sl && !sl.classList.contains('on')){ later(function(){ flipCard(i); }, (k++) * 150); }
  });
}

function finishReveal(){
  if (cur.done) return;
  cur.done = true;
  $('pk-t').textContent = cur.title ? (cur.title + ' ouvert') : 'Votre booster';
  $('pk-hint').hidden = true;
  $('pk-all').hidden = true;
  var left = livePacks(), nb = $('pk-next');
  if (nb) {
      nb.disabled = left <= 0;
      nb.innerHTML = (left > 0 ? 'Ouvrir le suivant · ' + left + ' booster' + (left > 1 ? 's' : '') + ' <kbd>Espace</kbd>' : 'Plus de booster disponible');
  }
  $('pk-bar').hidden = false;
}

function burst(top){
  if (top === undefined) top = cur.top;
  var b = $('burst'), col = BURST[top];
  if (!b || !$('sparks')) return;
  b.style.setProperty('--bc', col);
  b.classList.toggle('rainbow', top === 5);
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  var n = 10 + top*4, html = '', i;
  for (i=0;i<n;i++){
    var a = Math.round(i*360/n + Math.random()*20), d = Math.round(110 + Math.random()*150);
    html += '<span class="spark" style="--a:'+a+'deg;--dist:'+d+'px;--sc:'+(top>=2 ? col : 'var(--accent)')+';animation-delay:'+(Math.random()*0.12).toFixed(2)+'s"></span>';
  }
  $('sparks').innerHTML = html;
}

function showZoom(c, inst, nav){
  var st = $('stage');
  clearTimers();
  st.className = 'stage';
  curNav = (nav && nav.list && nav.list.length > 1) ? nav : null;
  curZoom = {c: c, inst: inst, nav: curNav};
  var isPinned = (P.showcase || []).includes(c.id);
  var pinBtn = (col[c.id] > 0) ? '<button type="button" class="btn" id="st-pin" data-id="'+c.id+'">'+(isPinned ? 'Retirer de la vitrine' : 'Mettre en vitrine')+'</button>' : '';
  var mine = inst && inst.instance_id && (window.myInstances || []).some(function(i){ return i.instance_id === inst.instance_id; });
  var rcBtn = mine ? '<button type="button" class="btn danger" id="st-recycle" data-inst="'+inst.instance_id+'">♻ Recycler (+1 jeton)</button>' : '';
  var prev = '', next = '', info = '';
  if (curNav){
    var n = curNav.list.length, i = curNav.i;
    prev = '<button type="button" class="btn-arrow zoom-arrow prev" id="zoom-prev" aria-label="Carte précédente"'+(i <= 0 ? ' disabled' : '')+'>‹</button>';
    next = '<button type="button" class="btn-arrow zoom-arrow next" id="zoom-next" aria-label="Carte suivante"'+(i >= n - 1 ? ' disabled' : '')+'>›</button>';
    if (curNav.stack){
      var dots = '';
      if (n <= 15){ for (var k = 0; k < n; k++) dots += '<button type="button" class="zdot'+(k === i ? ' on' : '')+'" data-zi="'+k+'" aria-label="Exemplaire '+(k+1)+'"></button>'; }
      info = '<div class="zoom-info">'+(dots ? '<div class="zoom-dots">'+dots+'</div>' : '')+'<span>Exemplaire '+(i+1)+' / '+n+'</span></div>';
    } else {
      info = '<div class="zoom-info"><span>'+(i+1)+' / '+n+'</span></div>';
    }
  }
  st.innerHTML = '<div class="stage-in"><div class="zoom-row">'+prev+'<div class="zoom">'+cardHTML(c, inst)+'</div>'+next+'</div>'+info+
    '<div class="stage-actions">'+pinBtn+rcBtn+'<button type="button" class="btn primary" id="st-done">Fermer</button></div></div>';
  st.hidden = false; st.scrollTop = 0;
  $('st-done').focus();
}
function closeStage(){ clearTimers(); curNav = null; curZoom = null; $('stage').hidden = true; $('stage').className = 'stage'; $('stage').innerHTML = ''; }

var tt;
function toast(msg){
  var t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(tt); tt = setTimeout(function(){ t.hidden = true; }, 2800);
}
