'use strict';
/* Rendu HTML d'une carte */

function calculateNote(r, hp, atk, def) {
    if (!hp) return '?';
    var ranges = {
        'C': {hp:[80,170], atk:[15,38], def:[5,23]},
        'R': {hp:[140,230], atk:[28,65], def:[15,34]},
        'E': {hp:[200,270], atk:[50,85], def:[25,42]},
        'L': {hp:[240,320], atk:[70,110], def:[35,55]}
    };
    var b = ranges[r] || ranges['C'];
    var pHP = Math.max(0, Math.min(1, (hp - b.hp[0]) / (b.hp[1] - b.hp[0])));
    var pATK = Math.max(0, Math.min(1, (atk - b.atk[0]) / (b.atk[1] - b.atk[0])));
    var pDEF = Math.max(0, Math.min(1, (def - b.def[0]) / (b.def[1] - b.def[0])));
    var avg = (pHP + pATK + pDEF) / 3;
    return Math.floor(avg * 9) + 1;
}

function cardHTML(c, inst){
  inst = inst || c._inst || null;
  var R = RAR[ri(c.r)];
  var has = c.img && /^http|data:image\//.test(c.img);
  var m = c.t.match(/[A-Za-zÀ-ÿ0-9]/);
  var ini = m ? m[0].toUpperCase() : '?';
  var rIdx = ri(c.r);
  var glare = rIdx >= 2 ? '<div class="glare"></div>' : '';
  
  var hp = inst ? inst.hp : (c.hp !== undefined ? c.hp : '???');
  var atk = inst ? inst.attack : (c.attack !== undefined ? c.attack : '???');
  var def = inst ? inst.defense : (c.defense !== undefined ? c.defense : '???');
  var note = (hp !== '???') ? calculateNote(c.r, hp, atk, def) : '?';
  var skills = inst && inst.skills ? inst.skills : [];
  
  var skillHtml = skills.map(function(s, i) {
      var dbRarity = (s.rarity || '').trim().toUpperCase();
      var sr = RAR.find(function(x) { return x.k === dbRarity || x.name.toUpperCase() === dbRarity || x.name.toUpperCase().replace(/\s/g,'') === dbRarity.replace(/\s/g,''); });
      if (!sr) {
          sr = RAR[ri(c.r)]; 
      }
      var en = s.energy_cost !== undefined ? s.energy_cost : (s.energy !== undefined ? s.energy : '?');

      return '<div class="skill">' +
             '<div class="sk-bar sk-col-' + sr.cls + '">' +
               '<span class="sk-rar" title="'+esc(sr.name)+'">' + sr.svg + '</span>' +
               '<span class="sk-name">' + esc(s.name) + '</span>' +
               '<span class="sk-en"><i>⚡</i> ' + esc(en) + '</span>' +
             '</div>' +
             '<span class="skill-desc">' + esc(s.description) + '</span>' +
             '</div>';
  }).join('');
  if (!skillHtml) skillHtml = '<div class="skill-empty">Génération des skills...</div>';
  var skCls = 'sk-' + Math.min(skills.length, 3);

  return '<div class="cb is-3d" style="width:100%;"><div class="card fantasy-card r-'+R.cls+'" style="--h:'+hue(c)+'">'+
    '<div class="card-header">'+
        '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:65%">' + esc(c.t) + '</span>'+
        '<span class="card-note" style="display:flex;align-items:center;gap:4px;">' + note + '/10 ' + R.svg + '</span>'+
    '</div>'+
    '<div class="card-img-wrap"'+(has?' style="background-image:url(\''+c.img+'\');background-size:cover"':'')+'>'+
        (has ? '' : '<b>'+esc(ini)+'</b>') +
    '</div>'+
    '<div class="card-stats">'+
        '<div class="stat-box stat-atk"><span style="font-size:3cqw;opacity:0.8">⚔️</span> <span>ATQ<br><span class="stat-val">'+atk+'</span></span></div>'+
        '<div class="stat-box stat-def"><span style="font-size:3cqw;opacity:0.8">🛡️</span> <span>DEF<br><span class="stat-val">'+def+'</span></span></div>'+
        '<div class="stat-box stat-hp"><span style="font-size:3cqw;opacity:0.8">❤️</span> <span>PV<br><span class="stat-val">'+hp+'</span></span></div>'+
    '</div>'+
    '<div class="card-bottom">'+
        '<div class="card-skills ' + skCls + '">' + skillHtml + '</div>'+
        '<div class="card-desc"><span class="desc-text">' + esc(c.d) + '</span></div>'+
    '</div>'+
    glare+
  '</div></div>';
}

