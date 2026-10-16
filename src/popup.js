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

  let renderToken = 0;
  /** 'list' | 'form' — form принудительно при клике «Добавить» */
  let viewMode = null;
  let latestProfiles = [];

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
    showToast._timer = setTimeout(() => toast.classList.remove('show'), 2800);
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
  }

  function saveDraft() {
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

  function setView(mode, profiles) {
    const listAvailable = hasCustomProfiles(profiles);
    viewMode = mode;

    if (mode === 'list' && listAvailable) {
      viewList.classList.add('active');
      viewForm.classList.remove('active');
      return;
    }

    viewList.classList.remove('active');
    viewForm.classList.add('active');
    const showBack = listAvailable && mode === 'form';
    backBtn.classList.toggle('hidden', !showBack);
    formTitle.textContent = showBack ? 'Новый профиль' : 'Настройки прокси';
  }

  function openFormView() {
    setView('form', latestProfiles);
  }

  function openListOrForm(profiles) {
    setView(hasCustomProfiles(profiles) ? 'list' : 'form', profiles);
  }

  stopBtn.onclick = () => {
    chrome.runtime.sendMessage({ action: 'stopProxy' }).then(() => {
      setTimeout(() => render(), 80);
    });
  };

  showAddBtn.onclick = () => openFormView();
  backBtn.onclick = () => setView('list', latestProfiles);

  async function renderProfiles(profiles, activeId, token) {
    const statusRes = await chrome.runtime.sendMessage({ action: 'getProxyStatus' });
    if (token !== renderToken) return;

    const activeProfile = profiles.find((p) => p.id === activeId) || profiles[0];
    const isProxyActive = Boolean(statusRes.active && activeId !== 'default');
    updateStatus(isProxyActive, activeProfile);

    profilesDiv.innerHTML = '';
    profiles.forEach((p) => {
      const div = document.createElement('div');
      const isActive = p.id === activeId;
      const isNoneProfile = p.type === 'none';
      div.className = 'profile' + (isActive ? ' active' : '');

      const subtitle = isNoneProfile
        ? 'Прямое соединение'
        : `${p.type.toUpperCase()}://${p.host}:${p.port}`;

      const live = isActive && isProxyActive;

      div.innerHTML = `
        <span class="status-indicator ${live ? 'live' : ''}" aria-hidden="true"></span>
        <div class="profile-info">
          <strong>${escapeHtml(p.name)}</strong>
          <small>${escapeHtml(subtitle)}</small>
        </div>
        ${
          p.id !== 'default'
            ? `<button type="button" class="delete" data-id="${escapeHtml(p.id)}" title="Удалить" aria-label="Удалить профиль">×</button>`
            : ''
        }
      `;

      div.onclick = (e) => {
        if (e.target.closest('.delete')) return;
        chrome.runtime.sendMessage({ action: 'activate', id: p.id }).then(() => {
          setTimeout(() => render(), 80);
        });
      };

      const deleteBtn = div.querySelector('.delete');
      if (deleteBtn) {
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          if (!confirm(`Удалить профиль «${p.name}»?`)) return;

          const updatedProfiles = profiles.filter((x) => x.id !== p.id);
          chrome.runtime.sendMessage({ action: 'saveProfiles', profiles: updatedProfiles }).then(() => {
            const afterDelete = () => {
              viewMode = null;
              setTimeout(() => render(), 80);
            };
            if (isActive) {
              chrome.runtime.sendMessage({ action: 'activate', id: 'default' }).then(afterDelete);
            } else {
              afterDelete();
            }
          });
        };
      }

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
    } else {
      setView(viewMode, latestProfiles);
    }

    await renderProfiles(latestProfiles, activeRes.profile.id, token);
  }

  [nameInput, hostInput, portInput].forEach((input) => {
    input.addEventListener('input', saveDraft);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && isFormValid()) addBtn.click();
    });
  });
  typeInput.addEventListener('change', saveDraft);

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

      if (profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        showToast(`Профиль «${name}» уже есть.`);
        return;
      }

      if (profiles.some((p) => p.host === host && p.port === port && p.type === type)) {
        showToast('Такой адрес уже сохранён.');
        return;
      }

      profiles.push({
        id: Date.now().toString(),
        name,
        type,
        host,
        port
      });

      chrome.runtime.sendMessage({ action: 'saveProfiles', profiles }).then(() => {
        nameInput.value = '';
        hostInput.value = '';
        portInput.value = '';
        chrome.storage.local.remove('formDraft');
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
