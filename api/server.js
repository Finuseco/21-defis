/* API Les 21 Défis — Node 20+, PostgreSQL.
   Variables d'environnement : voir .env.example */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const env = process.env;
const PORT = +env.PORT || 8096;
const SITE_URL = (env.SITE_URL || 'https://21defis.com').replace(/\/$/, '');
const ADMIN_TOKEN = env.ADMIN_TOKEN || '';
const DATA_KEY = env.DATA_KEY || '';
const DATA_DIR = env.DATA_DIR || path.join(__dirname, '..', 'data');
const CASHPAY_BASE = (env.CASHPAY_BASE || 'https://api.cashpay-all.com').replace(/\/$/, '');
const CASHPAY_API_KEY = env.CASHPAY_API_KEY || '';
const CASHPAY_API_SECRET = env.CASHPAY_API_SECRET || '';
const SMS_SENDER_ID = env.SMS_SENDER_ID || '21Defis';
const SMS_BATCH = +env.SMS_BATCH || 20;      // SMS envoyés par cycle
const EMAIL_BATCH = +env.EMAIL_BATCH || 10;  // e-mails envoyés par cycle (envoi progressif, jamais d'un seul coup)
const WORKER_MS = +env.WORKER_MS || 15000;
const MIN_AGE = +env.MIN_AGE || 18;
const SESSION_DAYS = 30;
if (DATA_KEY.length < 16) { console.error('DATA_KEY (16 caractères minimum) est obligatoire : il protège les numéros de pièce d’identité.'); process.exit(1); }
if (!env.DATABASE_URL && !env.PGHOST && !env.PGDATABASE) { console.error('DATABASE_URL est obligatoire (ex. postgres://user:mdp@localhost:5432/defis).'); process.exit(1); }

const PROVINCES = ['Kinshasa','Kongo Central','Kwango','Kwilu','Mai-Ndombe','Équateur','Tshuapa','Mongala','Nord-Ubangi','Sud-Ubangi','Haut-Uélé','Bas-Uélé','Ituri','Tshopo','Haut-Lomami','Haut-Katanga','Lualaba','Tanganyika','Maniema','Nord-Kivu','Sud-Kivu','Kasaï','Kasaï Central','Kasaï Oriental','Lomami','Sankuru'];
const GRADES = ['membre', 'depute', 'coordinateur', 'candidat'];
const CATEGORIES = ['actualite', 'politique', 'visite', 'evenement'];
const PIECES = ['carte_electeur', 'passeport', 'permis', 'carte_identite'];
const SOURCES = ['abonnes', 'province', 'tous', 'contacts'];
const RESEAUX = ['facebook', 'instagram', 'x', 'tiktok', 'youtube', 'whatsapp', 'linkedin', 'telegram', 'site'];
const DEFIS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'private', 'defis.json'), 'utf8'));

const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
const q = async (text, params = []) => (await pool.query(text, params)).rows;
const q1 = async (text, params = []) => (await q(text, params))[0] || null;
for (const d of ['pieces', 'photos']) fs.mkdirSync(path.join(DATA_DIR, d), { recursive: true, mode: 0o700 });

/* ---------------- Utilitaires ---------------- */
const clean = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const K_ENC = crypto.createHash('sha256').update('enc:' + DATA_KEY).digest();
const K_MAC = crypto.createHash('sha256').update('mac:' + DATA_KEY).digest();
const hmac = s => crypto.createHmac('sha256', K_MAC).update(s).digest('hex');
function encrypt(txt) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', K_ENC, iv); const ct = Buffer.concat([c.update(txt, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64'); }
function decrypt(b64) { const b = Buffer.from(b64, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', K_ENC, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); }
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const scrypt = (pw, salt) => new Promise((ok, ko) => crypto.scrypt(pw, salt, 64, (e, k) => e ? ko(e) : ok(k)));
async function hashPw(pw) { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + (await scrypt(pw, s)).toString('hex'); }
async function checkPw(pw, stored) { const [s, h] = stored.split(':'); return same((await scrypt(pw, Buffer.from(s, 'hex'))).toString('hex'), h); }
const okUrl = u => !u || /^https:\/\/[^\s<>"']+$/.test(u);
const okImage = u => !u || okUrl(u) || /^public\/images\/[\w\-./]+$/.test(u);

function normPhone(p) {
  let d = String(p || '').replace(/[^\d]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 10) d = '243' + d.slice(1); // numéro congolais local
  else if (d.length === 9) d = '243' + d;
  return /^\d{9,15}$/.test(d) ? d : '';
}
const normPiece = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ageOf = iso => { const b = new Date(iso), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };

function sniff(buf) {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (buf.length > 5 && buf.subarray(0, 5).toString() === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  return null;
}
function decodeFile(dataUrl, maxBytes, allowPdf) {
  const m = /^data:[\w/+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) return { error: 'Fichier invalide.' };
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > maxBytes) return { error: `Fichier trop lourd (${Math.round(maxBytes / 1048576)} Mo maximum).` };
  const t = sniff(buf);
  if (!t || (!allowPdf && t.ext === 'pdf')) return { error: allowPdf ? 'Format accepté : JPG, PNG, WEBP ou PDF.' : 'Format accepté : JPG, PNG ou WEBP.' };
  return { buf, ...t };
}

const hits = new Map();
function limited(key, max) { const k = key + ':' + Math.floor(Date.now() / 60000), c = (hits.get(k) || 0) + 1; hits.set(k, c); if (hits.size > 8000) hits.clear(); return c > max; }

function send(res, code, obj, extra = {}) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(obj)); }
function readBody(req, limit) {
  return new Promise((ok, ko) => {
    let s = ''; req.on('data', d => { s += d; if (s.length > limit) { ko(new Error('Requête trop volumineuse.')); req.destroy(); } });
    req.on('end', () => ok(s)); req.on('error', ko);
  });
}
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(c => c[0]));
const cookieHdr = (req, token, maxAge) => ({ 'Set-Cookie': `defis_sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}` });
async function startSession(req, res, membreId, code, payload) {
  const token = crypto.randomBytes(32).toString('hex');
  await q('INSERT INTO sessions(token,membre_id,expire) VALUES($1,$2,now() + interval \'30 days\')', [sha(token), membreId]);
  send(res, code, payload, cookieHdr(req, token, SESSION_DAYS * 86400));
}
async function user(req) {
  const t = cookies(req).defis_sid; if (!t) return null;
  return q1(`SELECT m.* FROM sessions s JOIN membres m ON m.id=s.membre_id WHERE s.token=$1 AND s.expire>now()`, [sha(t)]);
}
const isAdmin = req => { const t = req.headers['x-admin-token']; return !!ADMIN_TOKEN && typeof t === 'string' && same(t, ADMIN_TOKEN); };
const isDepute = m => m && m.statut === 'valide' && m.grade !== 'membre';
const fail = (res, code, error, extra = {}) => send(res, code, { error, ...extra });

