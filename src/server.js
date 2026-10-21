import crypto from 'node:crypto';
import express from 'express';
import { safeEq, verifyTotp, signSession, checkSession } from './auth.js';
import { db, getSettings, setSettings } from './db.js';
import * as wa from './whatsapp.js';
import { runReminders, startScheduler, renderMessage, nextMonth, today, daysBetween } from './scheduler.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  });
  next();
});

// CSRF: escrita só com JSON da mesma origem (formulário de outro site não consegue)
app.use((req, res, next) => {
  if (['GET', 'HEAD'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!(req.headers['content-type'] || '').startsWith('application/json') || (origin && new URL(origin).host !== req.headers.host)) {
    return res.status(403).json({ error: 'Requisição bloqueada' });
  }
  next();
});
app.use(express.json({ limit: '20kb' }));

// Login: usuário + senha + código do app autenticador (TOTP)
const USER = process.env.PANEL_USER || 'admin';
const PASS = process.env.PANEL_PASSWORD || '';
const TOTP_SECRET = process.env.TOTP_SECRET || '';
if (PASS.length < 12) {
  console.error('PANEL_PASSWORD ausente ou curta (mínimo 12 caracteres). Defina no .env.');
  process.exit(1);
}
// TOTP é opcional: sem TOTP_SECRET o login pede só usuário e senha
// Trocar senha ou segredo derruba todas as sessões abertas
const SESSION_KEY = crypto.createHash('sha256').update(PASS + '|' + TOTP_SECRET).digest();
const getCookie = (req, name) => (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];

// Bloqueia IP após 10 tentativas erradas em 15 min
const fails = new Map();
app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const f = fails.get(ip);
  const fresh = f && Date.now() - f.first < 15 * 60e3;
  if (fresh && f.count >= 10) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
  const { user = '', password = '', code = '' } = req.body || {};
  const okUser = safeEq(user.trim(), USER), okPass = safeEq(password, PASS);
  const okCode = !TOTP_SECRET || verifyTotp(TOTP_SECRET, String(code).replace(/\s/g, ''));
  if (!(okUser && okPass && okCode)) {
    // Só no log do servidor (não vai para o navegador)
    console.warn(`login falhou ip=${ip} usuario=${okUser ? 'ok' : 'errado'} senha=${okPass ? 'ok' : 'errada'} codigo=${okCode ? 'ok' : 'errado'}`);
    const cur = fresh ? f : { count: 0, first: Date.now() };
    cur.count++; fails.set(ip, cur);
    return res.status(401).json({ error: 'Usuário, senha ou código inválido' });
  }
  fails.delete(ip);
  res.cookie('sess', signSession(SESSION_KEY), { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 12 * 3600e3, path: '/' });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { res.clearCookie('sess', { path: '/' }); res.json({ ok: true }); });
app.get('/api/login-config', (req, res) => res.json({ totp: !!TOTP_SECRET }));
app.get('/login', (req, res) => res.sendFile('login.html', { root: 'login' }));

app.use((req, res, next) => {
  if (checkSession(SESSION_KEY, getCookie(req, 'sess'))) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sessão expirada' });
  res.redirect('/login');
});
app.use(express.static('public'));

const wrap = (fn) => (req, res) => Promise.resolve().then(() => fn(req, res)).catch((e) => res.status(400).json({ error: e.message }));

function checkPhone(phone) {
  if (wa.isGroup(phone)) return;
  const d = String(phone).replace(/\D/g, '');
  if (String(phone).trim().startsWith('+')) {
    if (d.length < 8 || d.length > 15) throw new Error('Telefone internacional inválido: use +código do país e número');
  } else if (d.length < 10 || d.length > 13) {
    throw new Error('Telefone inválido: use DDD + número, ou +código do país');
  }
}

