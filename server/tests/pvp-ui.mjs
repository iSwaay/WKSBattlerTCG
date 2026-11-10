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

const duels = {}; let nextId = 1; const rows = (u) => Object.values(duels).filter((d) => d.host === u || d.guest === u);
const side = (n, h, lv) => ({ hero: makeHero(heroRows[h], lv), deck: mk(n) });
const server = (user, body) => {
  const now = Date.now();
  const F = body.friend_id;
  if (body.action === 'create') { const id = 'd' + nextId++; duels[id] = { id, code: 'K7P2QX', host: user, guest: null, invited: F || null, status: 'waiting', setup: side('h' + user, user === 'A' ? 1 : 0, 3) }; return { ok: true, now, duel_id: id, code: 'K7P2QX', invited: F || null }; }
  if (body.action === 'join') {
    const d = body.duel_id ? duels[body.duel_id] : Object.values(duels).find((x) => x.code === String(body.code).toUpperCase() && x.status === 'waiting');
    if (!d || d.status !== 'waiting') return { error: 'Code invalide ou duel expiré.' };
    if (d.host === user) return { error: 'C\'est ton propre duel.' };
    d.guest = user; d.status = 'prep'; d.st = newMatch(cfg, { seed: 7, now, mode: 'pvp', me: d.setup, bot: side('g' + user, 0, 4) });
    return { ok: true, now, duel_id: d.id, view: view(d.st, cfg, true, 'bot') };
  }
  if (body.action === 'invites') return { ok: true, now, invites: Object.values(duels).filter((d) => d.invited === user && d.status === 'waiting').map((d) => ({ duel_id: d.id, from: 'Alice' })) };
  if (body.action === 'decline' || body.action === 'cancel') { const d = duels[body.duel_id]; if (d) d.status = 'cancelled'; return { ok: true, now }; }
  if (body.action === 'resume') { const d = rows(user).find((x) => x.status === 'waiting' || x.status === 'prep'); return { ok: true, now, duel: d ? (d.status === 'waiting' ? { id: d.id, status: 'waiting', code: d.code, invited: !!d.invited } : { id: d.id, status: 'prep' }) : null }; }
  const d = duels[body.duel_id]; if (!d) return { error: 'Duel introuvable.' };
  const vw = d.host === user ? 'me' : 'bot';
  if (d.status === 'waiting') return { ok: true, now, status: 'waiting', code: d.code };
  if (d.status === 'cancelled') return { ok: true, now, ended: true };
  if (body.action === 'forfeit') { d.st.status = 'over'; d.st.winner = vw === 'me' ? 'bot' : 'me'; d.status = 'over'; return { ok: true, now, view: view(d.st, cfg, true, vw) }; }
  let err = null;
  if (d.st.status === 'prep' && d.st.deadline && now > d.st.deadline + 1500) endPrep(d.st, cfg, now);
  else if (body.action === 'act') { const r = act(d.st, cfg, vw, body.a, now); err = r.error || null; }
  if (d.st.status === 'over') d.status = 'over';
  return { ok: !err, error: err, duel_id: d.id, now, view: view(d.st, cfg, true, vw), reward: d.st.status === 'over' && d.st.winner === vw ? { xp: 100, hero_xp: 100, level: 2, level_before: 1 } : null };
};
import http from 'http'; import path from 'path';
const html = fs.readFileSync(root + 'index.html', 'utf8');
const mime = { '.png': 'image/png', '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.webp': 'image/webp' };
let pageHtml = '';
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/__test.html') { res.setHeader('content-type', 'text/html'); return res.end(pageHtml); }
  const f = path.join(root, u); if (!f.startsWith(root) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', mime[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
}).listen(0);
const PORT = srv.address().port;
const combat = html.slice(html.indexOf('<div id="arena-view-combat">'), html.indexOf('<div id="arena-view-decks"'));
const page_html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/styles.css"><link rel="stylesheet" href="/css/battle.css"><link rel="stylesheet" href="/css/theme.css"></head><body><div class="wrap" style="padding:12px"><div id="app">${combat}</div></div></body></html>`;
pageHtml = page_html;

