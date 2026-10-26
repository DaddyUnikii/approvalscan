export const MAX_UINT = (1n << 256n) - 1n;
export const UNLIMITED_FLOOR = 1n << 255n; // anything this large is "infinite" in practice

export const strip = (h) => (h.startsWith('0x') ? h.slice(2) : h);
export const isAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(a);
export const pad32 = (h) => strip(h).toLowerCase().padStart(64, '0');
export const topicToAddress = (t) => '0x' + strip(t).slice(-40).toLowerCase();
export const toBig = (h) => (!h || strip(h) === '' ? 0n : BigInt('0x' + strip(h)));
export const word = (h, i) => strip(h).slice(i * 64, i * 64 + 64);

export function encodeCall(selector, ...args) {
  return selector + args.map((a) => (typeof a === 'bigint' ? a.toString(16).padStart(64, '0') : pad32(a))).join('');
}

// Decodes an ABI string return value, or a bytes32 string (old tokens like MKR).
export function decodeString(h) {
  const s = strip(h || '');
  if (!s) return null;
  try {
    if (s.length >= 128) {
      const off = Number(BigInt('0x' + s.slice(0, 64)));
      const len = Number(BigInt('0x' + s.slice(off * 2, off * 2 + 64)));
      if (len > 0 && len < 256) return clean(Buffer.from(s.slice(off * 2 + 64, off * 2 + 64 + len * 2), 'hex').toString('utf8'));
    }
    return clean(Buffer.from(s.slice(0, 64), 'hex').toString('utf8').replace(/\0+$/, '')) || null;
  } catch { return null; }
}
const clean = (t) => t.replace(/[\u0000-\u001f\u007f]/g, '').trim();

export function formatUnits(v, decimals = 18, maxFrac = 4) {
  const d = BigInt(decimals);
  const base = 10n ** d;
  const whole = v / base;
  let frac = (v % base).toString().padStart(Number(d), '0').slice(0, maxFrac).replace(/0+$/, '');
  return whole.toLocaleString('en-US') + (frac ? '.' + frac : '');
}
