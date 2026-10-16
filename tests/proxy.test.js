import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeMock } from './chrome-mock.js';
import { buildProxyConfig, clearProxy, getProxyStatus, setProxy } from '../src/lib/proxy.js';

describe('buildProxyConfig', () => {
  it('возвращает null для none / пустого профиля', () => {
    expect(buildProxyConfig(null)).toBeNull();
    expect(buildProxyConfig({ type: 'none' })).toBeNull();
  });

  it('собирает http-конфиг', () => {
    expect(
      buildProxyConfig({ type: 'http', host: '1.2.3.4', port: '8080' })
    ).toEqual({
      mode: 'fixed_servers',
      rules: {
        singleProxy: { scheme: 'http', host: '1.2.3.4', port: 8080 },
        bypassList: ['localhost', '127.0.0.1']
      }
    });
  });

  it('собирает socks5-конфиг', () => {
    const config = buildProxyConfig({ type: 'socks5', host: '10.0.0.2', port: '1080' });
    expect(config.rules.singleProxy.scheme).toBe('socks5');
    expect(config.rules.singleProxy.port).toBe(1080);
  });
});

describe('setProxy / clearProxy / getProxyStatus', () => {
  let chrome;

  beforeEach(() => {
    chrome = installChromeMock();
  });

  it('setProxy(none) вызывает clear', async () => {
    chrome.proxy.settings.set({ value: { mode: 'fixed_servers' }, scope: 'regular' });
    await setProxy({ type: 'none' });
    expect(chrome.proxy.settings._getValue().mode).toBe('system');
  });

  it('setProxy ставит fixed_servers', async () => {
    await setProxy({ type: 'http', host: '9.9.9.9', port: '3128' });
    const value = chrome.proxy.settings._getValue();
    expect(value.mode).toBe('fixed_servers');
    expect(value.rules.singleProxy.host).toBe('9.9.9.9');
  });

  it('getProxyStatus отражает активность', async () => {
    expect((await getProxyStatus()).active).toBe(false);
    await setProxy({ type: 'http', host: '1.1.1.1', port: '80' });
    expect((await getProxyStatus()).active).toBe(true);
    await clearProxy();
    expect((await getProxyStatus()).active).toBe(false);
  });
});
