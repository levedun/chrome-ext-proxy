import {
  loadProfiles,
  saveProfiles,
  activateProfile,
  getActiveProfile,
  stopProxy,
  ACTIVE_KEY
} from './lib/profiles.js';
import { setProxy, clearProxy, getProxyStatus } from './lib/proxy.js';
import { checkAllProfiles, loadHealth } from './lib/health.js';

// Полиfill для Firefox (если будешь портировать)
if (typeof browser !== 'undefined') {
  globalThis.chrome = browser;
}

let healthCheckPromise = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getProfiles') {
    loadProfiles().then((profiles) => sendResponse({ profiles }));
  } else if (msg.action === 'getActive') {
    getActiveProfile().then((profile) => sendResponse({ profile }));
  } else if (msg.action === 'activate') {
    activateProfile(msg.id, setProxy).then(() => sendResponse({ success: true }));
  } else if (msg.action === 'saveProfiles') {
    saveProfiles(msg.profiles).then(() => sendResponse({ success: true }));
  } else if (msg.action === 'getProxyStatus') {
    getProxyStatus().then((status) => sendResponse(status));
  } else if (msg.action === 'stopProxy') {
    stopProxy(clearProxy).then(() => sendResponse({ success: true }));
  } else if (msg.action === 'getHealth') {
    loadHealth().then((health) => sendResponse({ health }));
  } else if (msg.action === 'checkProxies') {
    if (healthCheckPromise) {
      healthCheckPromise.then((health) => sendResponse({ health, alreadyRunning: true }));
      return true;
    }

    healthCheckPromise = (async () => {
      const profiles = await loadProfiles();
      const activeData = await chrome.storage.local.get(ACTIVE_KEY);
      const activeId = activeData[ACTIVE_KEY] || 'default';
      return checkAllProfiles(profiles, activeId);
    })()
      .then((health) => {
        healthCheckPromise = null;
        return health;
      })
      .catch(async (err) => {
        healthCheckPromise = null;
        const health = await loadHealth();
        health.running = false;
        await chrome.storage.local.set({ proxy_health_running: false });
        throw err;
      });

    healthCheckPromise
      .then((health) => sendResponse({ health, alreadyRunning: false }))
      .catch((err) => sendResponse({ error: String(err?.message || err) }));
  }

  return true; // асинхронный ответ
});
