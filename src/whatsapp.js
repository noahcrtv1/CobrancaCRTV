// Cliente mínimo da Evolution API v2
const URL = (process.env.EVOLUTION_URL || 'http://localhost:8080').replace(/\/$/, '');
const KEY = process.env.EVOLUTION_API_KEY || '';
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'cobranca';

async function call(method, path, body) {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

export const isGroup = (id) => /^[\d-]+@g\.us$/.test(String(id).trim());

export function normalizePhone(phone) {
  if (isGroup(phone)) return String(phone).trim(); // grupo: envia direto pelo ID
  let d = String(phone).replace(/\D/g, '');
  if (String(phone).trim().startsWith('+')) return d; // internacional: já vem com código do país
  if (d.length === 10 || d.length === 11) d = '55' + d; // DDD + número, sem DDI
  return d;
}

export async function status() {
  try {
    const r = await call('GET', `/instance/connectionState/${INSTANCE}`);
    return r?.instance?.state || 'unknown';
  } catch (e) {
    if (String(e.message).includes('404')) return 'not_created';
    return 'offline';
  }
}

// Cria a instância se preciso e devolve QR code em base64
export async function connect() {
  if ((await status()) === 'not_created') {
    await call('POST', '/instance/create', { instanceName: INSTANCE, integration: 'WHATSAPP-BAILEYS', qrcode: true });
  }
  return call('GET', `/instance/connect/${INSTANCE}`);
}

export async function logout() {
  return call('DELETE', `/instance/logout/${INSTANCE}`);
}

export async function sendText(phone, text) {
  return call('POST', `/message/sendText/${INSTANCE}`, { number: normalizePhone(phone), text });
}

// Grupos em que o número conectado participa
export async function groups() {
  const r = await call('GET', `/group/fetchAllGroups/${INSTANCE}?getParticipants=false`);
  return (Array.isArray(r) ? r : []).map((g) => ({ id: g.id, name: g.subject || g.id, size: g.size }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