// Clientes
app.get('/api/clients', (req, res) => res.json(db.prepare('SELECT * FROM clients ORDER BY name').all()));
app.post('/api/clients', wrap((req, res) => {
  const { name, phone, notes = '' } = req.body;
  if (!name || !phone) throw new Error('Nome e telefone obrigatórios');
  checkPhone(phone);
  const r = db.prepare('INSERT INTO clients (name, phone, notes) VALUES (?, ?, ?)').run(name, phone, notes);
  res.json({ id: Number(r.lastInsertRowid) });
}));
app.put('/api/clients/:id', wrap((req, res) => {
  const { name, phone, notes = '' } = req.body;
  checkPhone(phone);
  db.prepare('UPDATE clients SET name = ?, phone = ?, notes = ? WHERE id = ?').run(name, phone, notes, req.params.id);
  res.json({ ok: true });
}));
app.delete('/api/clients/:id', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Cobranças
app.get('/api/charges', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, cl.name, cl.phone,
      (SELECT MAX(sent_at) FROM send_log s WHERE s.charge_id = c.id AND s.status = 'sent') AS last_sent
    FROM charges c JOIN clients cl ON cl.id = c.client_id ORDER BY c.active DESC, c.due_date`).all();
  const t = today();
  res.json(rows.map((r) => ({ ...r, days: daysBetween(t, r.due_date) })));
});
function chargeBody(b) {
  if (!b.client_id || !b.description || !b.amount || !b.due_date) throw new Error('Preencha cliente, descrição, valor e vencimento');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.due_date)) throw new Error('Data inválida');
  if (!(Number(b.amount) > 0)) throw new Error('Valor inválido');
  const offsets = String(b.offsets || '1,5,10').split(',').map((s) => parseInt(s, 10)).filter((n) => n >= 0).join(',');
  return [b.client_id, b.description, Number(b.amount), b.due_date, Number(b.due_date.slice(8, 10)), b.recurring ? 1 : 0, offsets, b.active === false ? 0 : 1];
}
app.post('/api/charges', wrap((req, res) => {
  const r = db.prepare('INSERT INTO charges (client_id, description, amount, due_date, due_day, recurring, offsets, active) VALUES (?,?,?,?,?,?,?,?)').run(...chargeBody(req.body));
  res.json({ id: Number(r.lastInsertRowid) });
}));
app.put('/api/charges/:id', wrap((req, res) => {
  db.prepare('UPDATE charges SET client_id=?, description=?, amount=?, due_date=?, due_day=?, recurring=?, offsets=?, active=? WHERE id=?').run(...chargeBody(req.body), req.params.id);
  res.json({ ok: true });
}));
app.delete('/api/charges/:id', (req, res) => {
  db.prepare('DELETE FROM charges WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
// Marca pago: recorrente avança 1 mês, avulsa desativa
app.post('/api/charges/:id/paid', wrap((req, res) => {
  const c = db.prepare('SELECT * FROM charges WHERE id = ?').get(req.params.id);
  if (!c) throw new Error('Cobrança não encontrada');
  db.prepare('INSERT INTO payments (charge_id, due_date, amount) VALUES (?, ?, ?)').run(c.id, c.due_date, c.amount);
  if (c.recurring) db.prepare('UPDATE charges SET due_date = ? WHERE id = ?').run(nextMonth(c.due_date, c.due_day), c.id);
  else db.prepare('UPDATE charges SET active = 0 WHERE id = ?').run(c.id);
  res.json({ ok: true });
}));
// Envia agora (manual), independente do agendamento
app.post('/api/charges/:id/send', wrap(async (req, res) => {
  const c = db.prepare('SELECT c.*, cl.name, cl.phone FROM charges c JOIN clients cl ON cl.id = c.client_id WHERE c.id = ?').get(req.params.id);
  if (!c) throw new Error('Cobrança não encontrada');
  await wa.sendText(c.phone, renderMessage(c, daysBetween(today(), c.due_date)));
  res.json({ ok: true });
}));
app.get('/api/charges/:id/preview', (req, res) => {
  const c = db.prepare('SELECT c.*, cl.name, cl.phone FROM charges c JOIN clients cl ON cl.id = c.client_id WHERE c.id = ?').get(req.params.id);
  res.json({ text: c ? renderMessage(c, daysBetween(today(), c.due_date)) : '' });
});

app.get('/api/log', (req, res) => res.json(db.prepare(`
  SELECT s.*, c.description, cl.name FROM send_log s JOIN charges c ON c.id = s.charge_id JOIN clients cl ON cl.id = c.client_id
  ORDER BY s.sent_at DESC LIMIT 100`).all()));

app.get('/api/settings', (req, res) => res.json(getSettings()));
app.put('/api/settings', (req, res) => { setSettings(req.body); res.json(getSettings()); });

// WhatsApp
app.get('/api/whatsapp/status', wrap(async (req, res) => res.json({ state: await wa.status() })));
app.post('/api/whatsapp/connect', wrap(async (req, res) => res.json(await wa.connect())));
app.get('/api/whatsapp/groups', wrap(async (req, res) => res.json(await wa.groups())));
app.post('/api/whatsapp/logout', wrap(async (req, res) => res.json(await wa.logout())));
app.post('/api/run', wrap(async (req, res) => res.json(await runReminders({ dryRun: !!req.body?.dryRun }))));

// Erros sem stack trace para o navegador
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.type === 'entity.parse.failed' ? 'JSON inválido' : 'Erro interno' });
});

startScheduler();
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Painel em http://localhost:${port}`));