const browser = await chromium.launch();
async function mkPage(user, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.exposeFunction('__srv', (b) => JSON.stringify(server(user, b)));
  await page.goto(`http://localhost:${PORT}/__test.html`);
  await page.evaluate((user) => {
    window.$ = (id) => document.getElementById(id);
    window.esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
    window.RAR = [{k:'C',cls:'c'},{k:'R',cls:'r'},{k:'E',cls:'e'},{k:'L',cls:'l'}]; window.ri = (k) => Math.max(0, ['C','R','E','L'].indexOf(k));
    window.cards = Array.from({ length: 8 }, (_, i) => ({ id: 'c' + i, t: 'Carte ' + i, r: ['C','R','E','L'][i % 4], img: null }));
    window.cardById = (id) => cards.filter((c) => c.id === id)[0] || null;
    window.HEROES = [{ id:'pionnier', name:'Pionnier', image:'' }, { id:'egide', name:'Égide', image:'' }]; window.heroById = (id) => HEROES.filter((h) => h.id === id)[0] || null;
    window.toast = (m) => { (window.__toasts = window.__toasts || []).push(m); }; window.loadHeroes = () => {};
    window.DECK_SIZE = 20; window.myDecks = [{ id:'d1', name:'Mon deck', cards: Array(20).fill('x') }];
    window.U = { id: user }; window.myFriends = [{ otherId: user === 'A' ? 'B' : 'A', otherName: user === 'A' ? 'Bob' : 'Alice' }];
    window.sb = { functions: { invoke: async (n, o) => ({ data: JSON.parse(await window.__srv(o.body)) }) } };
    window.confirm = () => true;
  }, user);
  await page.addScriptTag({ path: root + 'js/battle-art.js' }); await page.addScriptTag({ path: root + 'js/battle.js' }); await page.addScriptTag({ path: root + 'js/duel.js' });
  await page.evaluate(() => btRefreshMenu());
  return page;
}
const A = await mkPage('A', 1280, 900), B = await mkPage('B', 390, 900);
await A.screenshot({ path: '/tmp/bt/pvp-menu.png' });
// A crée un duel avec code
await A.click('#dl-create'); await A.waitForSelector('#dl-code');
await A.screenshot({ path: '/tmp/bt/pvp-lobby.png' });
// B rejoint par code (minuscules acceptées)
await B.fill('#dl-code-in', 'k7p2qx'); await B.click('#dl-join');
await B.waitForSelector('.bt-offers .bt-off'); await A.waitForSelector('.bt-offers .bt-off', { timeout: 8000 });
const heroA = await A.textContent('.bt-side-me .bt-hname'), heroB = await B.textContent('.bt-side-me .bt-hname');
console.log('héros A/B (doivent différer, chacun se voit en bas):', heroA, '|', heroB);
await A.waitForTimeout(900);
// chacun achète
for (const p of [A, B]) { for (let k = 0; k < 2; k++) { const offs = await p.$$('.bt-off:not(.bt-off-no)'); if (!offs.length) break; await offs[0].click(); const c = await p.$('.bt-board-me .bt-cell:not(.full):not(.blocked)'); if (!c) break; await c.click(); await p.waitForTimeout(150); } }
// A prêt -> attend
await A.click('#bt-ready'); await A.waitForSelector('.bt-wait', { timeout: 5000 });
await B.waitForSelector('.bt-opp.on', { timeout: 6000 });
await A.screenshot({ path: '/tmp/bt/pvp-wait-A.png' }); await B.screenshot({ path: '/tmp/bt/pvp-oppready-B.png' });
// B prêt -> les deux voient le combat
await B.click('#bt-ready');
await B.waitForSelector('#bt-skip', { timeout: 5000 }); await A.waitForSelector('#bt-skip', { timeout: 8000 });
await A.waitForTimeout(800); await A.screenshot({ path: '/tmp/bt/pvp-combat-A.png' }); await B.screenshot({ path: '/tmp/bt/pvp-combat-B.png' });
const bannerSeen = {};
for (const [n, p] of [['A', A], ['B', B]]) { await p.click('#bt-skip'); await p.waitForSelector('#bt-banner:not([hidden])'); bannerSeen[n] = await p.textContent('#bt-banner b'); }
console.log('bannières (une gagnée/une perdue, ou égalité):', bannerSeen);
// jouer jusqu'à la fin, A et B cliquent prêt à tour de rôle
for (let g = 0; g < 40 && !(await A.$('.bt-over') && await B.$('.bt-over')); g++) {
  for (const p of [A, B]) { if (await p.$('.bt-over')) continue; await p.waitForSelector('#bt-ready, .bt-over, .bt-wait', { timeout: 15000 }).catch(() => {}); if (await p.$('#bt-ready')) await p.click('#bt-ready'); }
  for (const p of [A, B]) { await p.waitForSelector('#bt-skip, .bt-over', { timeout: 15000 }).catch(() => {}); if (await p.$('#bt-skip')) await p.click('#bt-skip'); }
  await A.waitForTimeout(900);
}
await A.waitForSelector('.bt-over', { timeout: 15000 }); await B.waitForSelector('.bt-over', { timeout: 15000 });
const tA = await A.textContent('.bt-over h2'), tB = await B.textContent('.bt-over h2');
await A.screenshot({ path: '/tmp/bt/pvp-over-A.png' }); await B.screenshot({ path: '/tmp/bt/pvp-over-B.png' });
console.log('fin:', tA, '|', tB, '| erreurs', A.errors, B.errors, '| toasts', await A.evaluate(() => window.__toasts), await B.evaluate(() => window.__toasts));
// invitation d'ami + refus
await A.click('#bt-back'); await B.click('#bt-back'); await A.waitForSelector('#dl-form:not([hidden])');
await A.selectOption('#dl-friend', 'B'); await A.click('#dl-invite'); await A.waitForSelector('.dl-wait');
await B.evaluate(() => dlInvitesRefresh()); await B.waitForSelector('[data-dl-accept]'); await B.screenshot({ path: '/tmp/bt/pvp-invite-B.png' });
await B.click('[data-dl-accept]'); await B.waitForSelector('.bt-offers .bt-off'); await A.waitForSelector('.bt-offers .bt-off', { timeout: 8000 });
console.log('invitation ami OK');
await browser.close(); srv.close();
