import { describe, expect, it, vi } from 'vitest';
import { countryFlagEmoji, isLocalHost, lookupCountry } from '../src/lib/geo.js';

describe('isLocalHost', () => {
  it('распознаёт localhost и приватные сети', () => {
    expect(isLocalHost('127.0.0.1')).toBe(true);
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('10.0.0.2')).toBe(true);
    expect(isLocalHost('192.168.1.1')).toBe(true);
    expect(isLocalHost('172.16.5.1')).toBe(true);
    expect(isLocalHost('8.8.8.8')).toBe(false);
  });
});

describe('countryFlagEmoji', () => {
  it('собирает флаг из кода страны', () => {
    expect(countryFlagEmoji('US')).toBe('🇺🇸');
    expect(countryFlagEmoji('de')).toBe('🇩🇪');
    expect(countryFlagEmoji('')).toBe('');
    expect(countryFlagEmoji('XXX')).toBe('');
  });
});

describe('lookupCountry', () => {
  it('для локального не ходит в сеть', async () => {
    const fetchFn = vi.fn();
    const res = await lookupCountry('127.0.0.1', { fetchFn });
    expect(res).toEqual({ countryCode: null, country: null, local: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('парсит ответ ipwho.is', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        country: 'Germany',
        country_code: 'DE'
      })
    }));
    const res = await lookupCountry('1.2.3.4', { fetchFn });
    expect(res).toEqual({ countryCode: 'DE', country: 'Germany', local: false });
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
