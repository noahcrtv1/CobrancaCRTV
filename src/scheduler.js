import cron from 'node-cron';
import { db, getSettings } from './db.js';
import { sendText } from './whatsapp.js';

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

// Próximo mês mantendo o dia original (31 vira último dia do mês curto)
export function nextMonth(dateStr, dueDay) {
  const [y, m] = dateStr.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(dueDay, last)).padStart(2, '0')}`;
}

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brDate = (s) => s.split('-').reverse().join('/');

export function renderMessage(charge, days, settings = getSettings()) {
  const map = {
    nome: charge.name.split(' ')[0],
    nome_completo: charge.name,
    descricao: charge.description,
    valor: brl(charge.amount),
    vencimento: brDate(charge.due_date),
    dias: days === 0 ? 'hoje' : days === 1 ? 'amanhã' : days === -1 ? 'há 1 dia' : days < 0 ? `há ${-days} dias` : `em ${days} dias`,
    atraso: String(Math.max(0, -days)),
    pix: settings.pix_key,
    favorecido: settings.pix_name,
  };
  const tpl = days < 0 && settings.overdue_template ? settings.overdue_template : settings.template;
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}

export async function runReminders({ dryRun = false } = {}) {
  const t = today();
  const settings = getSettings();
  const charges = db.prepare(`
    SELECT c.*, cl.name, cl.phone FROM charges c JOIN clients cl ON cl.id = c.client_id
    WHERE c.active = 1`).all();
  const overdue = (settings.overdue_days || '').split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0);
  const done = db.prepare('SELECT 1 FROM send_log WHERE charge_id = ? AND due_date = ? AND offset_days = ? AND status = ?');
  const log = db.prepare(`INSERT INTO send_log (charge_id, due_date, offset_days, status, error) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(charge_id, due_date, offset_days) DO UPDATE SET status = excluded.status, error = excluded.error, sent_at = datetime('now','localtime')`);
  const results = [];

  for (const c of charges) {
    const days = daysBetween(t, c.due_date);
    const offsets = c.offsets.split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
    // Antes do vencimento: dias da cobrança; depois: dias de atraso (gravados negativos no log)
    if (days >= 0 ? !offsets.includes(days) : !overdue.includes(-days)) continue;
    if (done.get(c.id, c.due_date, days, 'sent')) continue;
    const text = renderMessage(c, days, settings);
    if (dryRun) { results.push({ charge: c.id, name: c.name, days, text }); continue; }
    try {
      await sendText(c.phone, text);
      log.run(c.id, c.due_date, days, 'sent', null);
      results.push({ charge: c.id, name: c.name, days, status: 'sent' });
    } catch (e) {
      log.run(c.id, c.due_date, days, 'error', e.message);
      results.push({ charge: c.id, name: c.name, days, status: 'error', error: e.message });
    }
    await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000)); // espaça envios p/ evitar ban
  }
  console.log(`[${new Date().toLocaleString('pt-BR')}] lembretes:`, results.length ? results : 'nenhum hoje');
  return results;
}

export function startScheduler() {
  // Roda de hora em hora; envia só na hora configurada (ou depois, se perdeu — log impede duplicar)
  cron.schedule('5 * * * *', () => {
    const s = getSettings();
    if (s.auto_send !== '1') return;
    if (new Date().getHours() >= Number(s.send_hour || 9)) runReminders().catch(console.error);
  });
}
