'use strict';
/* Configuration, constantes, état global, utilitaires */


var SUPABASE_URL = window.APP_CONFIG.SUPABASE_URL;
var SUPABASE_KEY = window.APP_CONFIG.SUPABASE_KEY;

var MAX = 10, INTERVAL = 10*60*1000, PACK_SIZE = 5;
var $ = function(id){ return document.getElementById(id); };

var RAR = [
  {k:'C',  cls:'c',  name:'Commune',       w:73, svg: `<svg width="24" height="24" viewBox="0 -2 48 48" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;height:1.2em;width:auto;margin-top:-2px"><g transform="translate(0 -1)"><circle cx="24" cy="24" r="14" fill="url(#face_c)" stroke="url(#rim_c)" stroke-width="3"/><circle cx="24" cy="24" r="9" fill="none" stroke="#fff" stroke-opacity=".3"/><path d="M24 17.5 28.5 24 24 30.5 19.5 24Z" fill="#f1f2f5"/></g></svg>`},
  {k:'R',  cls:'r',  name:'Rare',          w:23, svg: `<svg width="24" height="24" viewBox="0 -2 48 48" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;height:1.2em;width:auto;margin-top:-2px"><path d="M24 5 38 10.5V23c0 9-6.5 15.5-14 19-7.5-3.5-14-10-14-19V10.5Z" fill="url(#face_r)" stroke="url(#rim_r)" stroke-width="2.6" stroke-linejoin="round"/><path d="M24 9.5 34 13.5V23c0 6.6-4.5 11.6-10 14.5-5.5-2.9-10-7.9-10-14.5v-9.5Z" fill="none" stroke="#fff" stroke-opacity=".25"/><path d="M24 14.5 31 23.5 24 32.5 17 23.5Z" fill="url(#gem_r)" stroke="#fff" stroke-opacity=".8"/><path d="M17 23.5H31M24 14.5V32.5" stroke="#fff" stroke-opacity=".35" stroke-width=".7"/></svg>`},
  {k:'E',  cls:'e',  name:'Épique',        w:3.6, svg: `<svg width="24" height="24" viewBox="0 -2 48 48" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;height:1.2em;width:auto;margin-top:-2px"><g fill="url(#gold_e)" stroke="#5c3b00" stroke-width=".6" stroke-linejoin="round"><path d="M13.5 17C8 16 4.5 12.5 3.5 7.5 7 10.5 10.5 12 14 12.5ZM13 24C7.5 24 4 21 2.5 16.5 6 19 9.5 20 13.5 20Z"/><path d="M13.5 17C8 16 4.5 12.5 3.5 7.5 7 10.5 10.5 12 14 12.5ZM13 24C7.5 24 4 21 2.5 16.5 6 19 9.5 20 13.5 20Z" transform="matrix(-1 0 0 1 48 0)"/><path d="M16.5 12 17.5 4.5 21 8.5 24 2.5 27 8.5 30.5 4.5 31.5 12Z"/></g><path d="M13 12H35L37 27.5 24 41 11 27.5Z" fill="url(#face_e)" stroke="url(#gold_e)" stroke-width="2.6" stroke-linejoin="round"/><path d="M24 16.5 31 25 24 33.5 17 25Z" fill="url(#gem_e)" stroke="#fff" stroke-opacity=".85"/><path d="M17 25H31M24 16.5V33.5M20.5 20.75 27.5 29.25M27.5 20.75 20.5 29.25" stroke="#fff" stroke-opacity=".3" stroke-width=".6"/></svg>`},
  {k:'L',  cls:'l',  name:'Légendaire',    w:0.4, svg: `<svg width="24" height="24" viewBox="0 -2 48 48" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;height:1.2em;width:auto;margin-top:-2px"><g fill="url(#gold_l)" stroke="#5c3b00" stroke-width=".6" stroke-linejoin="round"><path d="M14.5 16.5C8 15 3 9.5 1.5 2 6.5 7 11 9.5 16 10.5ZM13.5 23C6.5 23 1.5 18.5 0 12.5 4.5 16 9 17.5 14 17.5ZM13.5 29.5C7.5 30 2.5 27 .5 22 5 24.5 9 25 13.5 24.5ZM15 35C10 36.5 5.5 35 3 31.5 7 32.5 10.5 32 14 31Z"/><path d="M14.5 16.5C8 15 3 9.5 1.5 2 6.5 7 11 9.5 16 10.5ZM13.5 23C6.5 23 1.5 18.5 0 12.5 4.5 16 9 17.5 14 17.5ZM13.5 29.5C7.5 30 2.5 27 .5 22 5 24.5 9 25 13.5 24.5ZM15 35C10 36.5 5.5 35 3 31.5 7 32.5 10.5 32 14 31Z" transform="matrix(-1 0 0 1 48 0)"/><path d="M15.5 11 16.5 1.5 20.5 6.5 24 0 27.5 6.5 31.5 1.5 32.5 11Z"/></g><circle cx="16.5" cy="1.5" r="1.2" fill="#ff5c8a"/><circle cx="24" cy=".3" r="1.4" fill="#5cc8ff"/><circle cx="31.5" cy="1.5" r="1.2" fill="#5cf29a"/><path d="M24 8 35.5 13.5 37.5 27 24 43 10.5 27 12.5 13.5Z" fill="url(#face_l)" stroke="url(#prism_l)" stroke-width="2.8" stroke-linejoin="round"/><path d="M24 12 32.5 16 34 26.5 24 38.5 14 26.5 15.5 16Z" fill="none" stroke="url(#gold_l)" stroke-width=".9"/><path d="M24 16.5 25.9 21.9 31.1 22.2 27 25.6 28.4 31.1 24 28 19.6 31.1 21 25.6 16.9 22.2 22.1 21.9Z" fill="url(#prism_l)" stroke="#fff" stroke-width=".8" stroke-linejoin="round"/></svg>`}
];
function ri(k){ for (var i=0;i<RAR.length;i++) if (RAR[i].k===k) return i; return 0; }

