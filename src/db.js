import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

fs.mkdirSync('data', { recursive: true });
export const db = new DatabaseSync(process.env.DB_PATH || 'data/cobranca.db');

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,            -- YYYY-MM-DD (próximo vencimento)
  due_day INTEGER NOT NULL,          -- dia original, p/ recorrência
  recurring INTEGER NOT NULL DEFAULT 1,
  offsets TEXT NOT NULL DEFAULT '1,5,10', -- dias antes do vencimento
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS send_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_id INTEGER NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL,
  offset_days INTEGER NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  status TEXT NOT NULL,
  error TEXT,
  UNIQUE (charge_id, due_date, offset_days)
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_id INTEGER NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
db.exec('PRAGMA foreign_keys = ON');

const DEFAULTS = {
  pix_key: '',
  pix_name: '',
  send_hour: '9',
  overdue_days: '1,3,7', // dias depois do vencimento para avisar atraso
  overdue_template:
    'Olá, {nome}! ⚠️\n\nSua cobrança *{descricao}* no valor de *{valor}* venceu em *{vencimento}* ({dias}) e ainda não identificamos o pagamento.\n\nPix: {pix}\nFavorecido: {favorecido}\n\nSe já pagou, por favor envie o comprovante. Obrigado!',
  auto_send: '0', // 1 = agendador envia sozinho; 0 = só manual
  template:
    'Olá, {nome}! 👋\n\nLembrete: sua cobrança *{descricao}* no valor de *{valor}* vence em *{vencimento}* ({dias}).\n\nPix: {pix}\nFavorecido: {favorecido}\n\nSe já pagou, desconsidere. Obrigado!',
};
const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULTS)) ins.run(k, v);

export function getSettings() {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
}

export function setSettings(obj) {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const k of Object.keys(DEFAULTS)) if (obj[k] !== undefined) up.run(k, String(obj[k]));
}
