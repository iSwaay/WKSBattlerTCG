import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || '/usr/lib/node_modules', '/usr/local/lib/node_modules'] }));
import fs from 'fs';
import { buildCfg, normSkill, makeHero, newMatch, act, endPrep, view } from '../engine.js';
const root = new URL('../../', import.meta.url).pathname;
const cfg = buildCfg([], [1,2,3,4,5].map((i) => ({ stars: i, upgrade_cost: [3,4,5,6,null][i-1], skill_boost_pct: [10,25,45,70,100][i-1] })));
const SK = [
 { id:1, rarity:'C', name:'Coup rapide', category:'attack', description:'Frappe 120 % de l\'ATQ.', energy_cost:1, trigger:'on_attack', target:'target', damage_atk_pct:60 },
 { id:2, rarity:'C', name:'Peau dure', category:'defense', description:'+30 % DEF au début du combat.', energy_cost:1, trigger:'on_combat_start', target:'self', def_mod_pct:30 },
 { id:3, rarity:'R', name:'Venin', category:'attack', description:'Empoisonne la cible.', energy_cost:2, trigger:'on_attack', target:'target', status_effect:'poison', status_value:8, status_duration:3 },
 { id:4, rarity:'R', name:'Régénération', category:'utility', description:'Soigne 10 % PV max.', energy_cost:2, trigger:'on_combat_start', target:'all_allies', heal_max_hp_pct:10 },
 { id:5, rarity:'E', name:'Givre', category:'attack', description:'Gèle un ennemi.', energy_cost:3, trigger:'on_combat_start', target:'lane_enemy', status_effect:'freeze', status_value:1, status_duration:1 },
 { id:6, rarity:'L', name:'Exécution', category:'attack', description:'Achève sous 30 % PV.', energy_cost:4, trigger:'every_n_attacks', trigger_n:2, target:'target', damage_atk_pct:100, extra:{execute_below_pct:30} },
 { id:7, rarity:'C', name:'Fureur', category:'attack', description:'+20 % ATQ.', energy_cost:0, trigger:'passive', target:'self', atk_mod_pct:20 },
].map(normSkill);
const mk = (n) => Array.from({ length: 20 }, (_, i) => ({ card_id: 'c' + (i % 8), instance_id: n + i, hp: 120 + i * 8, atk: 20 + (i % 7) * 5, def: 8 + (i % 5) * 3, skill: SK[(i + n.length) % SK.length] }));
const heroRows = [
 { id:'pionnier', name:'Le Pionnier', archetype:'', base_hp:100, hp_lvl10:100, energy_cap:10, field_slots:5, effects:{}, price:0, image:'', active:true },
 { id:'egide', name:"L'Égide", archetype:'', base_hp:115, hp_lvl10:115, energy_cap:10, field_slots:4, effects:{ blocked_slots:['R2'], shield_efficiency_pct:25 }, price:0, image:'', active:true } ];
