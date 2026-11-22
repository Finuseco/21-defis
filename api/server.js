/* API 21 Défis — Node 22+, aucune dépendance (node:http + node:sqlite).
   Variables : PORT (8096), DB_PATH (data/membres.sqlite), ADMIN_TOKEN (obligatoire pour /api/admin). */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = +process.env.PORT || 8096;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'membres.sqlite');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const FIRST_NUMBER = 10000; // 1er membre = 10000 (5 chiffres) ; passe à 6 chiffres après 99 999.

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS membres(
  id INTEGER PRIMARY KEY AUTOINCREMENT, numero INTEGER UNIQUE,
  prenom TEXT NOT NULL, nom TEXT NOT NULL, email TEXT NOT NULL UNIQUE, telephone TEXT,
  pays TEXT, ville TEXT, province TEXT, type TEXT NOT NULL DEFAULT 'membre', message TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente', cree_le TEXT NOT NULL, valide_le TEXT);
CREATE TABLE IF NOT EXISTS candidatures(
  id INTEGER PRIMARY KEY AUTOINCREMENT, numero INTEGER NOT NULL, province TEXT NOT NULL,
  circonscription TEXT, profession TEXT, motivation TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente', cree_le TEXT NOT NULL);
`);

const TYPES = ['membre', 'sympathisant', 'benevole'];
const clean = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const now = () => new Date().toISOString();
const numero = id => FIRST_NUMBER + id - 1;
const hits = new Map(); // limitation simple par IP
function limited(ip, max = 20) {
  const k = ip + ':' + Math.floor(Date.now() / 60000), c = (hits.get(k) || 0) + 1;
  hits.set(k, c); if (hits.size > 5000) hits.clear(); return c > max;
}
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise((ok, ko) => {
    let s = ''; req.on('data', d => { s += d; if (s.length > 20000) { ko(new Error('trop gros')); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ko(new Error('JSON invalide')); } });
  });
}
const publicMember = m => ({ numero: m.numero, prenom: m.prenom, nom: m.nom, type: m.type, province: m.province, statut: m.statut, cree_le: m.cree_le, valide_le: m.valide_le });
function isAdmin(req) { const t = req.headers['x-admin-token']; return !!ADMIN_TOKEN && typeof t === 'string' && same(t, ADMIN_TOKEN); }

const routes = {
  'POST /api/adhesion': async (req, res, d) => {
    const m = { prenom: clean(d.prenom, 80), nom: clean(d.nom, 80), email: clean(d.email, 160).toLowerCase(), telephone: clean(d.telephone, 40),
      pays: clean(d.pays, 80), ville: clean(d.ville, 80), province: clean(d.province, 60), type: TYPES.includes(d.type) ? d.type : 'membre', message: clean(d.message, 1500) };
    if (!m.prenom || !m.nom || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.email)) return send(res, 400, { error: 'Prénom, nom et e-mail valides requis.' });
    if (!d.charte || !d.rgpd) return send(res, 400, { error: 'Vous devez accepter la charte et le traitement des données.' });
    if (db.prepare('SELECT 1 FROM membres WHERE email=?').get(m.email)) return send(res, 409, { error: 'Cet e-mail est déjà inscrit. Utilisez « Ma carte » avec votre numéro.' });
    const r = db.prepare('INSERT INTO membres(prenom,nom,email,telephone,pays,ville,province,type,message,cree_le) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(m.prenom, m.nom, m.email, m.telephone, m.pays, m.ville, m.province, m.type, m.message, now());
    const n = numero(Number(r.lastInsertRowid));
    db.prepare('UPDATE membres SET numero=? WHERE id=?').run(n, r.lastInsertRowid);
    send(res, 201, { numero: n, statut: 'en_attente' });
  },
  'POST /api/carte': async (req, res, d) => {
    const m = db.prepare('SELECT * FROM membres WHERE numero=? AND email=?').get(+d.numero || 0, clean(d.email, 160).toLowerCase());
    if (!m) return send(res, 404, { error: 'Aucun membre avec ce numéro et cet e-mail.' });
    send(res, 200, publicMember(m));
  },
  'POST /api/depute': async (req, res, d) => {
    const m = db.prepare('SELECT * FROM membres WHERE numero=? AND email=?').get(+d.numero || 0, clean(d.email, 160).toLowerCase());
    if (!m) return send(res, 404, { error: 'Numéro de membre ou e-mail incorrect.' });
    if (m.statut !== 'valide') return send(res, 403, { error: 'Votre adhésion doit d’abord être validée pour déposer une candidature.' });
    const c = { province: clean(d.province, 60), circonscription: clean(d.circonscription, 120), profession: clean(d.profession, 120), motivation: clean(d.motivation, 3000) };
    if (!c.province || c.motivation.length < 30) return send(res, 400, { error: 'Province et motivation (30 caractères minimum) requises.' });
    if (db.prepare("SELECT 1 FROM candidatures WHERE numero=? AND statut IN ('en_attente','retenue')").get(m.numero)) return send(res, 409, { error: 'Vous avez déjà une candidature en cours.' });
    db.prepare('INSERT INTO candidatures(numero,province,circonscription,profession,motivation,cree_le) VALUES(?,?,?,?,?,?)').run(m.numero, c.province, c.circonscription, c.profession, c.motivation, now());
    send(res, 201, { ok: true });
  },
  'GET /api/stats': async (req, res) => {
    const r = db.prepare("SELECT COUNT(*) total, SUM(statut='valide') valides FROM membres").get();
    send(res, 200, { membres: r.valides || 0, total: r.total });
  },
  'GET /api/admin/membres': async (req, res) => send(res, 200, db.prepare('SELECT * FROM membres ORDER BY id DESC LIMIT 2000').all()),
  'GET /api/admin/candidatures': async (req, res) => send(res, 200, db.prepare(
    'SELECT c.*, m.prenom, m.nom, m.email, m.telephone FROM candidatures c JOIN membres m ON m.numero=c.numero ORDER BY c.id DESC LIMIT 2000').all()),
  'POST /api/admin/membre': async (req, res, d) => {
    if (!['valide', 'refuse', 'en_attente'].includes(d.statut)) return send(res, 400, { error: 'Statut invalide' });
    db.prepare('UPDATE membres SET statut=?, valide_le=? WHERE numero=?').run(d.statut, d.statut === 'valide' ? now() : null, +d.numero);
    send(res, 200, { ok: true });
  },
  'POST /api/admin/candidature': async (req, res, d) => {
    if (!['retenue', 'refusee', 'en_attente'].includes(d.statut)) return send(res, 400, { error: 'Statut invalide' });
    db.prepare('UPDATE candidatures SET statut=? WHERE id=?').run(d.statut, +d.id); send(res, 200, { ok: true });
  }
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), key = req.method + ' ' + url.pathname, ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const h = routes[key];
    if (!h) return send(res, 404, { error: 'Introuvable' });
    if (url.pathname.startsWith('/api/admin') && !isAdmin(req)) return send(res, 401, { error: 'Accès refusé' });
    if (req.method === 'POST' && limited(ip)) return send(res, 429, { error: 'Trop de requêtes, réessayez dans une minute.' });
    await h(req, res, req.method === 'POST' ? await body(req) : null);
  } catch (e) { console.error(e); send(res, 500, { error: 'Erreur serveur' }); }
}).listen(PORT, '127.0.0.1', () => console.log('21 Défis API sur 127.0.0.1:' + PORT));
