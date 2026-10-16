import {
  loadProfiles,
  saveProfiles,
  activateProfile,
  getActiveProfile,
  stopProxy
} from './lib/profiles.js';
import { setProxy, clearProxy, getProxyStatus } from './lib/proxy.js';

// Полиfill для Firefox (если будешь портировать)
if (typeof browser !== 'undefined') {
  globalThis.chrome = browser;
}

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
  }

  return true; // асинхронный ответ
});
