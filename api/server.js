/* API Les 21 Défis — Node 22+, aucune dépendance (node:http, node:sqlite, node:crypto).
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
const SESSION_DAYS = 30;
const PROVINCES = ['Kinshasa','Kongo Central','Kwango','Kwilu','Mai-Ndombe','Équateur','Tshuapa','Mongala','Nord-Ubangi','Sud-Ubangi','Haut-Uélé','Bas-Uélé','Ituri','Tshopo','Haut-Lomami','Haut-Katanga','Lualaba','Tanganyika','Maniema','Nord-Kivu','Sud-Kivu','Kasaï','Kasaï Central','Kasaï Oriental','Lomami','Sankuru'];
const GRADES = ['membre', 'depute', 'coordinateur', 'candidat']; // candidat = candidat à la présidentielle
const CATEGORIES = ['actualite', 'politique', 'visite', 'evenement'];
const DEFIS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'private', 'defis.json'), 'utf8'));

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS membres(
  id INTEGER PRIMARY KEY AUTOINCREMENT, numero INTEGER UNIQUE,
  prenom TEXT NOT NULL, nom TEXT NOT NULL, email TEXT NOT NULL UNIQUE, telephone TEXT,
  pays TEXT, ville TEXT, province TEXT, type TEXT NOT NULL DEFAULT 'membre', message TEXT,
  mot_de_passe TEXT NOT NULL, grade TEXT NOT NULL DEFAULT 'membre', bio TEXT, photo TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente', cree_le TEXT NOT NULL, valide_le TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, numero INTEGER NOT NULL, expire TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS suivis(membre INTEGER NOT NULL, depute INTEGER NOT NULL, cree_le TEXT NOT NULL, PRIMARY KEY(membre, depute));
CREATE TABLE IF NOT EXISTS candidatures(
  id INTEGER PRIMARY KEY AUTOINCREMENT, numero INTEGER NOT NULL, province TEXT NOT NULL,
  circonscription TEXT, profession TEXT, motivation TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente', cree_le TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS articles(
  id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT NOT NULL, categorie TEXT NOT NULL, resume TEXT, contenu TEXT NOT NULL,
  image TEXT, publie INTEGER NOT NULL DEFAULT 0, publie_le TEXT, cree_le TEXT NOT NULL);
`);

const clean = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const now = () => new Date().toISOString();
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const hits = new Map();
function limited(ip, max = 30) {
  const k = ip + ':' + Math.floor(Date.now() / 60000), c = (hits.get(k) || 0) + 1;
  hits.set(k, c); if (hits.size > 5000) hits.clear(); return c > max;
}
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function hashPw(pw) { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + crypto.scryptSync(pw, s, 64).toString('hex'); }
function checkPw(pw, stored) { const [s, h] = stored.split(':'); return same(crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64).toString('hex'), h); }
const okImage = u => !u || /^https:\/\/\S+$/.test(u) || /^public\/images\/[\w\-./]+$/.test(u);

function send(res, code, obj, extra = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise((ok, ko) => {
    let s = ''; req.on('data', d => { s += d; if (s.length > 60000) { ko(new Error('trop gros')); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ko(new Error('JSON invalide')); } });
  });
}
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(c => c[0]));
function cookieHdr(req, token, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return { 'Set-Cookie': `defis_sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}` };
}
function startSession(req, res, numero, code, payload) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token,numero,expire) VALUES(?,?,?)').run(hash(token), numero, new Date(Date.now() + SESSION_DAYS * 864e5).toISOString());
  send(res, code, payload, cookieHdr(req, token, SESSION_DAYS * 86400));
}
function user(req) {
  const t = cookies(req).defis_sid; if (!t) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(hash(t));
  if (!s || s.expire < now()) return null;
  return db.prepare('SELECT * FROM membres WHERE numero=?').get(s.numero) || null;
}
const isAdmin = req => { const t = req.headers['x-admin-token']; return !!ADMIN_TOKEN && typeof t === 'string' && same(t, ADMIN_TOKEN); };

const followers = n => db.prepare('SELECT COUNT(*) c FROM suivis WHERE depute=?').get(n).c;
const publicDepute = m => ({ numero: m.numero, prenom: m.prenom, nom: m.nom, province: m.province, grade: m.grade, bio: m.bio, photo: m.photo, abonnes: followers(m.numero) });
function stats(province) {
  const rows = db.prepare(`SELECT province, COUNT(*) membres, SUM(grade!='membre') deputes FROM membres WHERE statut='valide' GROUP BY province`).all();
  const by = Object.fromEntries(rows.map(r => [r.province, r]));
  const provinces = PROVINCES.map(p => ({ province: p, membres: by[p]?.membres || 0, deputes: by[p]?.deputes || 0 }));
  const total = { membres: provinces.reduce((a, p) => a + p.membres, 0), deputes: provinces.reduce((a, p) => a + p.deputes, 0) };
  const hors = db.prepare(`SELECT COUNT(*) c FROM membres WHERE statut='valide' AND (province IS NULL OR province='')`).get().c;
  total.membres += hors;
  return province ? provinces.find(p => p.province === province) : { ...total, provinces };
}
const moi = m => ({ numero: m.numero, prenom: m.prenom, nom: m.nom, email: m.email, type: m.type, province: m.province, statut: m.statut, grade: m.grade, bio: m.bio, photo: m.photo, cree_le: m.cree_le, valide_le: m.valide_le });

const routes = {
  /* ---------- Public ---------- */
  'GET /api/stats': async (req, res) => send(res, 200, stats()),
  'GET /api/chemin': async (req, res) => send(res, 200, DEFIS.chemin),
  'GET /api/deputes': async (req, res, d, url) => {
    const p = url.searchParams.get('province');
    const rows = db.prepare(`SELECT * FROM membres WHERE statut='valide' AND grade!='membre' ${p ? 'AND province=?' : ''} ORDER BY CASE grade WHEN 'candidat' THEN 0 WHEN 'coordinateur' THEN 1 ELSE 2 END, province, nom`).all(...(p ? [p] : []));
    send(res, 200, rows.map(publicDepute));
  },
  'GET /api/articles': async (req, res, d, url) => {
    const c = url.searchParams.get('cat'), lim = Math.min(+url.searchParams.get('limit') || 30, 100);
    const rows = db.prepare(`SELECT id,titre,categorie,resume,image,publie_le FROM articles WHERE publie=1 ${CATEGORIES.includes(c) ? 'AND categorie=?' : ''} ORDER BY publie_le DESC LIMIT ?`).all(...(CATEGORIES.includes(c) ? [c, lim] : [lim]));
    send(res, 200, rows);
  },
  'GET /api/article': async (req, res, d, url) => {
    const a = db.prepare('SELECT id,titre,categorie,resume,contenu,image,publie_le FROM articles WHERE id=? AND publie=1').get(+url.searchParams.get('id') || 0);
    a ? send(res, 200, a) : send(res, 404, { error: 'Article introuvable' });
  },
  /* ---------- Compte ---------- */
  'POST /api/adhesion': async (req, res, d) => {
    const m = { prenom: clean(d.prenom, 80), nom: clean(d.nom, 80), email: clean(d.email, 160).toLowerCase(), telephone: clean(d.telephone, 40),
      pays: clean(d.pays, 80), ville: clean(d.ville, 80), province: PROVINCES.includes(d.province) ? d.province : '', type: ['membre', 'sympathisant', 'benevole'].includes(d.type) ? d.type : 'membre', message: clean(d.message, 1500) };
    if (!m.prenom || !m.nom || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.email)) return send(res, 400, { error: 'Prénom, nom et e-mail valides requis.' });
    if (typeof d.mot_de_passe !== 'string' || d.mot_de_passe.length < 8) return send(res, 400, { error: 'Mot de passe : 8 caractères minimum.' });
    if (!d.charte || !d.rgpd) return send(res, 400, { error: 'Vous devez accepter la charte et le traitement des données.' });
    if (db.prepare('SELECT 1 FROM membres WHERE email=?').get(m.email)) return send(res, 409, { error: 'Cet e-mail est déjà inscrit. Connectez-vous depuis « Espace membre ».' });
    const r = db.prepare('INSERT INTO membres(prenom,nom,email,telephone,pays,ville,province,type,message,mot_de_passe,cree_le) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(m.prenom, m.nom, m.email, m.telephone, m.pays, m.ville, m.province, m.type, m.message, hashPw(d.mot_de_passe), now());
    const n = FIRST_NUMBER + Number(r.lastInsertRowid) - 1;
    db.prepare('UPDATE membres SET numero=? WHERE id=?').run(n, r.lastInsertRowid);
    startSession(req, res, n, 201, { numero: n, statut: 'en_attente' });
  },
  'POST /api/login': async (req, res, d) => {
    const id = clean(d.identifiant, 160).toLowerCase();
    const m = db.prepare('SELECT * FROM membres WHERE email=? OR numero=?').get(id, /^\d+$/.test(id) ? +id : -1);
    if (!m || typeof d.mot_de_passe !== 'string' || !checkPw(d.mot_de_passe, m.mot_de_passe)) return send(res, 401, { error: 'Identifiant ou mot de passe incorrect.' });
    startSession(req, res, m.numero, 200, { ok: true });
  },
  'POST /api/logout': async (req, res) => {
    const t = cookies(req).defis_sid; if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(hash(t));
    send(res, 200, { ok: true }, cookieHdr(req, '', 0));
  },
  /* ---------- Espace membre ---------- */
  'GET /api/moi': async (req, res) => {
    const m = user(req); if (!m) return send(res, 401, { error: 'Non connecté' });
    const suivis = db.prepare('SELECT m.* FROM suivis s JOIN membres m ON m.numero=s.depute WHERE s.membre=?').all(m.numero).map(publicDepute);
    const candidature = db.prepare('SELECT province,circonscription,statut,cree_le FROM candidatures WHERE numero=? ORDER BY id DESC LIMIT 1').get(m.numero) || null;
    send(res, 200, { membre: moi(m), suivis, candidature, stats: stats(), ma_province: m.province ? stats(m.province) : null,
      deputes_province: m.province ? db.prepare(`SELECT * FROM membres WHERE statut='valide' AND grade!='membre' AND province=?`).all(m.province).map(publicDepute) : [],
      abonnes: m.grade !== 'membre' ? followers(m.numero) : null });
  },
  'GET /api/defis': async (req, res) => {
    const m = user(req); if (!m) return send(res, 401, { error: 'Connexion requise' });
    if (m.statut !== 'valide') return send(res, 403, { error: 'Les 21 défis sont réservés aux membres dont l’adhésion est validée.' });
    send(res, 200, DEFIS);
  },
  'POST /api/suivre': async (req, res, d) => {
    const m = user(req); if (!m) return send(res, 401, { error: 'Connexion requise' });
    if (m.statut !== 'valide') return send(res, 403, { error: 'Adhésion non encore validée.' });
    const dep = db.prepare(`SELECT numero FROM membres WHERE numero=? AND statut='valide' AND grade!='membre'`).get(+d.numero || 0);
    if (!dep) return send(res, 404, { error: 'Député introuvable.' });
    if (dep.numero === m.numero) return send(res, 400, { error: 'Vous ne pouvez pas vous suivre vous-même.' });
    if (d.suivre === false) db.prepare('DELETE FROM suivis WHERE membre=? AND depute=?').run(m.numero, dep.numero);
    else db.prepare('INSERT OR IGNORE INTO suivis(membre,depute,cree_le) VALUES(?,?,?)').run(m.numero, dep.numero, now());
    send(res, 200, { abonnes: followers(dep.numero) });
  },
  'POST /api/moi/profil': async (req, res, d) => {
    const m = user(req); if (!m) return send(res, 401, { error: 'Non connecté' });
    if (m.grade === 'membre') return send(res, 403, { error: 'Réservé aux députés et responsables.' });
    const photo = clean(d.photo, 300); if (!okImage(photo)) return send(res, 400, { error: 'Photo : lien https:// requis.' });
    db.prepare('UPDATE membres SET bio=?, photo=? WHERE numero=?').run(clean(d.bio, 1200), photo, m.numero); send(res, 200, { ok: true });
  },
  'POST /api/candidature': async (req, res, d) => {
    const m = user(req); if (!m) return send(res, 401, { error: 'Non connecté' });
    if (m.statut !== 'valide') return send(res, 403, { error: 'Votre adhésion doit d’abord être validée pour déposer une candidature.' });
    const c = { province: PROVINCES.includes(d.province) ? d.province : '', circonscription: clean(d.circonscription, 120), profession: clean(d.profession, 120), motivation: clean(d.motivation, 3000) };
    if (!c.province || c.motivation.length < 30) return send(res, 400, { error: 'Province et motivation (30 caractères minimum) requises.' });
    if (db.prepare("SELECT 1 FROM candidatures WHERE numero=? AND statut IN ('en_attente','retenue')").get(m.numero)) return send(res, 409, { error: 'Vous avez déjà une candidature en cours.' });
    db.prepare('INSERT INTO candidatures(numero,province,circonscription,profession,motivation,cree_le) VALUES(?,?,?,?,?,?)').run(m.numero, c.province, c.circonscription, c.profession, c.motivation, now());
    send(res, 201, { ok: true });
  },
  /* ---------- Administration ---------- */
  'GET /api/admin/membres': async (req, res) => send(res, 200, db.prepare('SELECT id,numero,prenom,nom,email,telephone,pays,ville,province,type,grade,statut,cree_le FROM membres ORDER BY id DESC LIMIT 5000').all()),
  'GET /api/admin/candidatures': async (req, res) => send(res, 200, db.prepare(
    'SELECT c.*, m.prenom, m.nom, m.email, m.telephone FROM candidatures c JOIN membres m ON m.numero=c.numero ORDER BY c.id DESC LIMIT 2000').all()),
  'POST /api/admin/membre': async (req, res, d) => {
    if (!['valide', 'refuse', 'en_attente'].includes(d.statut)) return send(res, 400, { error: 'Statut invalide' });
    db.prepare('UPDATE membres SET statut=?, valide_le=? WHERE numero=?').run(d.statut, d.statut === 'valide' ? now() : null, +d.numero);
    send(res, 200, { ok: true });
  },
  'POST /api/admin/grade': async (req, res, d) => {
    if (!GRADES.includes(d.grade)) return send(res, 400, { error: 'Grade invalide' });
    const province = PROVINCES.includes(d.province) ? d.province : null;
    db.prepare('UPDATE membres SET grade=?, province=COALESCE(?, province) WHERE numero=?').run(d.grade, province, +d.numero); send(res, 200, { ok: true });
  },
  'POST /api/admin/candidature': async (req, res, d) => {
    if (!['retenue', 'refusee', 'en_attente'].includes(d.statut)) return send(res, 400, { error: 'Statut invalide' });
    const c = db.prepare('SELECT * FROM candidatures WHERE id=?').get(+d.id); if (!c) return send(res, 404, { error: 'Introuvable' });
    db.prepare('UPDATE candidatures SET statut=? WHERE id=?').run(d.statut, c.id);
    if (d.statut === 'retenue') // le député représente automatiquement sa province
      db.prepare("UPDATE membres SET grade=CASE WHEN grade='membre' THEN 'depute' ELSE grade END, province=? WHERE numero=?").run(c.province, c.numero);
    send(res, 200, { ok: true });
  },
  'GET /api/admin/articles': async (req, res) => send(res, 200, db.prepare('SELECT * FROM articles ORDER BY id DESC LIMIT 500').all()),
  'POST /api/admin/article': async (req, res, d) => {
    const a = { titre: clean(d.titre, 200), categorie: CATEGORIES.includes(d.categorie) ? d.categorie : 'actualite', resume: clean(d.resume, 400), contenu: clean(d.contenu, 40000), image: clean(d.image, 300), publie: d.publie ? 1 : 0 };
    if (!a.titre || !a.contenu) return send(res, 400, { error: 'Titre et contenu requis.' });
    if (!okImage(a.image)) return send(res, 400, { error: 'Image : lien https:// ou public/images/…' });
    if (d.id) {
      const old = db.prepare('SELECT publie_le FROM articles WHERE id=?').get(+d.id); if (!old) return send(res, 404, { error: 'Introuvable' });
      db.prepare('UPDATE articles SET titre=?,categorie=?,resume=?,contenu=?,image=?,publie=?,publie_le=? WHERE id=?').run(a.titre, a.categorie, a.resume, a.contenu, a.image, a.publie, a.publie ? (old.publie_le || now()) : old.publie_le, +d.id);
    } else db.prepare('INSERT INTO articles(titre,categorie,resume,contenu,image,publie,publie_le,cree_le) VALUES(?,?,?,?,?,?,?,?)').run(a.titre, a.categorie, a.resume, a.contenu, a.image, a.publie, a.publie ? now() : null, now());
    send(res, 200, { ok: true });
  },
  'POST /api/admin/article/supprimer': async (req, res, d) => { db.prepare('DELETE FROM articles WHERE id=?').run(+d.id); send(res, 200, { ok: true }); }
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), key = req.method + ' ' + url.pathname, ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const h = routes[key];
    if (!h) return send(res, 404, { error: 'Introuvable' });
    if (url.pathname.startsWith('/api/admin') && !isAdmin(req)) return send(res, 401, { error: 'Accès refusé' });
    if (req.method === 'POST') {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'JSON requis' });
      if (limited(ip)) return send(res, 429, { error: 'Trop de requêtes, réessayez dans une minute.' });
    }
    await h(req, res, req.method === 'POST' ? await body(req) : null, url);
  } catch (e) { console.error(e); send(res, 500, { error: 'Erreur serveur' }); }
}).listen(PORT, '127.0.0.1', () => console.log('21 Défis API sur 127.0.0.1:' + PORT));
