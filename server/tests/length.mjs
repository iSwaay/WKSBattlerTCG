import fs from 'fs';
import { buildCfg, normSkill, makeHero, newMatch, act, view, botPrep, SLOTS } from '../engine.js';
const rows = JSON.parse(fs.readFileSync('/tmp/des/skills.json','utf8')).map(normSkill);
const cfg = buildCfg([{key:'hero_damage',value:{by_rarity:{L:1,E:2,R:3,C:4}}}], [1,2,3,4,5].map((i) => ({ stars: i, upgrade_cost: [3,6,8,10,null][i-1], skill_boost_pct: [10,25,45,70,100][i-1] })));
let seed=7; const r=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const RNG={C:[[80,170],[15,38]],R:[[140,230],[28,65]],E:[[200,270],[50,85]],L:[[240,320],[70,110]]};
const deck=()=>{const out=[];const rar=['L','E','E','E',...Array(8).fill('R'),...Array(8).fill('C')];rar.forEach((ra,i)=>{const [h,a]=RNG[ra];out.push({card_id:'c'+Math.floor(r()*60),rarity:ra,hp:Math.round(h[0]+r()*(h[1]-h[0])),atk:Math.round(a[0]+r()*(a[1]-a[0])),def:0,skill:rows[Math.floor(r()*rows.length)]})});return out};
const hero=makeHero({id:'p',name:'P',base_hp:40,hp_lvl10:40,energy_cap:10,effects:{}},1);
const hist={}; let stars5=0, stars4=0;
for(let g=0;g<400;g++){
  const st=newMatch(cfg,{seed:g*13+1,now:0,me:{hero:{...hero},deck:deck()},bot:{hero:{...hero,fx:{}},deck:deck()},difficulty:'normal'});
  let guard=0;
  while(st.status==='prep'&&guard++<60){
    // « me » joue comme le bot (même IA) : on échange les camps le temps de la préparation
    const t=st.me; st.me=st.bot; st.bot=t; botPrep(st,cfg); const u=st.me; st.me=st.bot; st.bot=u;
    act(st,cfg,'me',{t:'ready'},0);
    for(const sd of ['me','bot']) for(const s of SLOTS){const c=st[sd].board[s]; if(c&&c.stars>=5) stars5++; if(c&&c.stars===4) stars4++;}
  }
  hist[st.round]=(hist[st.round]||0)+1;
}
const tot=Object.entries(hist).reduce((a,[k,v])=>a+k*v,0)/400;
console.log('manches par partie (répartition):',hist,'moyenne',tot.toFixed(1),'| cartes-manches 4★:',stars4,'5★:',stars5);
