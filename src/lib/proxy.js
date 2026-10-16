/** Собрать конфиг chrome.proxy.settings для профиля */
export function buildProxyConfig(profile) {
  if (!profile || profile.type === 'none') {
    return null;
  }

  const scheme =
    profile.type === 'socks5' || profile.type === 'socks4' ? profile.type : 'http';

  return {
    mode: 'fixed_servers',
    rules: {
      singleProxy: {
        scheme,
        host: profile.host,
        port: parseInt(profile.port, 10)
      },
      bypassList: ['localhost', '127.0.0.1']
    }
  };
}

export async function setProxy(profile) {
  const config = buildProxyConfig(profile);
  if (!config) {
    chrome.proxy.settings.clear({ scope: 'regular' });
    return;
  }
  chrome.proxy.settings.set({ value: config, scope: 'regular' });
}

export async function clearProxy() {
  chrome.proxy.settings.clear({ scope: 'regular' });
}

export async function getProxyStatus() {
  return new Promise((resolve) => {
    chrome.proxy.settings.get({}, (details) => {
      const isActive =
        details.value &&
        details.value.mode !== 'direct' &&
        details.value.mode !== 'system';
      resolve({ active: isActive, config: details.value });
    });
  });
}
