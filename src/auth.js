import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(s) {
  let bits = '';
  for (const ch of s.replace(/=+$|\s/g, '').toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('TOTP_SECRET inválido');
    bits += v.toString(2).padStart(5, '0');
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

export function generateSecret() {
  return [...crypto.randomBytes(20)].map((b) => B32[b % 32]).join('');
}

// RFC 6238: código de 6 dígitos, janela de 30s
function totp(key, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

const usedCodes = new Map(); // impede reusar o mesmo código
export function verifyTotp(secret, code) {
  if (!/^\d{6}$/.test(code || '')) return false;
  const key = base32Decode(secret);
  const now = Math.floor(Date.now() / 30000);
  for (const step of [now - 1, now, now + 1]) {
    if (safeEq(totp(key, step), code)) {
      if (usedCodes.get(code) >= step) return false;
      usedCodes.set(code, step);
      for (const [c, s] of usedCodes) if (s < now - 2) usedCodes.delete(c);
      return true;
    }
  }
  return false;
}

export function safeEq(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Sessão em cookie assinado (HMAC), expira em 12h
const TTL = 12 * 3600e3;
export function signSession(secret) {
  const exp = Date.now() + TTL;
  const mac = crypto.createHmac('sha256', secret).update(String(exp)).digest('base64url');
  return `${exp}.${mac}`;
}
export function checkSession(secret, value) {
  const [exp, mac] = String(value || '').split('.');
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  return safeEq(crypto.createHmac('sha256', secret).update(exp).digest('base64url'), mac);
}
