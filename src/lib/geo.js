/** Приватные / локальные хосты — без geo */
export function isLocalHost(host) {
  const h = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h === '::1') return true;
  if (h.startsWith('127.')) return true;
  if (h.startsWith('10.')) return true;
  if (h.startsWith('192.168.')) return true;
  if (h.startsWith('169.254.')) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

/** ISO 3166-1 alpha-2 → emoji-флаг */
export function countryFlagEmoji(countryCode) {
  const cc = String(countryCode || '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0)));
}

/**
 * Страна по IP (HTTPS ipwho.is). Для локальных — local: true.
 * @param {string} host
 * @param {{ fetchFn?: typeof fetch }} [opts]
 * @returns {Promise<{ countryCode: string|null, country: string|null, local: boolean }>}
 */
export async function lookupCountry(host, opts = {}) {
  const fetchFn = opts.fetchFn || fetch;

  if (isLocalHost(host)) {
    return { countryCode: null, country: null, local: true };
  }

  // hostname (не IP) — всё равно спрашиваем API
  const url = `https://ipwho.is/${encodeURIComponent(host)}`;
  try {
    const res = await fetchFn(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      return { countryCode: null, country: null, local: false };
    }
    const data = await res.json();
    if (!data || data.success === false) {
      return { countryCode: null, country: null, local: false };
    }
    const code = data.country_code || data.countryCode || null;
    return {
      countryCode: code ? String(code).toUpperCase() : null,
      country: data.country ? String(data.country) : null,
      local: false
    };
  } catch {
    return { countryCode: null, country: null, local: false };
  }
}
