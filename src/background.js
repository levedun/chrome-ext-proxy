// Полиfill для Firefox (если будешь портировать)
if (typeof browser !== 'undefined') {
    globalThis.chrome = browser;
  }
  
  // Хранилище профилей
  const PROFILES_KEY = 'proxy_profiles';
  const ACTIVE_KEY = 'active_profile';
  
  // Получить текущий статус прокси
  async function getProxyStatus() {
    return new Promise((resolve) => {
      chrome.proxy.settings.get({}, (details) => {
        const isActive = details.value && 
          details.value.mode !== 'direct' && 
          details.value.mode !== 'system';
        resolve({ active: isActive, config: details.value });
      });
    });
  }
  
  // Установить прокси
  async function setProxy(profile) {
    if (!profile || profile.type === 'none') {
      chrome.proxy.settings.clear({ scope: 'regular' });
      return;
    }
  
    const config = {
      mode: 'fixed_servers',
      rules: {
        singleProxy: {
          scheme: profile.type === 'socks5' ? 'socks5' : 'http',
          host: profile.host,
          port: parseInt(profile.port)
        },
        bypassList: ['localhost', '127.0.0.1']
      }
    };
  
    chrome.proxy.settings.set({ value: config, scope: 'regular' });
  }
  
  // Загрузить профили
  async function loadProfiles() {
    const data = await chrome.storage.sync.get(PROFILES_KEY);
    let profiles = data[PROFILES_KEY] || [];
    
    // Удалить дубликаты по ID
    const seenIds = new Set();
    profiles = profiles.filter(p => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });
    
    // Найти дефолтный профиль (если есть)
    const defaultProfile = profiles.find(p => p.id === 'default' && p.type === 'none');
    
    // Удалить ВСЕ профили типа "none" (включая все дубликаты дефолтного)
    profiles = profiles.filter(p => p.type !== 'none');
    
    // Добавить дефолтный профиль первым (один раз)
    const finalDefault = defaultProfile || { id: 'default', name: 'Без прокси', type: 'none' };
    profiles.unshift(finalDefault);
    
    // Сохранить обратно
    await chrome.storage.sync.set({ [PROFILES_KEY]: profiles });
    
    return profiles;
  }
  
  // Сохранить профили
  async function saveProfiles(profiles) {
    // Удалить дубликаты по ID
    const seenIds = new Set();
    const cleaned = profiles.filter(p => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });
    
    // Убедиться, что первый элемент - это "Без прокси" с id='default'
    const defaultProfile = { id: 'default', name: 'Без прокси', type: 'none' };
    
    // Удалить все старые "Без прокси" профили
    const withoutNone = cleaned.filter(p => p.id !== 'default' && p.type !== 'none');
    
    // Добавить дефолтный профиль первым
    withoutNone.unshift(defaultProfile);
    
    await chrome.storage.sync.set({ [PROFILES_KEY]: withoutNone });
  }
  
  // Активировать профиль
  async function activateProfile(id) {
    const profiles = await loadProfiles();
    const profile = profiles.find(p => p.id === id);
    await setProxy(profile);
    await chrome.storage.sync.set({ [ACTIVE_KEY]: id });
  }
  
  // Получить активный профиль
  async function getActiveProfile() {
    const data = await chrome.storage.sync.get(ACTIVE_KEY);
    const activeId = data[ACTIVE_KEY] || 'default';
    const profiles = await loadProfiles();
    return profiles.find(p => p.id === activeId) || profiles[0];
  }

  // Остановить прокси (отключить)
  async function stopProxy() {
    chrome.proxy.settings.clear({ scope: 'regular' });
    await chrome.storage.sync.set({ [ACTIVE_KEY]: 'default' });
  }
  
// Слушаем сообщения из popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'getProfiles') {
      loadProfiles().then(profiles => sendResponse({ profiles }));
    } else if (msg.action === 'getActive') {
      getActiveProfile().then(profile => sendResponse({ profile }));
    } else if (msg.action === 'activate') {
      activateProfile(msg.id).then(() => sendResponse({ success: true }));
    } else if (msg.action === 'saveProfiles') {
      saveProfiles(msg.profiles).then(() => sendResponse({ success: true }));
    } else if (msg.action === 'getProxyStatus') {
      getProxyStatus().then(status => sendResponse(status));
    } else if (msg.action === 'stopProxy') {
      stopProxy().then(() => sendResponse({ success: true }));
    }
  
    return true; // асинхронный ответ
  });