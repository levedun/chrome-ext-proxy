import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeMock } from './chrome-mock.js';
import {
  checkAllProfiles,
  createEmptyHealth,
  isProfileSwitchable,
  probeProfile
} from '../src/lib/health.js';

describe('isProfileSwitchable', () => {
  it('разрешает без проверки и при ok', () => {
    expect(isProfileSwitchable({}, '1')).toBe(true);
    expect(isProfileSwitchable({ '1': { ok: true, ms: 10 } }, '1')).toBe(true);
  });

  it('блокирует при fail', () => {
    expect(isProfileSwitchable({ '1': { ok: false, ms: 5000 } }, '1')).toBe(false);
  });
});

describe('probeProfile / checkAllProfiles', () => {
  beforeEach(() => {
    installChromeMock();
  });

  it('probeProfile считает ok при 204', async () => {
    const fetchFn = vi.fn(async () => ({ status: 204, type: 'basic' }));
    const result = await probeProfile(
      { id: '1', type: 'http', host: '1.1.1.1', port: '8080' },
      { fetchFn, settleMs: 0, timeoutMs: 1000 }
    );
    expect(result.ok).toBe(true);
    expect(result.ms).toBeGreaterThanOrEqual(0);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('probeProfile fail при ошибке сети', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('net');
    });
    const result = await probeProfile(
      { id: '1', type: 'socks5', host: '2.2.2.2', port: '1080' },
      { fetchFn, settleMs: 0, timeoutMs: 1000 }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('net');
  });

  it('checkAllProfiles пишет byId и восстанавливает direct при fail активного', async () => {
    let n = 0;
    const fetchFn = vi.fn(async () => {
      n += 1;
      if (n === 1) return { status: 204, type: 'basic' };
      throw new Error('dead');
    });

    const profiles = [
      { id: 'default', type: 'none', name: 'Без прокси' },
      { id: 'a', type: 'http', host: '1.1.1.1', port: '80' },
      { id: 'b', type: 'socks5', host: '2.2.2.2', port: '1080' }
    ];

    const health = await checkAllProfiles(profiles, 'b', {
      fetchFn,
      settleMs: 0,
      timeoutMs: 500
    });

    expect(health.byId.a.ok).toBe(true);
    expect(health.byId.b.ok).toBe(false);
    expect(health.running).toBe(false);
    expect(chrome.proxy.settings._getValue().mode).toBe('system');
  });

  it('createEmptyHealth', () => {
    expect(createEmptyHealth()).toEqual({ running: false, checkedAt: null, byId: {} });
  });
});
