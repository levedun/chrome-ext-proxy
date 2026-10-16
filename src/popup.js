import {
  defaultProfileName,
  mergeImportedProfiles,
  parseProxyList,
  serializeProfiles
} from './lib/proxy-list.js';
import { countryFlagEmoji } from './lib/geo.js';

document.addEventListener('DOMContentLoaded', () => {
  if (window.__proxyManagerPopupInit) return;
  window.__proxyManagerPopupInit = true;

  const profilesDiv = document.getElementById('profiles');
  const addBtn = document.getElementById('add');
  const showAddBtn = document.getElementById('showAddBtn');
  const backBtn = document.getElementById('backBtn');
  const stopBtn = document.getElementById('stopBtn');
  const nameInput = document.getElementById('name');
  const typeInput = document.getElementById('type');
  const hostInput = document.getElementById('host');
  const portInput = document.getElementById('port');
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const toast = document.getElementById('toast');
  const viewList = document.getElementById('viewList');
  const viewForm = document.getElementById('viewForm');
  const formTitle = document.getElementById('formTitle');
  const profilesMenuBtn = document.getElementById('profilesMenuBtn');
  const profilesMenu = document.getElementById('profilesMenu');
  const menuExport = document.getElementById('menuExport');
  const menuImport = document.getElementById('menuImport');
  const menuDeleteAll = document.getElementById('menuDeleteAll');
  const importFile = document.getElementById('importFile');
  const profilesEmpty = document.getElementById('profilesEmpty');
  const checkBtn = document.getElementById('checkBtn');

  let renderToken = 0;
  /** 'list' | 'form' */
  let viewMode = null;
  let latestProfiles = [];
  /** null | profile id при редактировании */
  let editingId = null;
  let healthById = {};
  let healthRunning = false;
  let healthCheckingId = null;
  let healthPollTimer = null;
  let deadGroupOpen = false;

  const ICON_MORE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>`;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function customProfiles(profiles) {
    return (profiles || []).filter((p) => p.id !== 'default' && p.type !== 'none');
  }

  function hasCustomProfiles(profiles) {
    return customProfiles(profiles).length > 0;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function isFormValid() {
    const name = nameInput.value.trim();
    const host = hostInput.value.trim();
    const port = portInput.value.trim();
    const portOk = /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;
    return Boolean(name && host && portOk);
  }

  function updateAddButton() {
    addBtn.disabled = !isFormValid();
    addBtn.textContent = editingId ? 'Сохранить' : 'Добавить профиль';
  }

  function clearFormFields() {
    nameInput.value = '';
    typeInput.value = 'http';
    hostInput.value = '';
    portInput.value = '';
  }

  function saveDraft() {
    if (editingId) {
      updateAddButton();
      return;
    }
    chrome.storage.local.set({
      formDraft: {
        name: nameInput.value,
        type: typeInput.value,
        host: hostInput.value,
        port: portInput.value
      }
    });
    updateAddButton();
  }

  async function loadDraft() {
    if (editingId) return;
    const data = await chrome.storage.local.get('formDraft');
    if (data.formDraft) {
      nameInput.value = data.formDraft.name || '';
      typeInput.value = data.formDraft.type || 'http';
      hostInput.value = data.formDraft.host || '';
      portInput.value = data.formDraft.port || '';
    }
    updateAddButton();
  }

  function updateStatus(isProxyActive, activeProfile) {
    statusPill.classList.toggle('on', isProxyActive);
    if (isProxyActive && activeProfile) {
      statusText.textContent = `Прокси: ${activeProfile.name}`;
    } else {
      statusText.textContent = 'Прямое соединение';
    }
    stopBtn.disabled = !isProxyActive;
  }

  function closeProfilesMenu() {
    profilesMenu.classList.remove('open');
    profilesMenuBtn.setAttribute('aria-expanded', 'false');
  }

  function updateCheckButton(hasCustoms) {
    checkBtn.classList.toggle('hidden', !hasCustoms);
    checkBtn.disabled = healthRunning || !hasCustoms;
    checkBtn.classList.toggle('spin', healthRunning);
    checkBtn.title = healthRunning ? 'Проверка…' : 'Проверить прокси';
  }

  function pingLabel(entry, isChecking) {
    if (isChecking) {
      return { text: '…', className: 'ping pending', title: 'проверка…' };
    }
    if (!entry) return { text: '', className: 'ping' };
    if (entry.ok) {
      return { text: `${entry.ms} ms`, className: 'ping ok' };
    }
    return { text: 'fail', className: 'ping bad', title: entry.error || 'недоступен' };
  }

  function flagHtml(entry) {
    if (!entry) return '';
    if (entry.local) {
      return `<span class="profile-flag" title="Локальный">🏠</span>`;
    }
    const emoji = countryFlagEmoji(entry.countryCode);
    if (!emoji) return '';
    const title = entry.country || entry.countryCode || '';
    return `<span class="profile-flag" title="${escapeHtml(title)}">${emoji}</span>`;
  }

  function partitionProfiles(customs) {
    const pending = [];
    const alive = [];
    const dead = [];
    const hasAnyResult = customs.some((p) => healthById[p.id]);

    for (const p of customs) {
      const health = healthById[p.id];
      const checking = healthRunning && healthCheckingId === p.id;
      if (checking || (healthRunning && !health)) {
        pending.push(p);
      } else if (health && health.ok === true) {
        alive.push(p);
      } else if (health && health.ok === false) {
        dead.push(p);
      } else {
        pending.push(p);
      }
    }

    alive.sort((a, b) => {
      const ma = healthById[a.id]?.ms ?? Number.POSITIVE_INFINITY;
      const mb = healthById[b.id]?.ms ?? Number.POSITIVE_INFINITY;
      return ma - mb;
    });

    return { pending, alive, dead, grouped: hasAnyResult || healthRunning };
  }

  async function refreshHealthState() {
    const res = await chrome.runtime.sendMessage({ action: 'getHealth' });
    const health = res.health || { byId: {}, running: false };
    healthById = health.byId || {};
    healthRunning = Boolean(health.running);
    healthCheckingId = health.checkingId || null;
    return health;
  }

  function startHealthPoll() {
    clearInterval(healthPollTimer);
    healthPollTimer = setInterval(async () => {
      await refreshHealthState();
      updateCheckButton(hasCustomProfiles(latestProfiles));
      if (!healthRunning) {
        clearInterval(healthPollTimer);
        healthPollTimer = null;
        render();
      } else {
        // обновить пинги на лету без полного сброса фокуса меню
        render();
      }
    }, 600);
  }

  async function runHealthCheck() {
    if (healthRunning) return;
    closeProfilesMenu();
    closeItemMenus();
    healthRunning = true;
    updateCheckButton(true);
    showToast('Проверка прокси…');
    startHealthPoll();

    const res = await chrome.runtime.sendMessage({ action: 'checkProxies' });
    clearInterval(healthPollTimer);
    healthPollTimer = null;

    if (res.error) {
      healthRunning = false;
      updateCheckButton(hasCustomProfiles(latestProfiles));
      showToast(`Ошибка проверки: ${res.error}`);
      return;
    }

    healthById = (res.health && res.health.byId) || {};
    healthRunning = false;
    const entries = Object.values(healthById);
    const ok = entries.filter((e) => e.ok).length;
    const bad = entries.length - ok;
    showToast(`Готово: ${ok} ок, ${bad} недоступны.`);
    render();
  }

  function setView(mode, profiles) {
    viewMode = mode;

    // Список всегда доступен (даже пустой) — там меню импорта/экспорта
    if (mode === 'list') {
      viewList.classList.add('active');
      viewForm.classList.remove('active');
      editingId = null;
      return;
    }

    viewList.classList.remove('active');
    viewForm.classList.add('active');
    backBtn.classList.remove('hidden');
    if (editingId) {
      formTitle.textContent = 'Редактирование';
    } else {
      formTitle.textContent = 'Новый профиль';
    }
    updateAddButton();
  }

  function openFormView(options = {}) {
    const { profile = null, asEdit = false } = options;
    closeProfilesMenu();

    if (profile && asEdit) {
      editingId = profile.id;
      nameInput.value = profile.name || '';
      typeInput.value = profile.type || 'http';
      hostInput.value = profile.host || '';
      portInput.value = profile.port || '';
    } else {
      editingId = null;
      clearFormFields();
      loadDraft();
    }

    setView('form', latestProfiles);
    updateAddButton();
  }

  function openListOrForm(profiles) {
    setView('list', profiles);
  }

  function uniqueCopyName(baseName, profiles) {
    let name = `${baseName} (копия)`;
    let n = 2;
    const lower = (s) => s.toLowerCase();
    while (profiles.some((p) => lower(p.name) === lower(name))) {
      name = `${baseName} (копия ${n})`;
      n += 1;
    }
    return name;
  }

  function enableProfile(id) {
    return chrome.runtime
      .sendMessage({ action: 'stopProxy' })
      .then(() => chrome.runtime.sendMessage({ action: 'activate', id }))
      .then(() => setTimeout(() => render(), 80));
  }

  function disableProxy() {
    return chrome.runtime.sendMessage({ action: 'stopProxy' }).then(() => {
      setTimeout(() => render(), 80);
    });
  }

  function saveProfilesList(profiles) {
    return chrome.runtime.sendMessage({ action: 'saveProfiles', profiles });
  }

  function positionItemMenu(moreBtn, itemMenu) {
    const rect = moreBtn.getBoundingClientRect();
    const menuWidth = 168;
    const pad = 8;
    let top = rect.bottom + 4;
    let right = Math.max(pad, window.innerWidth - rect.right);

    itemMenu.style.left = 'auto';
    itemMenu.style.right = `${right}px`;
    itemMenu.style.top = `${top}px`;
    itemMenu.style.minWidth = `${menuWidth}px`;

    // если не влезает вниз — открыть вверх
    requestAnimationFrame(() => {
      const m = itemMenu.getBoundingClientRect();
      if (m.bottom > window.innerHeight - pad) {
        itemMenu.style.top = `${Math.max(pad, rect.top - m.height - 4)}px`;
      }
      if (m.left < pad) {
        itemMenu.style.right = `${Math.max(pad, window.innerWidth - pad - menuWidth)}px`;
      }
    });
  }

  function closeItemMenus(except) {
    profilesDiv.querySelectorAll('.item-menu.open').forEach((el) => {
      if (el !== except) {
        el.classList.remove('open');
        el.style.top = '';
        el.style.right = '';
        el.style.left = '';
      }
    });
    profilesDiv.querySelectorAll('.profile.menu-open').forEach((el) => {
      if (!except || !el.contains(except)) el.classList.remove('menu-open');
    });
  }

  function createProfileCard(p, profiles, activeId, isProxyActive) {
    const div = document.createElement('div');
    const isOn = isProxyActive && p.id === activeId;
    const health = healthById[p.id];
    const checking = healthRunning && healthCheckingId === p.id;
    const dead = health && health.ok === false && !checking;
    const switchable = !dead && !checking;
    div.className =
      'profile' +
      (isOn ? ' active' : '') +
      (dead ? ' dead' : '') +
      (checking ? ' checking' : '');
    div.dataset.id = p.id;

    const subtitle = `${p.type.toUpperCase()}://${p.host}:${p.port}`;
    const ping = pingLabel(health, checking);
    const pingHtml = ping.text
      ? `<span class="${ping.className}" title="${escapeHtml(ping.title || ping.text)}">${escapeHtml(ping.text)}</span>`
      : '';
    const flag = flagHtml(health);

    div.innerHTML = `
      <span class="status-indicator ${isOn ? 'live' : ''}" aria-hidden="true"></span>
      <div class="profile-info">
        <div class="profile-title">
          ${pingHtml}
          <strong title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</strong>
        </div>
        <div class="profile-endpoint">
          ${flag}
          <small title="${escapeHtml(subtitle)}">${escapeHtml(subtitle)}</small>
        </div>
      </div>
      <div class="profile-actions">
        <label class="switch" title="${dead ? 'Недоступен' : checking ? 'Проверка…' : isOn ? 'Выключить' : 'Включить'}">
          <input type="checkbox" role="switch" ${isOn ? 'checked' : ''} ${switchable ? '' : 'disabled'} aria-label="Прокси «${escapeHtml(p.name)}»">
          <span class="switch-slider" aria-hidden="true"></span>
        </label>
        <div class="menu-wrap">
          <button type="button" class="icon-btn btn-more" title="Действия" aria-label="Действия профиля" aria-haspopup="true">${ICON_MORE}</button>
          <div class="menu-dropdown item-menu" role="menu">
            <button type="button" class="btn-edit" role="menuitem">Редактировать</button>
            <button type="button" class="btn-dup" role="menuitem">Дублировать</button>
            <button type="button" class="btn-del danger" role="menuitem">Удалить</button>
          </div>
        </div>
      </div>
    `;

    const switchInput = div.querySelector('input[type="checkbox"]');
    switchInput.addEventListener('change', () => {
      if (!switchable) {
        switchInput.checked = false;
        return;
      }
      const turnOn = switchInput.checked;
      if (turnOn) {
        profilesDiv.querySelectorAll('input[type="checkbox"]').forEach((el) => {
          if (el !== switchInput) el.checked = false;
        });
        profilesDiv.querySelectorAll('.profile').forEach((el) => {
          if (el !== div) {
            el.classList.remove('active');
            el.querySelector('.status-indicator')?.classList.remove('live');
          }
        });
        div.classList.add('active');
        div.querySelector('.status-indicator')?.classList.add('live');
      } else {
        div.classList.remove('active');
        div.querySelector('.status-indicator')?.classList.remove('live');
      }

      switchInput.disabled = true;
      const done = turnOn ? enableProfile(p.id) : disableProxy();
      done.finally(() => {
        switchInput.disabled = dead;
      });
    });

    const moreBtn = div.querySelector('.btn-more');
    const itemMenu = div.querySelector('.item-menu');
    moreBtn.onclick = (e) => {
      e.stopPropagation();
      const willOpen = !itemMenu.classList.contains('open');
      closeItemMenus();
      closeProfilesMenu();
      if (willOpen) {
        div.classList.add('menu-open');
        itemMenu.classList.add('open');
        positionItemMenu(moreBtn, itemMenu);
      }
    };

    div.querySelector('.btn-edit').onclick = (e) => {
      e.stopPropagation();
      closeItemMenus();
      openFormView({ profile: p, asEdit: true });
    };

    div.querySelector('.btn-dup').onclick = (e) => {
      e.stopPropagation();
      closeItemMenus();
      const next = [...profiles];
      next.push({
        id: Date.now().toString(),
        name: uniqueCopyName(p.name, next),
        type: p.type,
        host: p.host,
        port: p.port
      });
      saveProfilesList(next).then(() => {
        showToast('Профиль скопирован.');
        setTimeout(() => render(), 80);
      });
    };

    div.querySelector('.btn-del').onclick = (e) => {
      e.stopPropagation();
      closeItemMenus();
      if (!confirm(`Удалить профиль «${p.name}»?`)) return;

      const updatedProfiles = profiles.filter((x) => x.id !== p.id);
      saveProfilesList(updatedProfiles).then(() => {
        const afterDelete = () => {
          viewMode = null;
          setTimeout(() => render(), 80);
        };
        if (isOn) {
          chrome.runtime.sendMessage({ action: 'stopProxy' }).then(afterDelete);
        } else {
          afterDelete();
        }
      });
    };

    return div;
  }

  async function renderProfiles(profiles, activeId, token) {
    const [statusRes] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getProxyStatus' }),
      refreshHealthState()
    ]);
    if (token !== renderToken) return;

    const activeProfile = profiles.find((p) => p.id === activeId) || profiles[0];
    const isProxyActive = Boolean(statusRes.active && activeId !== 'default');
    updateStatus(isProxyActive, activeProfile);

    // сохранить состояние спойлера до перерисовки
    const prevDead = profilesDiv.querySelector('.dead-group');
    if (prevDead) deadGroupOpen = prevDead.open;

    profilesDiv.innerHTML = '';
    const customs = customProfiles(profiles);
    if (profilesEmpty) {
      profilesEmpty.hidden = customs.length > 0;
    }
    updateCheckButton(customs.length > 0);

    const appendCard = (parent, p) => {
      parent.appendChild(createProfileCard(p, profiles, activeId, isProxyActive));
    };

    const { pending, alive, dead, grouped } = partitionProfiles(customs);

    if (!grouped) {
      customs.forEach((p) => appendCard(profilesDiv, p));
      return;
    }

    if (pending.length) {
      const wrap = document.createElement('div');
      wrap.className = 'profile-group';
      if (alive.length || dead.length || healthRunning) {
        const label = document.createElement('p');
        label.className = 'profile-group-label';
        const title = healthRunning ? 'Проверка' : 'Не проверены';
        label.innerHTML = `${title} <span class="count">${pending.length}</span>`;
        wrap.appendChild(label);
      }
      pending.forEach((p) => appendCard(wrap, p));
      profilesDiv.appendChild(wrap);
    }

    if (alive.length) {
      const wrap = document.createElement('div');
      wrap.className = 'profile-group';
      const label = document.createElement('p');
      label.className = 'profile-group-label';
      label.innerHTML = `Работает <span class="count">${alive.length}</span>`;
      wrap.appendChild(label);
      alive.forEach((p) => appendCard(wrap, p));
      profilesDiv.appendChild(wrap);
    }

    if (dead.length) {
      const details = document.createElement('details');
      details.className = 'dead-group';
      details.open = deadGroupOpen;

      const summary = document.createElement('summary');
      summary.innerHTML = `Не работает <span class="count">${dead.length}</span>`;
      details.appendChild(summary);

      details.addEventListener('toggle', () => {
        deadGroupOpen = details.open;
        if (!details.open) return;
        // после раскрытия пересчитать скролл контейнера и показать список
        requestAnimationFrame(() => {
          summary.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
      });

      const list = document.createElement('div');
      list.className = 'dead-list';
      dead.forEach((p) => appendCard(list, p));
      details.appendChild(list);
      profilesDiv.appendChild(details);
    }
  }

  async function render() {
    const token = ++renderToken;
    const [profilesRes, activeRes] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getProfiles' }),
      chrome.runtime.sendMessage({ action: 'getActive' })
    ]);
    if (token !== renderToken) return;

    latestProfiles = profilesRes.profiles || [];

    if (viewMode === null) {
      openListOrForm(latestProfiles);
    } else {
      setView(viewMode, latestProfiles);
    }

    await renderProfiles(latestProfiles, activeRes.profile.id, token);
  }

  function exportProfiles() {
    closeProfilesMenu();
    const text = serializeProfiles(latestProfiles);
    if (!text) {
      showToast('Нечего экспортировать.');
      return;
    }
    const blob = new Blob([`${text}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'proxies.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Экспорт сохранён.');
  }

  function importFromText(text) {
    const imported = parseProxyList(text);
    if (!imported.length) {
      showToast('В файле нет распознанных прокси.');
      return;
    }

    chrome.runtime.sendMessage({ action: 'getProfiles' }).then((res) => {
      const { profiles, added, skipped } = mergeImportedProfiles(res.profiles, imported);
      saveProfilesList(profiles).then(() => {
        viewMode = 'list';
        showToast(`Загружено: ${added}, пропущено: ${skipped}.`);
        setTimeout(() => render(), 80);
      });
    });
  }

  function deleteAllProfiles() {
    closeProfilesMenu();
    if (!hasCustomProfiles(latestProfiles)) {
      showToast('Список уже пуст.');
      return;
    }
    if (!confirm('Удалить все профили?')) return;

    chrome.runtime.sendMessage({ action: 'stopProxy' }).then(() => {
      saveProfilesList([{ id: 'default', name: 'Без прокси', type: 'none' }]).then(() => {
        viewMode = null;
        editingId = null;
        showToast('Все профили удалены.');
        setTimeout(() => render(), 80);
      });
    });
  }

  stopBtn.onclick = () => {
    disableProxy();
  };

  showAddBtn.onclick = () => openFormView();
  backBtn.onclick = () => {
    editingId = null;
    setView('list', latestProfiles);
  };

  checkBtn.onclick = () => runHealthCheck();

  profilesMenuBtn.onclick = (e) => {
    e.stopPropagation();
    closeItemMenus();
    const open = !profilesMenu.classList.contains('open');
    profilesMenu.classList.toggle('open', open);
    profilesMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  document.addEventListener('click', (e) => {
    if (!profilesMenu.contains(e.target) && e.target !== profilesMenuBtn) {
      closeProfilesMenu();
    }
    if (!e.target.closest('.profile-actions .menu-wrap')) {
      closeItemMenus();
    }
  });

  profilesDiv.addEventListener('scroll', () => closeItemMenus(), { passive: true });

  menuExport.onclick = () => exportProfiles();
  menuImport.onclick = () => {
    closeProfilesMenu();
    importFile.value = '';
    importFile.click();
  };
  menuDeleteAll.onclick = () => deleteAllProfiles();

  importFile.onchange = () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importFromText(String(reader.result || ''));
    reader.onerror = () => showToast('Не удалось прочитать файл.');
    reader.readAsText(file);
  };

  [nameInput, hostInput, portInput].forEach((input) => {
    input.addEventListener('input', saveDraft);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && isFormValid()) addBtn.click();
    });
  });
  typeInput.addEventListener('change', saveDraft);

  // Подсказка имени socks4_{ip} при ручном вводе, если имя пустое
  function suggestNameFromHost() {
    if (editingId) return;
    if (nameInput.value.trim()) return;
    const host = hostInput.value.trim();
    if (!host) return;
    nameInput.value = defaultProfileName(typeInput.value, host);
    updateAddButton();
  }
  hostInput.addEventListener('blur', suggestNameFromHost);
  typeInput.addEventListener('change', () => {
    if (!editingId && !nameInput.dataset.touched) suggestNameFromHost();
  });
  nameInput.addEventListener('input', () => {
    nameInput.dataset.touched = nameInput.value.trim() ? '1' : '';
  });

  addBtn.onclick = () => {
    const name = nameInput.value.trim();
    const type = typeInput.value;
    const host = hostInput.value.trim();
    const port = portInput.value.trim();

    if (!isFormValid()) {
      showToast('Заполните название, хост и порт (1–65535).');
      return;
    }

    chrome.runtime.sendMessage({ action: 'getProfiles' }).then((res) => {
      const profiles = res.profiles;

      if (
        profiles.some(
          (p) =>
            p.name.toLowerCase() === name.toLowerCase() &&
            (!editingId || p.id !== editingId)
        )
      ) {
        showToast(`Профиль «${name}» уже есть.`);
        return;
      }

      if (
        profiles.some(
          (p) =>
            p.host === host &&
            String(p.port) === String(port) &&
            p.type === type &&
            (!editingId || p.id !== editingId)
        )
      ) {
        showToast('Такой адрес уже сохранён.');
        return;
      }

      if (editingId) {
        const idx = profiles.findIndex((p) => p.id === editingId);
        if (idx === -1) {
          showToast('Профиль не найден.');
          editingId = null;
          return;
        }
        profiles[idx] = { ...profiles[idx], name, type, host, port };
        saveProfilesList(profiles).then(() => {
          editingId = null;
          clearFormFields();
          chrome.storage.local.remove('formDraft');
          nameInput.dataset.touched = '';
          updateAddButton();
          showToast('Профиль обновлён.');
          viewMode = 'list';
          render();
        });
        return;
      }

      profiles.push({
        id: Date.now().toString(),
        name,
        type,
        host,
        port
      });

      saveProfilesList(profiles).then(() => {
        clearFormFields();
        chrome.storage.local.remove('formDraft');
        nameInput.dataset.touched = '';
        updateAddButton();
        showToast('Профиль сохранён.');
        viewMode = 'list';
        render();
      });
    });
  };

  loadDraft();
  render();
});