/* ---------------- Requêtes partagées ---------------- */
const FOLLOWERS = `(SELECT count(*)::int FROM abonnements a JOIN membres s ON s.id=a.membre_id WHERE a.depute_id=m.id AND s.statut='valide')`;
const PUBLIC_DEPUTE = `m.numero::text AS numero, m.prenom, m.nom, m.postnom, m.grade, m.code_parrainage AS code, d.province, d.type_mandat, d.secteur, d.profession, d.bio, d.slogan, d.couleur, d.couverture, d.reseaux,
  CASE WHEN d.photo_fichier IS NOT NULL THEN '/api/photo?n=' || m.numero ELSE '' END AS photo, ${FOLLOWERS} AS abonnes`;
const deputeRow = r => r && { ...r, numero: +r.numero };
async function stats(province) {
  const rows = await q(`SELECT province, count(*)::int membres, (count(*) FILTER (WHERE grade<>'membre'))::int deputes FROM membres WHERE statut='valide' GROUP BY province`);
  const by = Object.fromEntries(rows.map(r => [r.province, r]));
  const provinces = PROVINCES.map(p => ({ province: p, membres: by[p]?.membres || 0, deputes: by[p]?.deputes || 0 }));
  const total = rows.reduce((a, r) => ({ membres: a.membres + r.membres, deputes: a.deputes + r.deputes }), { membres: 0, deputes: 0 });
  return province ? provinces.find(p => p.province === province) : { ...total, provinces };
}
const moiOut = m => ({ numero: +m.numero, prenom: m.prenom, nom: m.nom, postnom: m.postnom, email: m.email, telephone: m.telephone, type: m.type, province: m.province, region: m.region, statut: m.statut, grade: m.grade,
  age: ageOf(m.date_naissance), accepte_messages: m.accepte_messages, code: m.code_parrainage, cree_le: m.cree_le, valide_le: m.valide_le });

/* ---------------- Audiences de campagne ---------------- */
function audience(canal, sources, deputeId, limite) {
  const parts = [];
  const key = canal === 'sms' ? 'telephone' : 'lower(email)';
  const has = canal === 'sms' ? `telephone <> ''` : `email <> ''`;
  const S = {
    abonnes: `SELECT m.nom || ' ' || m.prenom AS nom, m.telephone, m.email FROM abonnements a JOIN membres m ON m.id=a.membre_id WHERE a.depute_id=$1 AND m.statut='valide' AND m.accepte_messages AND m.id<>$1`,
    province: `SELECT m.nom || ' ' || m.prenom, m.telephone, m.email FROM membres m WHERE m.statut='valide' AND m.accepte_messages AND m.id<>$1 AND m.province=(SELECT province FROM deputes WHERE membre_id=$1)`,
    tous: `SELECT m.nom || ' ' || m.prenom, m.telephone, m.email FROM membres m WHERE m.statut='valide' AND m.accepte_messages AND m.id<>$1`,
    contacts: `SELECT c.nom, COALESCE(c.telephone,''), COALESCE(c.email,'') FROM contacts c WHERE c.depute_id=$1 AND NOT c.desabonne
      AND NOT EXISTS (SELECT 1 FROM membres x WHERE NOT x.accepte_messages AND (x.telephone=c.telephone OR lower(x.email)=lower(c.email)))`
  };
  const chosen = sources.filter(s => SOURCES.includes(s));
  for (const s of chosen) parts.push(S[s]);
  if (!parts.length) return null;
  const union = parts.map(p => `(${p})`).join(' UNION ALL ');
  const base = `SELECT DISTINCT ON (${key}) nom, telephone, email FROM (SELECT nom, telephone, email FROM (${union}) u(nom, telephone, email) WHERE ${has}) w ORDER BY ${key}`;
  return { sql: limite ? `SELECT * FROM (${base}) z LIMIT ${Math.max(0, +limite | 0)}` : base, params: [deputeId] };
}
async function devis(canal, sources, deputeId, limite) {
  const w = await q1('SELECT credits_sms, credits_email, solde_usd::float8 AS solde FROM portefeuilles WHERE membre_id=$1', [deputeId]) || { credits_sms: 0, credits_email: 0, solde: 0 };
  const credits = canal === 'sms' ? w.credits_sms : w.credits_email;
  const par_source = {};
  for (const s of SOURCES.filter(x => sources.includes(x))) {
    const a = audience(canal, [s], deputeId);
    par_source[s] = (await q1(`SELECT count(*)::int n FROM (${a.sql}) t`, a.params)).n;
  }
  const a = audience(canal, sources, deputeId, limite);
  const disponibles = a ? (await q1(`SELECT count(*)::int n FROM (${a.sql}) t`, a.params)).n : 0;
  const prix = +(await q1(`SELECT valeur FROM parametres WHERE cle=$1`, ['prix_' + canal + '_usd'])).valeur;
  return { canal, par_source, disponibles, credits, envoyables: Math.min(credits, disponibles), manque: Math.max(0, disponibles - credits), cout_manque_usd: +(Math.max(0, disponibles - credits) * prix).toFixed(2), solde_usd: w.solde };
}

