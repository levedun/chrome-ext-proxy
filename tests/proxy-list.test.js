import { describe, expect, it } from 'vitest';
import {
  defaultProfileName,
  mergeImportedProfiles,
  parseProxyLine,
  parseProxyList,
  serializeProfiles
} from '../src/lib/proxy-list.js';

describe('defaultProfileName', () => {
  it('собирает socks4_{ip}', () => {
    expect(defaultProfileName('socks4', '213.165.54.5')).toBe('socks4_213.165.54.5');
    expect(defaultProfileName('socks5', '10.0.0.1')).toBe('socks5_10.0.0.1');
    expect(defaultProfileName('http', '1.2.3.4')).toBe('http_1.2.3.4');
  });
});

describe('parseProxyLine', () => {
  it('парсит TYPE host:port', () => {
    expect(parseProxyLine('SOCKS5 213.165.54.5:1080')).toEqual({
      type: 'socks5',
      host: '213.165.54.5',
      port: '1080',
      name: 'socks5_213.165.54.5'
    });
  });

  it('маппит HTTPS → http и SOCKS4 → socks4', () => {
    expect(parseProxyLine('HTTPS 95.81.107.187:3128').type).toBe('http');
    expect(parseProxyLine('SOCKS4 85.237.62.189:3629')).toMatchObject({
      type: 'socks4',
      name: 'socks4_85.237.62.189'
    });
  });

  it('парсит URI', () => {
    expect(parseProxyLine('socks5://10.0.0.2:1080').host).toBe('10.0.0.2');
  });

  it('игнорирует комментарии и мусор', () => {
    expect(parseProxyLine('# comment')).toBeNull();
    expect(parseProxyLine('')).toBeNull();
    expect(parseProxyLine('not-a-proxy')).toBeNull();
  });
});

describe('parseProxyList / serialize / merge', () => {
  it('сериализует и парсит обратно', () => {
    const text = serializeProfiles([
      { id: 'default', type: 'none', name: 'Без прокси' },
      { id: '1', type: 'socks4', host: '1.1.1.1', port: '1080', name: 'socks4_1.1.1.1' }
    ]);
    expect(text).toBe('SOCKS4 1.1.1.1:1080');
    expect(parseProxyList(text)[0].name).toBe('socks4_1.1.1.1');
  });

  it('merge пропускает дубликаты адреса', () => {
    const existing = [
      { id: 'default', type: 'none', name: 'Без прокси' },
      { id: '1', type: 'socks5', host: '1.1.1.1', port: '1080', name: 'socks5_1.1.1.1' }
    ];
    const imported = parseProxyList('SOCKS5 1.1.1.1:1080\nHTTP 2.2.2.2:8080');
    const { added, skipped, profiles } = mergeImportedProfiles(existing, imported);
    expect(added).toBe(1);
    expect(skipped).toBe(1);
    expect(profiles.some((p) => p.name === 'http_2.2.2.2')).toBe(true);
  });
});
