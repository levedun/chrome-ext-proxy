export const PROFILES_KEY = 'proxy_profiles';
export const ACTIVE_KEY = 'active_profile';
export const MIGRATED_KEY = 'storage_migrated_from_sync';

export const DEFAULT_PROFILE = {
  id: 'default',
  name: 'Без прокси',
  type: 'none'
};

/** Одноразовый перенос из sync → local (и очистка sync) */
export async function migrateFromSyncIfNeeded() {
  const localMeta = await chrome.storage.local.get(MIGRATED_KEY);
  if (localMeta[MIGRATED_KEY]) return;

  const syncData = await chrome.storage.sync.get([PROFILES_KEY, ACTIVE_KEY]);
  const localData = await chrome.storage.local.get([PROFILES_KEY, ACTIVE_KEY]);
  const patch = {};

  if (syncData[PROFILES_KEY] && !localData[PROFILES_KEY]) {
    patch[PROFILES_KEY] = syncData[PROFILES_KEY];
  }
  if (syncData[ACTIVE_KEY] && !localData[ACTIVE_KEY]) {
    patch[ACTIVE_KEY] = syncData[ACTIVE_KEY];
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }

  await chrome.storage.sync.remove([PROFILES_KEY, ACTIVE_KEY]);
  await chrome.storage.local.set({ [MIGRATED_KEY]: true });
}

function dedupeById(profiles) {
  const seenIds = new Set();
  return profiles.filter((p) => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });
}

/** Нормализация списка: один дефолтный «Без прокси» первым */
export function normalizeProfiles(profiles) {
  const cleaned = dedupeById(profiles || []);
  const defaultProfile =
    cleaned.find((p) => p.id === 'default' && p.type === 'none') || DEFAULT_PROFILE;
  const withoutNone = cleaned.filter((p) => p.id !== 'default' && p.type !== 'none');
  return [defaultProfile, ...withoutNone];
}

export async function loadProfiles() {
  await migrateFromSyncIfNeeded();
  const data = await chrome.storage.local.get(PROFILES_KEY);
  const profiles = normalizeProfiles(data[PROFILES_KEY] || []);
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles });
  return profiles;
}

export async function saveProfiles(profiles) {
  const normalized = normalizeProfiles(profiles);
  await chrome.storage.local.set({ [PROFILES_KEY]: normalized });
  return normalized;
}

export async function activateProfile(id, setProxy) {
  const profiles = await loadProfiles();
  const profile = profiles.find((p) => p.id === id);
  await setProxy(profile);
  await chrome.storage.local.set({ [ACTIVE_KEY]: id });
  return profile;
}

export async function getActiveProfile() {
  await migrateFromSyncIfNeeded();
  const data = await chrome.storage.local.get(ACTIVE_KEY);
  const activeId = data[ACTIVE_KEY] || 'default';
  const profiles = await loadProfiles();
  return profiles.find((p) => p.id === activeId) || profiles[0];
}

export async function stopProxy(clearProxy) {
  await clearProxy();
  await chrome.storage.local.set({ [ACTIVE_KEY]: 'default' });
}