/* ---------------- Fournisseurs d'envoi ---------------- */
const smsConfigured = () => !!CASHPAY_API_KEY;
const emailConfigured = () => !!(env.SMTP_HOST && env.MAIL_FROM);
async function sendSms(to, text) {
  const r = await fetch(`${CASHPAY_BASE}/api/v1/b2b/sms/send`, { method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${CASHPAY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: '+' + to, message: text, senderId: SMS_SENDER_ID }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error(j.error || j.code || 'SMS refusé (' + r.status + ')');
}
let mailer = null;
async function sendMail(to, subject, text) {
  if (!mailer) {
    const nm = require('nodemailer');
    mailer = nm.createTransport({ host: env.SMTP_HOST, port: +env.SMTP_PORT || 587, secure: env.SMTP_SECURE === 'true', auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined });
  }
  const tok = hmac('unsub:' + to.toLowerCase()), link = `${SITE_URL}/api/desabonner?e=${encodeURIComponent(to)}&t=${tok}`;
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #dde2f2;border-radius:14px;overflow:hidden">
<div style="background:#0b1a52;color:#fff;padding:18px 22px;font-weight:800;font-size:18px">Les 21 Défis — pour un Congo futur et prospère</div>
<div style="height:5px;background:linear-gradient(90deg,#1f3a9c 33%,#f7d618 33% 66%,#ce1126 66%)"></div>
<div style="padding:24px 22px;color:#1c2547;font-size:16px;line-height:1.6">${esc(text).replace(/\n/g, '<br>')}</div>
<div style="padding:14px 22px;background:#f4f6fc;color:#4f5b86;font-size:12px">Vous recevez ce message car vous êtes membre ou contact des 21 Défis. <a href="${link}" style="color:#1f3a9c">Se désabonner</a></div></div>`;
  await mailer.sendMail({ from: env.MAIL_FROM, to, subject, text: text + `\n\nSe désabonner : ${link}`, html, headers: { 'List-Unsubscribe': `<${link}>` } });
}
async function cashpayCheckout(p) {
  const r = await fetch(`${CASHPAY_BASE}/api/v1/b2b/payments/checkout`, { method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${CASHPAY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success || !j.redirectUrl) throw new Error(j.error || 'Paiement indisponible (' + r.status + ')');
  return j;
}

/* ---------------- Worker d'envoi progressif ---------------- */
let busy = false;
async function worker() {
  if (busy) return; busy = true;
  try {
    for (const [canal, batch, ok] of [['sms', SMS_BATCH, smsConfigured()], ['email', EMAIL_BATCH, emailConfigured()]]) {
      if (!ok) continue;
      const rows = await q(`UPDATE campagne_envois SET statut='envoi' WHERE id IN (
        SELECT e.id FROM campagne_envois e JOIN campagnes c ON c.id=e.campagne_id WHERE c.statut='en_cours' AND c.canal=$1 AND e.statut='attente'
        ORDER BY e.id LIMIT $2 FOR UPDATE OF e SKIP LOCKED) RETURNING id, campagne_id, nom, telephone, email`, [canal, batch]);
      const camp = {};
      for (const e of rows) {
        camp[e.campagne_id] ||= await q1(`SELECT c.*, m.prenom, m.nom AS mnom FROM campagnes c JOIN membres m ON m.id=c.depute_id WHERE c.id=$1`, [e.campagne_id]);
        const c = camp[e.campagne_id], sig = c.signature === 'depute' ? `${c.prenom} ${c.mnom}, Les 21 Défis` : 'Les 21 Défis';
        try {
          if (canal === 'sms') await sendSms(e.telephone, `${c.message}\n— ${sig}`);
          else await sendMail(e.email, c.sujet || 'Message des 21 Défis', `${c.message}\n\n— ${sig}`);
          await q(`UPDATE campagne_envois SET statut='envoye', envoye_le=now() WHERE id=$1 RETURNING id`, [e.id]);
          await q(`UPDATE campagnes SET envoyes=envoyes+1 WHERE id=$1 RETURNING id`, [c.id]);
        } catch (err) { await q('SELECT fn_rembourser_envoi($1,$2)', [e.id, err.message]); }
      }
    }
    await q(`UPDATE campagnes SET statut='terminee', fini_le=now() WHERE statut='en_cours' AND NOT EXISTS (SELECT 1 FROM campagne_envois e WHERE e.campagne_id=campagnes.id AND e.statut IN ('attente','envoi')) RETURNING id`);
  } catch (e) { console.error('worker:', e.message); } finally { busy = false; }
}

/* ---------------- Routes ---------------- */
const duplicateMsg = { membres_email_uniq: 'Cette adresse e-mail est déjà utilisée par un autre membre.', membres_telephone_uniq: 'Ce numéro de téléphone est déjà utilisé par un autre membre.', membres_piece_uniq: 'Ce numéro de pièce d’identité est déjà enregistré : une personne ne peut adhérer qu’une seule fois.' };

const routes = {
  /* ---------- Public ---------- */
  'GET /api/stats': async (req, res) => send(res, 200, await stats()),
  'GET /api/parametres': async (req, res) => { const r = await q('SELECT cle, valeur FROM parametres'); send(res, 200, Object.fromEntries(r.map(x => [x.cle, +x.valeur]))); },
  'GET /api/chemin': async (req, res) => send(res, 200, DEFIS.chemin),
  'GET /api/deputes': async (req, res, d, url) => {
    const p = url.searchParams.get('province');
    const rows = await q(`SELECT ${PUBLIC_DEPUTE} FROM membres m JOIN deputes d ON d.membre_id=m.id WHERE m.statut='valide' AND m.grade<>'membre' ${p ? 'AND d.province=$1' : ''}
      ORDER BY CASE m.grade WHEN 'candidat' THEN 0 WHEN 'coordinateur' THEN 1 ELSE 2 END, d.province, m.nom`, p ? [p] : []);
    send(res, 200, rows.map(deputeRow));
  },
  'GET /api/depute': async (req, res, d, url) => {
    const r = await q1(`SELECT ${PUBLIC_DEPUTE}, m.id AS _id FROM membres m JOIN deputes d ON d.membre_id=m.id WHERE m.statut='valide' AND m.grade<>'membre' AND m.code_parrainage=$1`, [clean(url.searchParams.get('c'), 20)]);
    if (!r) return fail(res, 404, 'Profil introuvable.');
    const me = await user(req); const suivi = me ? !!(await q1('SELECT 1 FROM abonnements WHERE membre_id=$1 AND depute_id=$2', [me.id, r._id])) : false;
    delete r._id; send(res, 200, { ...deputeRow(r), suivi, connecte: !!me });
  },
  'GET /api/photo': async (req, res, d, url) => {
    const r = await q1(`SELECT d.photo_fichier FROM deputes d JOIN membres m ON m.id=d.membre_id WHERE m.numero=$1 AND m.statut='valide' AND d.photo_fichier IS NOT NULL`, [+url.searchParams.get('n') || 0]);
    if (!r || !/^[\w.-]+$/.test(r.photo_fichier)) { res.writeHead(404); return res.end(); }
    const f = path.join(DATA_DIR, 'photos', r.photo_fichier), ext = path.extname(f).slice(1);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(f).pipe(res);
  },
  'GET /api/articles': async (req, res, d, url) => {
    const c = url.searchParams.get('cat'), lim = Math.min(+url.searchParams.get('limit') || 30, 100), ok = CATEGORIES.includes(c);
    send(res, 200, await q(`SELECT id::int, titre, categorie, resume, image, publie_le FROM articles WHERE publie ${ok ? 'AND categorie=$2' : ''} ORDER BY publie_le DESC LIMIT $1`, ok ? [lim, c] : [lim]));
  },
  'GET /api/article': async (req, res, d, url) => {
    const a = await q1('SELECT id::int, titre, categorie, resume, contenu, image, publie_le FROM articles WHERE id=$1 AND publie', [+url.searchParams.get('id') || 0]);
    a ? send(res, 200, a) : fail(res, 404, 'Article introuvable');
  },
  'GET /api/desabonner': async (req, res, d, url) => {
    const e = clean(url.searchParams.get('e'), 160).toLowerCase(), t = clean(url.searchParams.get('t'), 100);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (!e || !same(t, hmac('unsub:' + e))) return res.end('<p style="font-family:sans-serif;padding:30px">Lien invalide.</p>');
    await q('UPDATE membres SET accepte_messages=FALSE WHERE lower(email)=$1 RETURNING id', [e]);
    await q('UPDATE contacts SET desabonne=TRUE WHERE lower(email)=$1 RETURNING id', [e]);
    res.end('<p style="font-family:sans-serif;padding:30px;font-size:18px">Vous êtes désabonné : vous ne recevrez plus de messages des 21 Défis.</p>');
  },

  /* ---------- Adhésion & compte ---------- */
  'POST /api/adhesion': async (req, res, d, url, ip) => {
    if (limited('adh:' + ip, 10)) return fail(res, 429, 'Trop de tentatives, réessayez dans une minute.');
    const m = { prenom: clean(d.prenom, 80), nom: clean(d.nom, 80), postnom: clean(d.postnom, 80), email: clean(d.email, 160).toLowerCase(), telephone: normPhone(d.telephone),
      pays: clean(d.pays, 80) || 'RD Congo', province: PROVINCES.includes(d.province) ? d.province : '', region: clean(d.region, 120), ville: clean(d.ville, 80),
      type: ['membre', 'sympathisant', 'benevole'].includes(d.type) ? d.type : 'membre', message: clean(d.message, 1500), piece_type: d.piece_type, piece: normPiece(d.piece_numero) };
    const dn = /^\d{4}-\d{2}-\d{2}$/.test(d.date_naissance || '') ? d.date_naissance : '';
    if (!m.prenom || !m.nom) return fail(res, 400, 'Prénom et nom sont obligatoires.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.email)) return fail(res, 400, 'Adresse e-mail invalide.');
    if (!m.telephone) return fail(res, 400, 'Numéro de téléphone invalide (avec indicatif, ex. +243…).');
    if (!dn || isNaN(new Date(dn))) return fail(res, 400, 'Date de naissance invalide.');
    const age = ageOf(dn); if (age < MIN_AGE) return fail(res, 400, `L’adhésion est réservée aux personnes de ${MIN_AGE} ans et plus.`); if (age > 120) return fail(res, 400, 'Date de naissance invalide.');
    if (!m.province || !m.region) return fail(res, 400, 'Province et région sont obligatoires.');
    if (!PIECES.includes(m.piece_type)) return fail(res, 400, 'Type de pièce d’identité invalide.');
    if (m.piece.length < 4 || m.piece.length > 30) return fail(res, 400, 'Numéro de pièce d’identité invalide.');
    if (typeof d.mot_de_passe !== 'string' || d.mot_de_passe.length < 8) return fail(res, 400, 'Mot de passe : 8 caractères minimum.');
    if (!d.charte || !d.rgpd) return fail(res, 400, 'Vous devez accepter la charte et le traitement de vos données.');
    const file = decodeFile(d.piece_image, 5 * 1048576, true); if (file.error) return fail(res, 400, 'Capture de la pièce d’identité : ' + file.error);
    const pieceHash = hmac('piece:' + m.piece);
    const dup = await q1(`SELECT (lower(email)=$1) AS e, (telephone=$2) AS t, (piece_hash=$3) AS p FROM membres WHERE lower(email)=$1 OR telephone=$2 OR piece_hash=$3 LIMIT 1`, [m.email, m.telephone, pieceHash]);
    if (dup) return fail(res, 409, dup.p ? duplicateMsg.membres_piece_uniq : dup.e ? duplicateMsg.membres_email_uniq : duplicateMsg.membres_telephone_uniq, { champ: dup.p ? 'piece' : dup.e ? 'email' : 'telephone' });
    const fname = crypto.randomBytes(20).toString('hex') + '.' + file.ext, fpath = path.join(DATA_DIR, 'pieces', fname);
    fs.writeFileSync(fpath, file.buf, { mode: 0o600 });
    try {
      const r = await q1(`INSERT INTO membres(prenom,nom,postnom,date_naissance,email,telephone,pays,province,region,ville,piece_type,piece_hash,piece_chiffre,piece_masque,piece_fichier,type,message,mot_de_passe,accepte_messages)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id, numero::text AS numero`,
        [m.prenom, m.nom, m.postnom, dn, m.email, m.telephone, m.pays, m.province, m.region, m.ville, m.piece_type, pieceHash, encrypt(m.piece), '••••' + m.piece.slice(-4), fname, m.type, m.message, await hashPw(d.mot_de_passe), !!d.accepte_messages]);
      const code = clean(d.d, 20);
      if (code) { // lien d'invitation d'un député : parrainage + abonnement automatique
        const p = await q1(`SELECT m.id FROM membres m JOIN deputes dd ON dd.membre_id=m.id WHERE m.code_parrainage=$1 AND m.grade<>'membre'`, [code]);
        if (p) { await q('UPDATE membres SET parrain_id=$1 WHERE id=$2 RETURNING id', [p.id, r.id]); await q(`INSERT INTO abonnements(membre_id,depute_id,source) VALUES($1,$2,'lien') ON CONFLICT DO NOTHING RETURNING membre_id`, [r.id, p.id]); }
      }
      await startSession(req, res, r.id, 201, { numero: +r.numero, statut: 'en_attente' });
    } catch (e) {
      fs.rmSync(fpath, { force: true });
      if (e.code === '23505') { const k = Object.keys(duplicateMsg).find(x => String(e.constraint || e.detail || e.message).includes(x)); return fail(res, 409, duplicateMsg[k] || 'Une adhésion existe déjà avec ces informations.'); }
      throw e;
    }
  },
  'POST /api/login': async (req, res, d, url, ip) => {
    if (limited('login:' + ip, 12)) return fail(res, 429, 'Trop de tentatives, réessayez dans une minute.');
    const id = clean(d.identifiant, 160).toLowerCase(), ph = normPhone(id);
    const m = await q1('SELECT * FROM membres WHERE lower(email)=$1 OR numero=$2 OR telephone=$3 LIMIT 1', [id, /^\d{1,12}$/.test(id) ? id : '-1', ph || '-']);
    if (!m || typeof d.mot_de_passe !== 'string' || !(await checkPw(d.mot_de_passe, m.mot_de_passe))) return fail(res, 401, 'Identifiant ou mot de passe incorrect.');
    await startSession(req, res, m.id, 200, { ok: true });
  },
  'POST /api/logout': async (req, res) => { const t = cookies(req).defis_sid; if (t) await q('DELETE FROM sessions WHERE token=$1 RETURNING token', [sha(t)]); send(res, 200, { ok: true }, cookieHdr(req, '', 0)); },

  /* ---------- Espace membre ---------- */
  'GET /api/moi': async (req, res) => {
    const m = await user(req); if (!m) return fail(res, 401, 'Non connecté');
    const suivis = (await q(`SELECT ${PUBLIC_DEPUTE} FROM abonnements a JOIN membres m ON m.id=a.depute_id JOIN deputes d ON d.membre_id=m.id WHERE a.membre_id=$1 AND m.statut='valide'`, [m.id])).map(deputeRow);
    const candidature = await q1('SELECT province, secteur, type_mandat, statut, cree_le FROM candidatures WHERE membre_id=$1 ORDER BY id DESC LIMIT 1', [m.id]);
    const dp = m.province ? (await q(`SELECT ${PUBLIC_DEPUTE} FROM membres m JOIN deputes d ON d.membre_id=m.id WHERE m.statut='valide' AND m.grade<>'membre' AND d.province=$1`, [m.province])).map(deputeRow) : [];
    send(res, 200, { membre: moiOut(m), suivis, candidature, stats: await stats(), ma_province: m.province ? await stats(m.province) : null, deputes_province: dp,
      abonnes: m.grade !== 'membre' ? (await q1(`SELECT count(*)::int n FROM abonnements a JOIN membres s ON s.id=a.membre_id WHERE a.depute_id=$1 AND s.statut='valide'`, [m.id])).n : null });
  },
  'GET /api/defis': async (req, res) => {
    const m = await user(req); if (!m) return fail(res, 401, 'Connexion requise');
    if (m.statut !== 'valide') return fail(res, 403, 'Les 21 défis sont réservés aux membres dont l’adhésion est validée.');
    send(res, 200, DEFIS);
  },
  'POST /api/suivre': async (req, res, d) => {
    const m = await user(req); if (!m) return fail(res, 401, 'Connexion requise');
    if (m.statut !== 'valide') return fail(res, 403, 'Adhésion non encore validée.');
    const dep = await q1(`SELECT id FROM membres WHERE numero=$1 AND statut='valide' AND grade<>'membre'`, [+d.numero || 0]);
    if (!dep) return fail(res, 404, 'Député introuvable.');
    if (dep.id === m.id) return fail(res, 400, 'Vous ne pouvez pas vous suivre vous-même.');
    if (d.suivre === false) await q('DELETE FROM abonnements WHERE membre_id=$1 AND depute_id=$2 RETURNING 1', [m.id, dep.id]);
    else await q('INSERT INTO abonnements(membre_id,depute_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING 1', [m.id, dep.id]);
    send(res, 200, { abonnes: (await q1(`SELECT count(*)::int n FROM abonnements a JOIN membres s ON s.id=a.membre_id WHERE a.depute_id=$1 AND s.statut='valide'`, [dep.id])).n });
  },
  'POST /api/moi/consentement': async (req, res, d) => {
    const m = await user(req); if (!m) return fail(res, 401, 'Non connecté');
    await q('UPDATE membres SET accepte_messages=$1 WHERE id=$2 RETURNING id', [!!d.accepte_messages, m.id]); send(res, 200, { ok: true });
  },
  'POST /api/candidature': async (req, res, d) => {
    const m = await user(req); if (!m) return fail(res, 401, 'Non connecté');
    if (m.statut !== 'valide') return fail(res, 403, 'Votre adhésion doit d’abord être validée pour déposer une candidature.');
    const c = { type_mandat: ['national', 'provincial'].includes(d.type_mandat) ? d.type_mandat : '', province: PROVINCES.includes(d.province) ? d.province : '', secteur: clean(d.secteur, 120), profession: clean(d.profession, 120), motivation: clean(d.motivation, 3000) };
    if (!c.type_mandat) return fail(res, 400, 'Choisissez le type de mandat : national ou provincial.');
    if (!c.province || !c.secteur || c.motivation.length < 30) return fail(res, 400, 'Province, secteur et motivation (30 caractères minimum) requis.');
    try { await q('INSERT INTO candidatures(membre_id,type_mandat,province,secteur,profession,motivation) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [m.id, c.type_mandat, c.province, c.secteur, c.profession, c.motivation]); }
    catch (e) { if (e.code === '23505') return fail(res, 409, 'Vous avez déjà une candidature en cours.'); throw e; }
    send(res, 201, { ok: true });
  },

  /* ---------- Tableau de bord député ---------- */
  'GET /api/depute/tableau': async (req, res) => {
    const m = await user(req); if (!isDepute(m)) return fail(res, 403, 'Réservé aux députés validés.');
    const [profil, wallet, evo, total, reseau, contacts, camps, mvts, pays, prix] = await Promise.all([
      q1(`SELECT d.type_mandat, d.province, d.secteur, d.profession, d.bio, d.slogan, d.couleur, d.couverture, d.reseaux, (d.photo_fichier IS NOT NULL) AS a_photo FROM deputes d WHERE d.membre_id=$1`, [m.id]),
      q1(`SELECT solde_usd::float8 AS solde_usd, credits_sms, credits_email FROM portefeuilles WHERE membre_id=$1`, [m.id]),
      q(`SELECT to_char(g::date,'YYYY-MM-DD') AS jour, count(a.membre_id)::int AS n FROM generate_series(current_date-29, current_date, '1 day') g
         LEFT JOIN abonnements a ON a.depute_id=$1 AND a.cree_le::date=g::date GROUP BY g ORDER BY g`, [m.id]),
      q1(`SELECT count(*)::int n, (count(*) FILTER (WHERE s.statut='valide'))::int valides FROM abonnements a JOIN membres s ON s.id=a.membre_id WHERE a.depute_id=$1`, [m.id]),
      q1(`SELECT count(*)::int n, (count(*) FILTER (WHERE statut='valide'))::int valides FROM membres WHERE parrain_id=$1`, [m.id]),
      q1(`SELECT count(*)::int n, (count(telephone))::int tel, (count(email))::int mails FROM contacts WHERE depute_id=$1 AND NOT desabonne`, [m.id]),
      q(`SELECT id::int, canal, nom, statut, total, envoyes, echecs, cree_le FROM campagnes WHERE depute_id=$1 ORDER BY id DESC LIMIT 30`, [m.id]),
      q(`SELECT type, montant_usd::float8 AS montant_usd, credits_sms, credits_email, description, cree_le FROM mouvements WHERE membre_id=$1 ORDER BY id DESC LIMIT 25`, [m.id]),
      q(`SELECT reference, montant_usd::float8 AS montant_usd, statut, cree_le FROM paiements WHERE membre_id=$1 ORDER BY id DESC LIMIT 10`, [m.id]),
      q('SELECT cle, valeur FROM parametres')
    ]);
    send(res, 200, { membre: moiOut(m), profil, portefeuille: wallet || { solde_usd: 0, credits_sms: 0, credits_email: 0 }, evolution: evo, abonnes: total, reseau, contacts, campagnes: camps, mouvements: mvts, paiements: pays,
      prix: Object.fromEntries(prix.map(x => [x.cle, +x.valeur])), lien_adhesion: `${SITE_URL}/adhesion.html?d=${m.code_parrainage}`, lien_profil: `${SITE_URL}/depute.html?c=${m.code_parrainage}`,
      envoi: { sms: smsConfigured(), email: emailConfigured(), paiement: !!CASHPAY_API_KEY } });
  },
  'POST /api/depute/profil': async (req, res, d) => {
    const m = await user(req); if (!isDepute(m)) return fail(res, 403, 'Réservé aux députés validés.');
    const reseaux = {};
    for (const k of RESEAUX) { const v = clean(d.reseaux?.[k], 300); if (!v) continue; if (!okUrl(v)) return fail(res, 400, `Lien « ${k} » : une adresse https:// est requise.`); reseaux[k] = v; }
    const couverture = clean(d.couverture, 300); if (!okImage(couverture)) return fail(res, 400, 'Couverture : lien https:// requis.');
    await q('UPDATE deputes SET bio=$1, slogan=$2, couleur=$3, couverture=$4, reseaux=$5::jsonb, profession=$6 WHERE membre_id=$7 RETURNING membre_id',
      [clean(d.bio, 1500), clean(d.slogan, 160), ['bleu', 'jaune', 'rouge', 'tricolore'].includes(d.couleur) ? d.couleur : 'bleu', couverture, JSON.stringify(reseaux), clean(d.profession, 120), m.id]);
    send(res, 200, { ok: true });
  },
  'POST /api/depute/photo': async (req, res, d) => {
    const m = await user(req); if (!isDepute(m)) return fail(res, 403, 'Réservé aux députés validés.');
    const f = decodeFile(d.image, 2 * 1048576, false); if (f.error) return fail(res, 400, f.error);
    const name = `${m.numero}-${crypto.randomBytes(4).toString('hex')}.${f.ext}`;
    fs.writeFileSync(path.join(DATA_DIR, 'photos', name), f.buf, { mode: 0o600 });
    const old = await q1('SELECT photo_fichier FROM deputes WHERE membre_id=$1', [m.id]);
    await q('UPDATE deputes SET photo_fichier=$1 WHERE membre_id=$2 RETURNING membre_id', [name, m.id]);
    if (old?.photo_fichier && /^[\w.-]+$/.test(old.photo_fichier)) fs.rmSync(path.join(DATA_DIR, 'photos', old.photo_fichier), { force: true });
    send(res, 200, { ok: true, photo: '/api/photo?n=' + m.numero });
  },
  'GET /api/depute/contacts': async (req, res) => {
    const m = await user(req); if (!isDepute(m)) return fail(res, 403, 'Réservé aux députés validés.');
    send(res, 200, await q(`SELECT id::int, nom, telephone, email, cree_le FROM contacts WHERE depute_id=$1 AND NOT desabonne ORDER BY id DESC LIMIT 5000`, [m.id]));
  },
  'POST /api/depute/contacts/importer': async (req, res, d) => {
    const m = await user(req); if (!isDepute(m)) return fail(res, 403, 'Réservé aux députés validés.');
    if (!d.consentement) return fail(res, 400, 'Vous devez attester que ces personnes ont accepté de recevoir vos messages.');
    const list = Array.isArray(d.contacts) ? d.contacts.slice(0, 2000) : []; let ajoutes = 0, doublons = 0, invalides = 0;
    for (const c of list) {
      const tel = c.telephone ? normPhone(c.telephone) : null, email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c.email || '').trim()) ? String(c.email).trim().toLowerCase() : null;
      if (!tel && !email) { invalides++; continue; }
      const r = await q(`INSERT INTO contacts(depute_id,nom,telephone,email) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`, [m.id, clean(c.nom, 120), tel, email]);
      r.length ? ajoutes++ : doublons++;
    }
    send(res, 200, { ajoutes, doublons, invalides });
  },
  'POST /api/depute/contacts/supprimer': async (req, res, d) => {
    const m = await user(req); if (!isDepute(m)) return fail(res, 403, 'Réservé aux députés validés.');
    await q('DELETE FROM contacts WHERE id=$1 AND depute_id=$2 RETURNING id', [+d.id, m.id]); send(res, 200, { ok: true });
  },
  'POST /api/depute/campagne/devis': async (req, res, d) => {
    const m = await user(req); if (!isDepute(m)) return fail(res, 403, 'Réservé aux députés validés.');
    if (!['sms', 'email'].includes(d.canal)) return fail(res, 400, 'Canal invalide.');
    send(res, 200, await devis(d.canal, Array.isArray(d.sources) ? d.sources : [], m.id, d.limite));
  },
  'POST /api/depute/campagne/lancer': async (req, res, d) => {
    const m = await user(req); if (!isDepute(m)) return fail(res, 403, 'Réservé aux députés validés.');
    const canal = d.canal, sources = (Array.isArray(d.sources) ? d.sources : []).filter(s => SOURCES.includes(s));
    if (!['sms', 'email'].includes(canal)) return fail(res, 400, 'Canal invalide.');
    const nom = clean(d.nom, 100), message = clean(d.message, canal === 'sms' ? 320 : 5000), sujet = clean(d.sujet, 150);
    if (!nom || message.length < 5) return fail(res, 400, 'Nom de campagne et message requis.');
    if (canal === 'email' && !sujet) return fail(res, 400, 'Objet du mail requis.');
    if (!sources.length) return fail(res, 400, 'Choisissez au moins un groupe de destinataires.');
    if (canal === 'sms' ? !smsConfigured() : !emailConfigured()) return fail(res, 503, `L’envoi de ${canal === 'sms' ? 'SMS' : 'e-mails'} n’est pas encore activé sur le serveur.`);
    const a = audience(canal, sources, m.id, d.limite);
    const c = await q1(`INSERT INTO campagnes(depute_id,canal,nom,sujet,message,signature,sources) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::int AS id`, [m.id, canal, nom, sujet, message, d.signature === '21defis' ? '21defis' : 'depute', sources]);
    await q(`INSERT INTO campagne_envois(campagne_id,nom,telephone,email) SELECT ${c.id}, nom, NULLIF(telephone,''), NULLIF(email,'') FROM (${a.sql}) t RETURNING id`, a.params).catch(async e => { await q('DELETE FROM campagnes WHERE id=$1 RETURNING id', [c.id]); throw e; });
    const r = (await q1('SELECT fn_lancer_campagne($1) AS r', [c.id])).r;
    if (!r.ok) { await q('DELETE FROM campagnes WHERE id=$1 RETURNING id', [c.id]); return fail(res, r.erreur === 'Crédits insuffisants' ? 402 : 400, r.erreur, { besoin: r.besoin, credits: r.credits }); }
    send(res, 201, { ok: true, id: c.id, total: r.total });
  },
  'POST /api/depute/campagne/annuler': async (req, res, d) => {
    const m = await user(req); if (!isDepute(m)) return fail(res, 403, 'Réservé aux députés validés.');
    const r = (await q1('SELECT fn_annuler_campagne($1,$2) AS r', [+d.id, m.id])).r; send(res, r.ok ? 200 : 400, r.ok ? r : { error: r.erreur });
  },

  /* ---------- Portefeuille & paiements CashPay All ---------- */
  'POST /api/portefeuille/recharger': async (req, res, d) => {
    const m = await user(req); if (!isDepute(m)) return fail(res, 403, 'Réservé aux députés validés.');
    if (!CASHPAY_API_KEY) return fail(res, 503, 'Le paiement en ligne n’est pas encore activé sur le serveur.');
    const min = +(await q1(`SELECT valeur FROM parametres WHERE cle='recharge_min_usd'`)).valeur, montant = Math.round((+d.montant || 0) * 100) / 100;
    if (!(montant >= min) || montant > 2000) return fail(res, 400, `Montant invalide : de ${min} $ à 2000 $.`);
    const reference = `W21-${m.numero}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
    await q('INSERT INTO paiements(reference,membre_id,montant_usd) VALUES($1,$2,$3) RETURNING id', [reference, m.id, montant]);
    try {
      const s = await cashpayCheckout({ amount: montant, currency: 'USD', reference, description: 'Recharge du portefeuille — Les 21 Défis',
        customer: { name: `${m.prenom} ${m.nom}`, email: m.email }, redirectUrl: `${SITE_URL}/espace.html?paiement=${encodeURIComponent(reference)}`, webhookUrl: `${SITE_URL}/api/webhooks/cashpay`, paymentMethods: 'Card,MobileMoney' });
      await q('UPDATE paiements SET cashpay_session=$1, url_paiement=$2 WHERE reference=$3 RETURNING id', [s.sessionId || '', s.redirectUrl, reference]);
      send(res, 200, { redirectUrl: s.redirectUrl, reference });
    } catch (e) { await q(`UPDATE paiements SET statut='echoue', maj_le=now() WHERE reference=$1 RETURNING id`, [reference]); fail(res, 502, e.message); }
  },
  'POST /api/portefeuille/acheter': async (req, res, d) => {
    const m = await user(req); if (!isDepute(m)) return fail(res, 403, 'Réservé aux députés validés.');
    const r = (await q1('SELECT fn_acheter_credits($1,$2,$3) AS r', [m.id, d.canal, Math.floor(+d.quantite || 0)])).r; send(res, r.ok ? 200 : 402, r.ok ? r : { error: r.erreur, cout: r.cout });
  },
  'POST /api/webhooks/cashpay': async (req, res, d, url, ip, raw) => {
    if (!CASHPAY_API_SECRET) return fail(res, 503, 'Webhook non configuré');
    const sig = String(req.headers['x-cashpay-signature'] || ''), expected = crypto.createHmac('sha256', CASHPAY_API_SECRET).update(raw).digest('hex');
    if (!sig || !same(sig, expected)) return fail(res, 401, 'Signature invalide');
    const ev = d.event, x = d.data || {};
    const p = await q1('SELECT reference, montant_usd::float8 AS montant FROM paiements WHERE reference=$1', [clean(x.reference, 80)]);
    if (!p) return send(res, 200, { ok: true, ignore: 'référence inconnue' });
    if (ev === 'payment.succeeded') {
      if (x.currency && x.currency !== 'USD') return send(res, 200, { ok: true, ignore: 'devise' });
      if (Math.abs((+x.amount || 0) - p.montant) > 0.009) { console.error('Webhook : montant différent pour', p.reference); return send(res, 200, { ok: true, ignore: 'montant' }); }
      await q('SELECT fn_confirmer_paiement($1,$2)', [p.reference, clean(x.cashpay_transaction_id, 80)]);
    } else if (ev === 'payment.failed') await q(`UPDATE paiements SET statut='echoue', maj_le=now() WHERE reference=$1 AND statut='en_attente' RETURNING id`, [p.reference]);
    send(res, 200, { ok: true });
  },

  /* ---------- Administration ---------- */
  'GET /api/admin/membres': async (req, res) => send(res, 200, await q(`SELECT id::int, numero::text AS numero, prenom, nom, postnom, email, telephone, pays, province, region, ville, date_naissance, piece_type, piece_masque, type, grade, statut, cree_le FROM membres ORDER BY id DESC LIMIT 5000`)),
  'GET /api/admin/membre-detail': async (req, res, d, url) => {
    const m = await q1('SELECT * FROM membres WHERE numero=$1', [+url.searchParams.get('numero') || 0]); if (!m) return fail(res, 404, 'Introuvable');
    const { mot_de_passe, piece_hash, piece_chiffre, ...rest } = m; send(res, 200, { ...rest, piece_numero: decrypt(piece_chiffre), age: ageOf(m.date_naissance) });
  },
  'GET /api/admin/piece': async (req, res, d, url) => {
    const m = await q1('SELECT piece_fichier FROM membres WHERE numero=$1', [+url.searchParams.get('numero') || 0]);
    if (!m || !/^[\w.-]+$/.test(m.piece_fichier)) { res.writeHead(404); return res.end(); }
    const f = path.join(DATA_DIR, 'pieces', m.piece_fichier), ext = path.extname(f).slice(1);
    res.writeHead(200, { 'Content-Type': { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }[ext], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(f).pipe(res);
  },
  'GET /api/admin/candidatures': async (req, res) => send(res, 200, await q(`SELECT c.id::int, m.numero::text AS numero, c.type_mandat, c.province, c.secteur, c.profession, c.motivation, c.statut, c.cree_le, m.prenom, m.nom, m.email, m.telephone FROM candidatures c JOIN membres m ON m.id=c.membre_id ORDER BY c.id DESC LIMIT 2000`)),
  'POST /api/admin/membre': async (req, res, d) => {
    if (!['valide', 'refuse', 'en_attente'].includes(d.statut)) return fail(res, 400, 'Statut invalide');
    await q('UPDATE membres SET statut=$1, valide_le=CASE WHEN $1=\'valide\' THEN now() ELSE NULL END WHERE numero=$2 RETURNING id', [d.statut, +d.numero]); send(res, 200, { ok: true });
  },
  'POST /api/admin/grade': async (req, res, d) => {
    if (!GRADES.includes(d.grade)) return fail(res, 400, 'Grade invalide');
    const m = await q1('SELECT id, province FROM membres WHERE numero=$1', [+d.numero]); if (!m) return fail(res, 404, 'Introuvable');
    if (d.grade === 'membre') await q(`UPDATE membres SET grade='membre' WHERE id=$1 RETURNING id`, [m.id]);
    else await q('SELECT fn_promouvoir($1,$2,$3,$4,$5,$6)', [m.id, d.grade, d.type_mandat === 'national' ? 'national' : 'provincial', PROVINCES.includes(d.province) ? d.province : (m.province || ''), clean(d.secteur, 120), '']);
    send(res, 200, { ok: true });
  },
  'POST /api/admin/candidature': async (req, res, d) => {
    if (!['retenue', 'refusee', 'en_attente'].includes(d.statut)) return fail(res, 400, 'Statut invalide');
    const c = await q1('UPDATE candidatures SET statut=$1 WHERE id=$2 RETURNING *', [d.statut, +d.id]); if (!c) return fail(res, 404, 'Introuvable');
    if (d.statut === 'retenue') await q('SELECT fn_promouvoir($1,$2,$3,$4,$5,$6)', [c.membre_id, 'depute', c.type_mandat, c.province, c.secteur, c.profession]); // la province du député est enregistrée automatiquement
    send(res, 200, { ok: true });
  },
  'POST /api/admin/portefeuille/ajuster': async (req, res, d) => {
    const m = await q1('SELECT id FROM membres WHERE numero=$1', [+d.numero]); if (!m) return fail(res, 404, 'Introuvable');
    const usd = Math.round((+d.usd || 0) * 100) / 100, sms = Math.trunc(+d.sms || 0), mail = Math.trunc(+d.email || 0);
    const r = await q1(`UPDATE portefeuilles SET solde_usd=solde_usd+$1, credits_sms=credits_sms+$2, credits_email=credits_email+$3, maj_le=now() WHERE membre_id=$4 AND solde_usd+$1>=0 AND credits_sms+$2>=0 AND credits_email+$3>=0 RETURNING *`, [usd, sms, mail, m.id]);
    if (!r) return fail(res, 400, 'Ajustement impossible (portefeuille inexistant ou solde négatif).');
    await q(`INSERT INTO mouvements(membre_id,type,montant_usd,credits_sms,credits_email,description) VALUES($1,'ajustement',$2,$3,$4,'Ajustement administration') RETURNING id`, [m.id, usd, sms, mail]); send(res, 200, { ok: true });
  },
  'GET /api/admin/articles': async (req, res) => send(res, 200, await q('SELECT id::int, titre, categorie, resume, contenu, image, publie, publie_le FROM articles ORDER BY id DESC LIMIT 500')),
  'POST /api/admin/article': async (req, res, d) => {
    const a = { titre: clean(d.titre, 200), categorie: CATEGORIES.includes(d.categorie) ? d.categorie : 'actualite', resume: clean(d.resume, 400), contenu: clean(d.contenu, 40000), image: clean(d.image, 300), publie: !!d.publie };
    if (!a.titre || !a.contenu) return fail(res, 400, 'Titre et contenu requis.');
    if (!okImage(a.image)) return fail(res, 400, 'Image : lien https:// ou public/images/…');
    if (d.id) { if (!await q1(`UPDATE articles SET titre=$1,categorie=$2,resume=$3,contenu=$4,image=$5,publie=$6,publie_le=CASE WHEN $6 THEN COALESCE(publie_le, now()) ELSE publie_le END WHERE id=$7 RETURNING id`, [a.titre, a.categorie, a.resume, a.contenu, a.image, a.publie, +d.id])) return fail(res, 404, 'Introuvable'); }
    else await q(`INSERT INTO articles(titre,categorie,resume,contenu,image,publie,publie_le) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6 THEN now() ELSE NULL END) RETURNING id`, [a.titre, a.categorie, a.resume, a.contenu, a.image, a.publie]);
    send(res, 200, { ok: true });
  },
  'POST /api/admin/article/supprimer': async (req, res, d) => { await q('DELETE FROM articles WHERE id=$1 RETURNING id', [+d.id]); send(res, 200, { ok: true }); }
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), key = req.method + ' ' + url.pathname, ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const h = routes[key];
    if (!h) return fail(res, 404, 'Introuvable');
    if (url.pathname.startsWith('/api/admin') && !isAdmin(req)) return fail(res, 401, 'Accès refusé');
    let data = null, raw = '';
    if (req.method === 'POST') {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return fail(res, 415, 'JSON requis');
      if (limited('post:' + ip, 120)) return fail(res, 429, 'Trop de requêtes, réessayez dans une minute.');
      raw = await readBody(req, url.pathname === '/api/adhesion' ? 9 * 1048576 : url.pathname === '/api/depute/photo' ? 3 * 1048576 : 400000);
      try { data = JSON.parse(raw || '{}'); } catch { return fail(res, 400, 'JSON invalide'); }
    }
    await h(req, res, data, url, ip, raw);
  } catch (e) { console.error(e); if (!res.headersSent) fail(res, 500, e.message === 'Requête trop volumineuse.' ? e.message : 'Erreur serveur'); }
}).listen(PORT, '127.0.0.1', async () => {
  console.log('21 Défis API sur 127.0.0.1:' + PORT);
  await q(`UPDATE campagne_envois SET statut='attente' WHERE statut='envoi' RETURNING id`).catch(e => console.error('Base de données :', e.message));
  setInterval(worker, WORKER_MS);
});
