import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  iconPathsFor,
  isProxyConnected,
  updateActionIcon,
  updateActionIconForProfile
} from '../src/lib/action-icon.js';
import { installChromeMock } from './chrome-mock.js';

describe('isProxyConnected / iconPathsFor', () => {
  it('default/none — не подключено', () => {
    expect(isProxyConnected(null)).toBe(false);
    expect(isProxyConnected({ type: 'none' })).toBe(false);
    expect(isProxyConnected({ id: 'default', type: 'none' })).toBe(false);
  });

  it('http/socks — подключено', () => {
    expect(isProxyConnected({ type: 'http', host: '1.1.1.1', port: '80' })).toBe(true);
    expect(isProxyConnected({ type: 'socks5' })).toBe(true);
  });

  it('пути иконок отличаются', () => {
    const off = iconPathsFor(false);
    const on = iconPathsFor(true);
    expect(off[16]).toContain('icon16.png');
    expect(on[16]).toContain('icon16-on.png');
    expect(off[16]).not.toBe(on[16]);
  });
});

describe('updateActionIcon', () => {
  beforeEach(() => {
    const chrome = installChromeMock();
    chrome.action = {
      setIcon: vi.fn(async () => {})
    };
  });

  it('ставит on-иконки при connected', async () => {
    await updateActionIcon(true);
    expect(chrome.action.setIcon).toHaveBeenCalledWith({
      path: iconPathsFor(true)
    });
  });

  it('ставит off-иконки при disconnected', async () => {
    await updateActionIconForProfile({ type: 'none' });
    expect(chrome.action.setIcon).toHaveBeenCalledWith({
      path: iconPathsFor(false)
    });
  });
});
