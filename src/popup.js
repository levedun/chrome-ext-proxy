import {
  defaultProfileName,
  mergeImportedProfiles,
  parseProxyList,
  serializeProfiles
} from './lib/proxy-list.js';

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

  let renderToken = 0;
  /** 'list' | 'form' */
  let viewMode = null;
  let latestProfiles = [];
  /** null | profile id при редактировании */
  let editingId = null;

  const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
  const ICON_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`;
  const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>`;

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

  function setView(mode, profiles) {
    const listAvailable = hasCustomProfiles(profiles);
    viewMode = mode;

    if (mode === 'list' && listAvailable) {
      viewList.classList.add('active');
      viewForm.classList.remove('active');
      editingId = null;
      return;
    }

    viewList.classList.remove('active');
    viewForm.classList.add('active');
    const showBack = listAvailable && mode === 'form';
    backBtn.classList.toggle('hidden', !showBack);
    if (editingId) {
      formTitle.textContent = 'Редактирование';
    } else {
      formTitle.textContent = showBack ? 'Новый профиль' : 'Настройки прокси';
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
    setView(hasCustomProfiles(profiles) ? 'list' : 'form', profiles);
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

  async function renderProfiles(profiles, activeId, token) {
    const statusRes = await chrome.runtime.sendMessage({ action: 'getProxyStatus' });
    if (token !== renderToken) return;

    const activeProfile = profiles.find((p) => p.id === activeId) || profiles[0];
    const isProxyActive = Boolean(statusRes.active && activeId !== 'default');
    updateStatus(isProxyActive, activeProfile);

    profilesDiv.innerHTML = '';
    customProfiles(profiles).forEach((p) => {
      const div = document.createElement('div');
      const isOn = isProxyActive && p.id === activeId;
      div.className = 'profile' + (isOn ? ' active' : '');

      const subtitle = `${p.type.toUpperCase()}://${p.host}:${p.port}`;

      div.innerHTML = `
        <span class="status-indicator ${isOn ? 'live' : ''}" aria-hidden="true"></span>
        <div class="profile-info">
          <strong title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</strong>
          <small title="${escapeHtml(subtitle)}">${escapeHtml(subtitle)}</small>
        </div>
        <div class="profile-actions">
          <button type="button" class="icon-btn btn-edit" title="Редактировать" aria-label="Редактировать">${ICON_EDIT}</button>
          <button type="button" class="icon-btn btn-dup" title="Дублировать" aria-label="Дублировать">${ICON_COPY}</button>
          <button type="button" class="icon-btn danger btn-del" title="Удалить" aria-label="Удалить">${ICON_TRASH}</button>
          <label class="switch" title="${isOn ? 'Выключить' : 'Включить'}">
            <input type="checkbox" role="switch" ${isOn ? 'checked' : ''} aria-label="Прокси «${escapeHtml(p.name)}»">
            <span class="switch-slider" aria-hidden="true"></span>
          </label>
        </div>
      `;

      const switchInput = div.querySelector('input[type="checkbox"]');
      switchInput.addEventListener('change', () => {
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
          switchInput.disabled = false;
        });
      });

      div.querySelector('.btn-edit').onclick = (e) => {
        e.stopPropagation();
        openFormView({ profile: p, asEdit: true });
      };

      div.querySelector('.btn-dup').onclick = (e) => {
        e.stopPropagation();
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

      profilesDiv.appendChild(div);
    });
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
    } else if (viewMode === 'list' && !hasCustomProfiles(latestProfiles)) {
      setView('form', latestProfiles);
    } else if (viewMode === 'form' && editingId) {
      setView('form', latestProfiles);
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

  profilesMenuBtn.onclick = (e) => {
    e.stopPropagation();
    const open = !profilesMenu.classList.contains('open');
    profilesMenu.classList.toggle('open', open);
    profilesMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  document.addEventListener('click', (e) => {
    if (!profilesMenu.contains(e.target) && e.target !== profilesMenuBtn) {
      closeProfilesMenu();
    }
  });

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
