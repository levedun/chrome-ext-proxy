import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeMock } from './chrome-mock.js';
import {
  ACTIVE_KEY,
  MIGRATED_KEY,
  PROFILES_KEY,
  activateProfile,
  getActiveProfile,
  loadProfiles,
  migrateFromSyncIfNeeded,
  normalizeProfiles,
  saveProfiles,
  stopProxy
} from '../src/lib/profiles.js';
import { clearProxy, setProxy } from '../src/lib/proxy.js';

describe('normalizeProfiles', () => {
  it('добавляет дефолтный профиль первым', () => {
    const result = normalizeProfiles([
      { id: '1', name: 'Work', type: 'http', host: '1.1.1.1', port: '8080' }
    ]);
    expect(result[0]).toEqual({ id: 'default', name: 'Без прокси', type: 'none' });
    expect(result).toHaveLength(2);
  });

  it('удаляет дубликаты по id и лишние type=none', () => {
    const result = normalizeProfiles([
      { id: '1', name: 'A', type: 'http', host: '1.1.1.1', port: '80' },
      { id: '1', name: 'A-dup', type: 'http', host: '1.1.1.1', port: '80' },
      { id: 'x', name: 'Off', type: 'none' },
      { id: 'default', name: 'Без прокси', type: 'none' },
      { id: 'default2', name: 'Без прокси', type: 'none' }
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'default', name: 'Без прокси', type: 'none' });
    expect(result[1].name).toBe('A');
  });

  it('оставляет ровно один дефолт даже при нескольких none', () => {
    const result = normalizeProfiles([
      { id: 'default', name: 'Без прокси', type: 'none' },
      { id: 'other', name: 'Без прокси', type: 'none' }
    ]);
    expect(result).toEqual([{ id: 'default', name: 'Без прокси', type: 'none' }]);
  });
});

describe('storage: local only + migration', () => {
  let chrome;

  beforeEach(() => {
    chrome = installChromeMock();
  });

  it('мигрирует данные из sync в local и чистит sync', async () => {
    await chrome.storage.sync.set({
      [PROFILES_KEY]: [
        { id: 'default', name: 'Без прокси', type: 'none' },
        { id: 'p1', name: 'VPN', type: 'socks5', host: '10.0.0.1', port: '1080' }
      ],
      [ACTIVE_KEY]: 'p1'
    });

    await migrateFromSyncIfNeeded();

    const local = await chrome.storage.local.get([PROFILES_KEY, ACTIVE_KEY, MIGRATED_KEY]);
    const sync = await chrome.storage.sync.get([PROFILES_KEY, ACTIVE_KEY]);

    expect(local[MIGRATED_KEY]).toBe(true);
    expect(local[PROFILES_KEY]).toHaveLength(2);
    expect(local[ACTIVE_KEY]).toBe('p1');
    expect(sync[PROFILES_KEY]).toBeUndefined();
    expect(sync[ACTIVE_KEY]).toBeUndefined();
  });

  it('saveProfiles пишет только в local, не в sync', async () => {
    await saveProfiles([
      { id: 'p1', name: 'Office', type: 'http', host: '192.168.1.1', port: '3128' }
    ]);

    const local = await chrome.storage.local.get(PROFILES_KEY);
    const sync = await chrome.storage.sync.get(PROFILES_KEY);

    expect(local[PROFILES_KEY].some((p) => p.id === 'p1')).toBe(true);
    expect(sync[PROFILES_KEY]).toBeUndefined();
    expect(chrome.storage.sync._store.size).toBe(0);
  });

  it('loadProfiles сохраняет нормализованный список в local', async () => {
    await chrome.storage.local.set({
      [PROFILES_KEY]: [
        { id: 'p1', name: 'A', type: 'http', host: '1.2.3.4', port: '8080' },
        { id: 'p1', name: 'A-dup', type: 'http', host: '1.2.3.4', port: '8080' }
      ]
    });

    const profiles = await loadProfiles();
    expect(profiles).toHaveLength(2);
    expect(profiles[0].id).toBe('default');

    const stored = await chrome.storage.local.get(PROFILES_KEY);
    expect(stored[PROFILES_KEY]).toHaveLength(2);
  });

  it('activateProfile и getActiveProfile работают через local', async () => {
    await saveProfiles([
      { id: 'p1', name: 'A', type: 'http', host: '8.8.8.8', port: '8080' }
    ]);

    await activateProfile('p1', setProxy);
    const active = await getActiveProfile();

    expect(active.id).toBe('p1');
    expect(chrome.proxy.settings._getValue().mode).toBe('fixed_servers');
    expect(chrome.proxy.settings._getValue().rules.singleProxy.host).toBe('8.8.8.8');
  });

  it('stopProxy сбрасывает прокси и active в default', async () => {
    await chrome.storage.local.set({ [ACTIVE_KEY]: 'p1' });
    chrome.proxy.settings.set({
      value: { mode: 'fixed_servers' },
      scope: 'regular'
    });

    await stopProxy(clearProxy);

    const data = await chrome.storage.local.get(ACTIVE_KEY);
    expect(data[ACTIVE_KEY]).toBe('default');
    expect(chrome.proxy.settings._getValue().mode).toBe('system');
  });
});
