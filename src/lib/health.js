import { buildProxyConfig } from './proxy.js';

export const HEALTH_KEY = 'proxy_health';
export const HEALTH_RUNNING_KEY = 'proxy_health_running';

/** Лёгкий endpoint без тела; запрос идёт через текущий chrome.proxy */
export const CHECK_URL = 'https://www.gstatic.com/generate_204';
export const CHECK_TIMEOUT_MS = 5000;
export const PROXY_SETTLE_MS = 200;

export function createEmptyHealth() {
  return { running: false, checkedAt: null, byId: {} };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyProxySettings(profile) {
  return new Promise((resolve) => {
    const config = buildProxyConfig(profile);
    if (!config) {
      chrome.proxy.settings.clear({ scope: 'regular' }, () => resolve());
      return;
    }
    chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => resolve());
  });
}

/**
 * Один прокси: set → fetch → результат { ok, ms, error? }
 * @param {object} profile
 * @param {{ fetchFn?: typeof fetch, timeoutMs?: number, settleMs?: number }} [opts]
 */
export async function probeProfile(profile, opts = {}) {
  const fetchFn = opts.fetchFn || fetch;
  const timeoutMs = opts.timeoutMs ?? CHECK_TIMEOUT_MS;
  const settleMs = opts.settleMs ?? PROXY_SETTLE_MS;

  await applyProxySettings(profile);
  await delay(settleMs);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const res = await fetchFn(CHECK_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      redirect: 'manual'
    });
    const ms = Date.now() - started;
    // 204 или любой ответ через прокси = живой канал
    const ok = res.type === 'opaqueredirect' || (res.status >= 200 && res.status < 500);
    return ok
      ? { ok: true, ms, error: null }
      : { ok: false, ms, error: `HTTP ${res.status}` };
  } catch (err) {
    const ms = Date.now() - started;
    const error = err && err.name === 'AbortError' ? 'timeout' : String(err?.message || err);
    return { ok: false, ms, error };
  } finally {
    clearTimeout(timer);
  }
}

export async function loadHealth() {
  const data = await chrome.storage.local.get([HEALTH_KEY, HEALTH_RUNNING_KEY]);
  const stored = data[HEALTH_KEY] || createEmptyHealth();
  return {
    ...createEmptyHealth(),
    ...stored,
    running: Boolean(data[HEALTH_RUNNING_KEY]),
    byId: stored.byId || {}
  };
}

export async function saveHealth(health) {
  await chrome.storage.local.set({
    [HEALTH_KEY]: {
      checkedAt: health.checkedAt,
      byId: health.byId || {}
    },
    [HEALTH_RUNNING_KEY]: Boolean(health.running)
  });
  return health;
}

/**
 * Проверить все кастомные профили, восстановить activeId.
 * @param {object[]} profiles
 * @param {string} activeId
 * @param {{ onProgress?: (health) => void, fetchFn?: typeof fetch }} [opts]
 */
export async function checkAllProfiles(profiles, activeId, opts = {}) {
  const customs = (profiles || []).filter((p) => p && p.id !== 'default' && p.type !== 'none');
  const health = {
    running: true,
    checkedAt: null,
    byId: { ...(await loadHealth()).byId }
  };
  await saveHealth(health);
  if (opts.onProgress) opts.onProgress(health);

  for (const profile of customs) {
    const result = await probeProfile(profile, opts);
    health.byId[profile.id] = {
      ok: result.ok,
      ms: result.ms,
      error: result.error,
      checkedAt: Date.now()
    };
    await saveHealth(health);
    if (opts.onProgress) opts.onProgress(health);
  }

  // Восстановить прежнее соединение
  const restore = (profiles || []).find((p) => p.id === activeId);
  if (restore && restore.type !== 'none' && health.byId[restore.id]?.ok !== false) {
    await applyProxySettings(restore);
  } else {
    await applyProxySettings({ type: 'none' });
    await chrome.storage.local.set({ active_profile: 'default' });
  }

  health.running = false;
  health.checkedAt = Date.now();
  await saveHealth(health);
  if (opts.onProgress) opts.onProgress(health);
  return health;
}

export function isProfileSwitchable(healthById, profileId) {
  const entry = healthById && healthById[profileId];
  if (!entry) return true;
  return entry.ok !== false;
}