let match = null; const log = [];
const server = (body) => {
  const now = Date.now();
  if (body.action === 'resume') return match && match.status === 'prep' ? { ok:true, match_id:'m1', now, view: view(match, cfg, true) } : { ok:true, match:null, now };
  if (body.action === 'start') { match = newMatch(cfg, { seed: 42, now, me:{ hero: makeHero(heroRows[1], 3), deck: mk('a') }, bot:{ hero: makeHero(heroRows[0], 4), deck: mk('bb') }, difficulty: body.difficulty }); return { ok:true, match_id:'m1', now, view: view(match, cfg, true) }; }
  if (body.action === 'forfeit') { match = null; return { ok:true, now }; }
  if (body.action === 'act') {
    const r = act(match, cfg, 'me', body.a, now);
    const v = view(match, cfg, body.a.t === 'ready');
    log.push([body.a.t, r.error || 'ok']);
    return { ok: !r.error, error: r.error || null, match_id:'m1', now, view: v, reward: match.status === 'over' && match.winner === 'me' ? { xp:100, hero_xp:100, level:2, level_before:1 } : null };
  }
};
const html = fs.readFileSync(root + 'index.html', 'utf8');
const combat = html.slice(html.indexOf('<div id="arena-view-combat">'), html.indexOf('<div id="arena-view-decks"'));
const page_html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(root + "css/styles.css", "utf8")}</style></head><body><div class="wrap" style="padding:12px"><div id="app">${combat}</div></div></body></html>`;
const browser = await chromium.launch();
for (const [name, w, h] of [['desktop', 900, 1100], ['mobile', 390, 900]]) {
  match = null;
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.exposeFunction('__srv', (b) => JSON.stringify(server(b)));
  await page.setContent(page_html);
  await page.evaluate(() => {
    window.$ = (id) => document.getElementById(id);
    window.esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
    window.RAR = [{k:'C',cls:'c'},{k:'R',cls:'r'},{k:'E',cls:'e'},{k:'L',cls:'l'}]; window.ri = (k) => Math.max(0, ['C','R','E','L'].indexOf(k));
    window.cards = Array.from({ length: 8 }, (_, i) => ({ id: 'c' + i, t: 'Carte ' + i, r: ['C','R','E','L'][i % 4], img: null }));
    window.cardById = (id) => cards.filter((c) => c.id === id)[0] || null;
    window.HEROES = [{ id:'pionnier', name:'Pionnier', image:'' }, { id:'egide', name:'Égide', image:'' }]; window.heroById = (id) => HEROES.filter((h) => h.id === id)[0] || null;
    window.toast = (m) => { (window.__toasts = window.__toasts || []).push(m); }; window.loadHeroes = () => {};
    window.DECK_SIZE = 20; window.myDecks = [{ id:'d1', name:'Mon deck', cards: Array(20).fill('x') }];
    window.sb = { functions: { invoke: async (n, o) => ({ data: JSON.parse(await window.__srv(o.body)) }) } };
    window.confirm = () => true;
  });
  await page.addScriptTag({ path: root + 'js/battle.js' });
  await page.evaluate(() => btRefreshMenu());
  await page.screenshot({ path: `/tmp/bt/${name}-menu.png` });
  await page.click('#bt-start'); await page.waitForSelector('.bt-offers .bt-off');
  await page.screenshot({ path: `/tmp/bt/${name}-prep1.png` });
  // acheter les cartes abordables sur les emplacements libres
  for (let k = 0; k < 4; k++) {
    const offs = await page.$$('.bt-off:not(.bt-off-no)'); if (!offs.length) break;
    await offs[0].click();
    const cell = await page.$('.bt-board-me .bt-cell:not(.full):not(.blocked)'); if (!cell) break;
    await cell.click(); await page.waitForTimeout(150);
  }
  await page.screenshot({ path: `/tmp/bt/${name}-prep2.png` });
  // 3 manches
  for (let r = 0; r < 3; r++) {
    await page.click('#bt-ready'); await page.waitForSelector('#bt-skip'); await page.waitForTimeout(700);
    if (r === 0) await page.screenshot({ path: `/tmp/bt/${name}-combat.png` });
    await page.click('#bt-skip'); await page.waitForSelector('#bt-banner:not([hidden])');
    await page.waitForSelector('.bt-offers .bt-off, .bt-over', { timeout: 8000 });
    // jouer ce qu'on peut
    for (let k = 0; k < 3; k++) {
      const offs = await page.$$('.bt-off:not(.bt-off-no)'); if (!offs.length) break;
      await offs[0].click(); const cell = await page.$('.bt-board-me .bt-cell:not(.blocked)'); if (!cell) break; await cell.click(); await page.waitForTimeout(150);
      const fus = await page.$('[data-fusion]'); if (fus) await fus.click();
    }
    if (await page.$('.bt-over')) break;
  }
  await page.screenshot({ path: `/tmp/bt/${name}-after.png` });
  const over = await page.$('.bt-over');
  // finir la partie en jouant vite
  for (let g = 0; g < 45 && !(await page.$('.bt-over')); g++) { await page.click('#bt-ready'); await page.waitForSelector('#bt-skip'); await page.click('#bt-skip'); await page.waitForSelector('.bt-offers .bt-off, .bt-over', { timeout: 8000 }); }
  await page.screenshot({ path: `/tmp/bt/${name}-over.png` });
  console.log(name, { errors, over: !!(await page.$('.bt-over')), toasts: await page.evaluate(() => window.__toasts || []), actions: log.length });
  await page.close();
}
await browser.close();
