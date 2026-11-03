'use strict';
/* Décors de la table de combat : SVG originaux, dessinés en code, avec volumes (faces éclairées / ombrées), ombres portées et lueurs */

var BT_ART = (function () {
  function svg(w, h, body, cls) { return '<svg class="' + (cls || '') + '" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true" focusable="false">' + body + '</svg>'; }
  var uid = 0;
  var G = {
    defs:
      '<defs>' +
        '<linearGradient id="aRockT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9c2bb"/><stop offset="1" stop-color="#8f8780"/></linearGradient>' +
        '<linearGradient id="aRockL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a827b"/><stop offset="1" stop-color="#5a524c"/></linearGradient>' +
        '<linearGradient id="aRockR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d655f"/><stop offset="1" stop-color="#3a3430"/></linearGradient>' +
        '<linearGradient id="aLavT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a5a4c"/><stop offset="1" stop-color="#5a362d"/></linearGradient>' +
        '<linearGradient id="aLavL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5e3a31"/><stop offset="1" stop-color="#34201b"/></linearGradient>' +
        '<linearGradient id="aLavR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#432a24"/><stop offset="1" stop-color="#1e110e"/></linearGradient>' +
        '<radialGradient id="aLeaf1" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#b6ef6a"/><stop offset=".55" stop-color="#5cb23a"/><stop offset="1" stop-color="#2a7a2a"/></radialGradient>' +
        '<radialGradient id="aLeaf2" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#8fd653"/><stop offset=".6" stop-color="#3f9a33"/><stop offset="1" stop-color="#1d5f26"/></radialGradient>' +
        '<linearGradient id="aTrunk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6234"/><stop offset=".5" stop-color="#7a4a26"/><stop offset="1" stop-color="#4a2a14"/></linearGradient>' +
        '<linearGradient id="aGem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d4f6ff"/><stop offset=".45" stop-color="#3aa8f2"/><stop offset="1" stop-color="#17409a"/></linearGradient>' +
        '<linearGradient id="aCrA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd0a0"/><stop offset="1" stop-color="#e8552a"/></linearGradient>' +
        '<linearGradient id="aCrB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8552a"/><stop offset="1" stop-color="#7a1c10"/></linearGradient>' +
        '<linearGradient id="aSword" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f1f4f8"/><stop offset="1" stop-color="#8d98a8"/></linearGradient>' +
        '<radialGradient id="aGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd25a" stop-opacity=".95"/><stop offset=".5" stop-color="#ff7a1e" stop-opacity=".5"/><stop offset="1" stop-color="#ff4a10" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="aLf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f9a35"/><stop offset=".45" stop-color="#8fe04c"/><stop offset="1" stop-color="#2a8a30"/></linearGradient>' +
        '<linearGradient id="aStone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a9ae98"/><stop offset=".5" stop-color="#7f8672"/><stop offset="1" stop-color="#4c5446"/></linearGradient>' +
        '<linearGradient id="aBasT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a4560"/><stop offset="1" stop-color="#4a2640"/></linearGradient>' +
        '<linearGradient id="aBasS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2238"/><stop offset="1" stop-color="#22101c"/></linearGradient>' +
        '<linearGradient id="aLavaF" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff5a14"/><stop offset=".45" stop-color="#ffb02e"/><stop offset="1" stop-color="#ffe46a"/></linearGradient>' +
        '<filter id="aBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter>' +
      '</defs>'
  };
  function shadow(cx, cy, rx, ry) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="rgba(0,0,0,.32)" filter="url(#aBlur)"/>'; }

  /* rocher à facettes : dessus clair, face gauche moyenne, face droite sombre */
  function rock(lava) {
    var T = lava ? 'url(#aLavT)' : 'url(#aRockT)', L = lava ? 'url(#aLavL)' : 'url(#aRockL)', R = lava ? 'url(#aLavR)' : 'url(#aRockR)', ln = lava ? '#1a0d0a' : '#2a2420';
    return svg(70, 60, G.defs + shadow(35, 54, 30, 5) +
      '<g stroke="' + ln + '" stroke-width="2" stroke-linejoin="round">' +
        '<path d="M6 50 L8 28 L20 22 L26 52 Z" fill="' + L + '"/>' +
        '<path d="M26 52 L20 22 L38 14 L52 24 L48 52 Z" fill="' + L + '"/>' +
        '<path d="M48 52 L52 24 L63 30 L64 50 Z" fill="' + R + '"/>' +
        '<path d="M8 28 L20 22 L38 14 L52 24 L63 30 L50 32 L30 30 L14 34 Z" fill="' + T + '"/>' +
      '</g>' +
      '<path d="M22 20 L38 14 L46 20" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-linecap="round"/>' +
      (lava ? '<path d="M18 46 L26 36 L32 42 L40 30 L46 44" fill="none" stroke="#ffb13a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#aBlur)"/>' +
              '<path d="M18 46 L26 36 L32 42 L40 30 L46 44" fill="none" stroke="#fff2a0" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'
            : '<path d="M14 44 L22 38 M40 40 L48 34" stroke="rgba(0,0,0,.35)" stroke-width="2" stroke-linecap="round"/><ellipse cx="30" cy="26" rx="7" ry="2.5" fill="#7ba24a" opacity=".85"/>'), 'bt-art');
  }
  function bush() {
    return svg(72, 50, G.defs + shadow(36, 45, 30, 5) +
      '<g stroke="#1d5a22" stroke-width="2">' +
        '<circle cx="20" cy="32" r="15" fill="url(#aLeaf2)"/><circle cx="52" cy="32" r="15" fill="url(#aLeaf2)"/>' +
        '<circle cx="36" cy="22" r="18" fill="url(#aLeaf1)"/>' +
      '</g>' +
      '<ellipse cx="30" cy="14" rx="7" ry="3.5" fill="#e6ffb4" opacity=".6"/><circle cx="52" cy="26" r="2.6" fill="#e6ffb4" opacity=".6"/><circle cx="16" cy="28" r="2.2" fill="#e6ffb4" opacity=".5"/>' +
      '<circle cx="42" cy="30" r="2.4" fill="#ff7a8a"/><circle cx="26" cy="34" r="2.2" fill="#ffe27a"/>', 'bt-art');
  }
  function tree() {
    return svg(72, 96, G.defs + shadow(36, 90, 26, 5) +
      '<path d="M30 92 Q31 70 29 52 L43 52 Q41 70 44 92 Z" fill="url(#aTrunk)" stroke="#3a210f" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M32 54 Q33 68 32 86" stroke="rgba(255,220,170,.35)" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<g stroke="#17501f" stroke-width="2">' +
        '<circle cx="22" cy="46" r="17" fill="url(#aLeaf2)"/><circle cx="50" cy="46" r="17" fill="url(#aLeaf2)"/>' +
        '<circle cx="36" cy="30" r="24" fill="url(#aLeaf1)"/>' +
      '</g>' +
      '<ellipse cx="28" cy="20" rx="9" ry="5" fill="#f0ffc6" opacity=".55"/><circle cx="48" cy="34" r="3" fill="#f0ffc6" opacity=".4"/><circle cx="18" cy="42" r="2.6" fill="#f0ffc6" opacity=".4"/>' +
      '<path d="M16 58 Q36 70 56 58" fill="none" stroke="rgba(0,40,0,.28)" stroke-width="5" stroke-linecap="round"/>', 'bt-art');
  }
  function flowers() {
    return svg(66, 30, G.defs + '<g stroke="#2f7a2a" stroke-width="2" stroke-linecap="round"><path d="M10 28 V16 M32 28 V12 M54 28 V17 M20 28 V20"/></g>' +
      '<circle cx="10" cy="14" r="5" fill="#ff8fb3" stroke="#b34a6a" stroke-width="1"/><circle cx="10" cy="14" r="1.8" fill="#ffe27a"/>' +
      '<circle cx="32" cy="10" r="5.5" fill="#fff6c8" stroke="#c9b25a" stroke-width="1"/><circle cx="32" cy="10" r="2" fill="#ffb02e"/>' +
      '<circle cx="54" cy="15" r="5" fill="#b9a0ff" stroke="#6a52c4" stroke-width="1"/><circle cx="54" cy="15" r="1.8" fill="#ffe27a"/>' +
      '<circle cx="20" cy="18" r="3.5" fill="#ff8fb3"/>', 'bt-art');
  }
  function mushroom() {
    return svg(44, 40, G.defs + shadow(22, 36, 14, 3) +
      '<path d="M16 36 Q15 24 17 20 L27 20 Q29 24 28 36 Z" fill="#f4ead2" stroke="#8a7a52" stroke-width="1.6"/>' +
      '<path d="M4 22 Q4 6 22 5 Q40 6 40 22 Q22 26 4 22 Z" fill="#e24a3a" stroke="#7a1c14" stroke-width="2"/>' +
      '<ellipse cx="16" cy="11" rx="5" ry="2.5" fill="#ff9a8a" opacity=".7"/><circle cx="14" cy="16" r="2.2" fill="#fff"/><circle cx="26" cy="12" r="2" fill="#fff"/><circle cx="31" cy="18" r="1.8" fill="#fff"/>', 'bt-art');
  }
  function crystal() {
    return svg(56, 70, G.defs + '<ellipse cx="28" cy="40" rx="28" ry="26" fill="url(#aGlow)" opacity=".55"/>' + shadow(28, 64, 22, 4) +
      '<g stroke="#3a120c" stroke-width="2" stroke-linejoin="round">' +
        '<path d="M10 62 L6 34 L14 20 L22 36 L20 62 Z" fill="url(#aCrB)"/><path d="M6 34 L14 20 L14 38 Z" fill="url(#aCrA)"/>' +
        '<path d="M24 64 L20 26 L30 6 L40 28 L38 64 Z" fill="url(#aCrB)"/><path d="M20 26 L30 6 L31 30 Z" fill="url(#aCrA)"/><path d="M31 30 L30 6 L40 28 Z" fill="#c4401f"/>' +
        '<path d="M38 64 L40 40 L48 30 L52 44 L48 64 Z" fill="url(#aCrB)"/><path d="M40 40 L48 30 L48 46 Z" fill="url(#aCrA)"/>' +
      '</g><path d="M26 12 L29 8 M12 26 L14 23" stroke="#fff3d8" stroke-width="2" stroke-linecap="round"/>', 'bt-art');
  }
  /* torche de pierre avec flamme animée */
  function torch() {
    return svg(40, 84, G.defs + '<ellipse cx="20" cy="22" rx="20" ry="22" fill="url(#aGlow)" class="bt-flame-glow"/>' + shadow(20, 80, 14, 3) +
      '<path d="M12 80 L14 40 L26 40 L28 80 Z" fill="url(#aRockL)" stroke="#2a2420" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M10 42 L10 34 L30 34 L30 42 Z" fill="url(#aRockT)" stroke="#2a2420" stroke-width="2" stroke-linejoin="round"/>' +
      '<g class="bt-flame"><path d="M20 6 C28 16 30 22 26 30 C24 34 16 34 14 30 C10 22 14 16 20 6 Z" fill="#ff8a1e" stroke="#c43a10" stroke-width="1.5"/>' +
      '<path d="M20 15 C24 21 25 25 22 30 C20 32 17 31 16 28 C15 24 17 20 20 15 Z" fill="#ffe27a"/></g>', 'bt-art');
  }
  function lavaPool() {
    return svg(80, 34, G.defs +
      '<ellipse cx="40" cy="18" rx="38" ry="14" fill="#2a130e"/>' +
      '<ellipse cx="40" cy="16" rx="34" ry="11" fill="#ff8a1e"/><ellipse cx="40" cy="14" rx="28" ry="7" fill="#ffd25a"/>' +
      '<ellipse cx="32" cy="12" rx="9" ry="2.5" fill="#fff6c8" opacity=".8"/><circle cx="52" cy="14" r="2.4" fill="#fff6c8" class="bt-bubble"/>', 'bt-art');
  }

  /* grande feuille tropicale + bouquet de feuilles qui déborde sur le terrain */
  function leaf() {
    return '<path d="M30 108 C4 84 2 40 30 3 C58 40 56 84 30 108 Z" fill="url(#aLf)" stroke="#14501c" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M30 8 C14 36 14 70 26 100 C10 76 12 40 30 8Z" fill="#d4f98c" opacity=".32"/>' +
      '<path d="M30 106 V10" stroke="#d9f59a" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>' +
      '<path d="M30 82 L13 64 M30 82 L47 64 M30 60 L14 42 M30 60 L46 42 M30 38 L20 26 M30 38 L40 26" stroke="#bfe878" stroke-width="1.5" stroke-linecap="round" opacity=".7" fill="none"/>';
  }
  function cluster(big) {
    var an = big ? [-74, -48, -22, 4, 30, 56, 80] : [-60, -28, 2, 32, 62], sc = big ? [.8, 1, .9, 1.05, .92, 1, .78] : [.85, 1, .95, 1, .85];
    var g = '';
    an.forEach(function (a, i) { g += '<g transform="translate(80 128) rotate(' + a + ') scale(' + sc[i] + ') translate(-30 -108)">' + leaf() + '</g>'; });
    return svg(160, 140, G.defs + '<ellipse cx="80" cy="130" rx="40" ry="8" fill="rgba(0,30,0,.45)" filter="url(#aBlur)"/>' + g, 'bt-art');
  }
  /* idole de pierre moussue, œil rubis */
  function idol() {
    return svg(84, 104, G.defs + shadow(42, 98, 30, 5) +
      '<path d="M14 98 L16 42 Q16 10 42 8 Q68 10 68 42 L70 98 Z" fill="url(#aStone)" stroke="#2c3226" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M22 30 Q42 18 62 30" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M22 44 H38 L34 52 H22 Z M46 44 H62 L62 52 H50 Z" fill="#1c2018" stroke="#10130d" stroke-width="1.6"/>' +
      '<circle cx="30" cy="48" r="5" fill="#ff3b3b" stroke="#7a0f0f" stroke-width="1.5"/><circle cx="54" cy="48" r="5" fill="#ff3b3b" stroke="#7a0f0f" stroke-width="1.5"/>' +
      '<circle cx="28.5" cy="46.5" r="1.6" fill="#ffd0d0"/><circle cx="52.5" cy="46.5" r="1.6" fill="#ffd0d0"/>' +
      '<path d="M26 70 H58 V82 H26 Z" fill="#1c2018" stroke="#10130d" stroke-width="1.6"/><path d="M31 70 V82 M37 70 V82 M43 70 V82 M49 70 V82 M55 70 V82" stroke="#cfd5bf" stroke-width="2.2"/>' +
      '<path d="M12 22 Q28 4 42 10 Q56 4 72 22 Q60 14 42 16 Q24 14 12 22Z" fill="#4fae3a" stroke="#1b5a1f" stroke-width="2"/>' +
      '<path d="M18 62 Q10 76 14 92 M64 56 Q74 72 68 92" fill="none" stroke="#3f9a33" stroke-width="3" stroke-linecap="round"/>', 'bt-art');
  }
  /* colonnes de basalte sombre, liseré de lave */
  function basalt() {
    function col(x, y, w, h) {
      return '<path d="M' + x + ' ' + (y + 8) + ' L' + (x + w / 2) + ' ' + y + ' L' + (x + w) + ' ' + (y + 8) + ' L' + (x + w) + ' ' + (y + h) + ' L' + x + ' ' + (y + h) + ' Z" fill="url(#aBasS)" stroke="#12060d" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M' + x + ' ' + (y + 8) + ' L' + (x + w / 2) + ' ' + y + ' L' + (x + w) + ' ' + (y + 8) + ' L' + (x + w / 2) + ' ' + (y + 15) + ' Z" fill="url(#aBasT)" stroke="#12060d" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<path d="M' + (x + w) + ' ' + (y + 10) + ' V' + (y + h - 2) + '" stroke="#ff8a2a" stroke-width="2" stroke-linecap="round" opacity=".85"/>';
    }
    return svg(96, 84, G.defs + shadow(48, 80, 40, 5) + col(6, 30, 26, 46) + col(62, 24, 26, 52) + col(32, 8, 30, 68), 'bt-art');
  }
  /* coulée de lave : croûte sombre, cœur lumineux, veines claires (étirée en hauteur) */
  function lavaFlow(flip) {
    return '<svg class="bt-art bt-flow" viewBox="0 0 110 280" preserveAspectRatio="none" aria-hidden="true" focusable="false">' + G.defs + (flip ? '<g transform="translate(110 0) scale(-1 1)">' : '<g>') +
      '<path d="M0 0 H62 C50 26 66 52 48 82 C32 108 54 138 40 168 C28 196 50 226 38 280 H0 Z" fill="#1c0b0e" stroke="#0e0508" stroke-width="2"/>' +
      '<path d="M0 0 H52 C42 26 56 52 40 82 C26 108 46 138 32 168 C22 196 42 226 30 280 H0 Z" fill="url(#aLavaF)"/>' +
      '<path d="M8 20 L22 40 L18 62 L34 84 M10 120 L26 140 L20 160 L36 182 M6 210 L20 228 L16 250" fill="none" stroke="#fff6b0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>' +
      '<path d="M0 0 H52 C42 26 56 52 40 82 C26 108 46 138 32 168 C22 196 42 226 30 280" fill="none" stroke="#ffd25a" stroke-width="2.4" opacity=".9"/>' +
    '</g></svg>';
  }

  /* emblème d'emplacement vide */
  function swords() {
    var sw = '<g><path d="M30 4 L36 8 L36 46 L30 46 Z" fill="url(#aSword)" stroke="#59616e" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<rect x="22" y="44" width="22" height="5" rx="2" fill="#c9a13a" stroke="#6b5416" stroke-width="1.2"/>' +
      '<rect x="30.5" y="49" width="5" height="12" rx="2" fill="#7a4a26" stroke="#3f2411" stroke-width="1.2"/></g>';
    return svg(66, 66, G.defs + '<g transform="rotate(35 33 33)">' + sw + '</g><g transform="rotate(-35 33 33)">' + sw + '</g>', 'bt-emblem');
  }
  function gem() {
    return svg(56, 56, G.defs +
      '<path d="M28 3 L50 16 L50 40 L28 53 L6 40 L6 16 Z" fill="url(#aGem)" stroke="#0f2f73" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path d="M28 3 L50 16 L28 28 L6 16 Z" fill="#fff" opacity=".4"/><path d="M28 28 L50 16 L50 40 L28 53 Z" fill="#0f3fa0" opacity=".3"/>' +
      '<path d="M28 28 V53 M6 16 L28 28" stroke="#fff" stroke-opacity=".5" stroke-width="1"/>', 'bt-gem-svg');
  }

  var P = function (style, art, extra) { return '<span class="d' + (extra ? ' ' + extra : '') + '" style="' + style + '">' + art + '</span>'; };

  /* décor d'un camp : camp ennemi = coulées de lave + basalte ; ton camp = jungle (grandes feuilles, idole, rochers moussus) */
  function decor(side) {
    if (side === 'bot') {
      return '<div class="bt-deco bt-deco-lava">' +
        '<span class="d flow" style="left:0;top:0;bottom:0;width:21%">' + lavaFlow() + '</span>' +
        '<span class="d flow" style="right:0;top:0;bottom:0;width:21%">' + lavaFlow(true) + '</span>' +
        P('left:17%;top:4%;width:70px', basalt()) + P('right:17%;top:6%;width:70px', basalt()) +
        P('left:15%;bottom:-2%;width:56px', basalt()) + P('right:14%;bottom:-3%;width:60px', basalt()) +
        P('left:46%;top:-3%;width:56px;opacity:.9', basalt()) +
      '</div>';
    }
    return '<div class="bt-deco bt-deco-grass">' +
      P('left:-6%;top:-10%;width:150px;transform:rotate(150deg)', cluster(false)) + P('right:-6%;top:-10%;width:150px;transform:rotate(-150deg)', cluster(false)) +
      P('left:-7%;bottom:-8%;width:170px', cluster(true)) + P('right:-7%;bottom:-8%;width:170px;transform:scaleX(-1)', cluster(true)) +
      P('right:2%;top:34%;width:62px', idol()) + P('left:3%;top:46%;width:58px', bush()) +
      P('left:16%;bottom:-1%;width:62px', rock(false)) + P('right:20%;bottom:0;width:46px', mushroom()) +
      P('left:44%;bottom:-3%;width:60px', flowers()) +
    '</div>';
  }

  return { cluster: cluster, idol: idol, basalt: basalt, lavaFlow: lavaFlow, rock: rock, bush: bush, tree: tree, swords: swords, gem: gem, decor: decor };
})();