/* ---------- état ---------- */
var sb = null, U = null;
var P = {username:'', is_admin:false, is_owner:false, tokens:0, inventory:{}};
var cards = [], col = {}, members = [];
var SRV = {packs:0, last:Date.now(), opened:0, off:0};
var lastCardsLoad = 0;
var myFriends = [], myRequests = [];
var myTrades = [], tradeDraft = { targetUser: null, give: [], ask: [], targetCol: {} }, selectMode = null;

var filterCol = 'ALL', filterAll = 'ALL';
var searchCol = '', searchAll = '', sortCol = 'rar_desc', sortAll = 'rar_desc';
var cropper = null;
window.currentCropData = null;

function mapCard(r){ return {id:r.id, t:r.title, r:r.rarity, cat:r.category, d:r.description, img:r.image || null}; }
function allCards(){ return cards; }
function cardById(id){ for (var i=0;i<cards.length;i++) if (cards[i].id===id) return cards[i]; return null; }

function errMsg(e){
  var m = (e && e.message) ? e.message : String(e);
  if (/no_pack/.test(m)) return 'Aucun pack disponible.';
  if (/no_cards/.test(m)) return "Aucune carte dans le jeu pour l'instant.";
  if (/not_authenticated|JWT/i.test(m)) return 'Session expirée : reconnecte-toi.';
  if (/duplicate key/i.test(m)) return 'Une carte porte déjà ce titre.';
  if (/row-level security|permission denied|forbidden/i.test(m)) return 'Action réservée aux admins.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Connexion impossible. Vérifie ta connexion Internet.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail.';
  if (/Password should be/i.test(m)) return 'Le mot de passe doit contenir au moins 6 caractères.';
  return m;
}

function esc(s){ return String(s).replace(/[&<>"']/g,function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }
function hue(c){ var h = 0, s = c.t; for (var i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) % 360; return h; }

