document.addEventListener('DOMContentLoaded', () => {
    const profilesDiv = document.getElementById('profiles');
    const addBtn = document.getElementById('add');
    const stopBtn = document.getElementById('stopBtn');
    const nameInput = document.getElementById('name');
    const typeInput = document.getElementById('type');
    const hostInput = document.getElementById('host');
    const portInput = document.getElementById('port');
  
    // Сохранить черновик формы
    function saveDraft() {
      const draft = {
        name: nameInput.value,
        type: typeInput.value,
        host: hostInput.value,
        port: portInput.value
      };
      chrome.storage.local.set({ formDraft: draft });
    }
  
    // Восстановить черновик формы
    async function loadDraft() {
      const data = await chrome.storage.local.get('formDraft');
      if (data.formDraft) {
        nameInput.value = data.formDraft.name || '';
        typeInput.value = data.formDraft.type || 'http';
        hostInput.value = data.formDraft.host || '';
        portInput.value = data.formDraft.port || '';
      }
    }
  
    // Автосохранение при вводе
    nameInput.addEventListener('input', saveDraft);
    typeInput.addEventListener('change', saveDraft);
    hostInput.addEventListener('input', saveDraft);
    portInput.addEventListener('input', saveDraft);
  
    // Восстановить черновик при загрузке
    loadDraft();

    // Кнопка остановки прокси
    stopBtn.onclick = () => {
      chrome.runtime.sendMessage({ action: 'stopProxy' }).then(() => {
        setTimeout(() => render(), 100);
      });
    };
  
    async function renderProfiles(profiles, activeId) {
      profilesDiv.innerHTML = '';
      
      // Получить статус прокси
      const statusRes = await chrome.runtime.sendMessage({ action: 'getProxyStatus' });
      const isProxyActive = statusRes.active && activeId !== 'default';
      
      // Обновить состояние кнопки остановки
      stopBtn.style.opacity = isProxyActive ? '1' : '0.5';
      stopBtn.disabled = !isProxyActive;
      
      profiles.forEach(p => {
        const div = document.createElement('div');
        div.className = 'profile';
        const isActive = p.id === activeId;
        if (isActive) div.classList.add('active');
  
        const statusClass = (isActive && isProxyActive) ? 'active' : 'inactive';
        
        // Специальное оформление для профиля "Без прокси"
        const isNoneProfile = p.type === 'none';
        const profileStyle = isNoneProfile && isActive ? 'style="border: 2px solid #ff9800; background: #fff3e0;"' : '';
        
        div.innerHTML = `
          <div class="profile-info" ${profileStyle}>
            <span class="status-indicator ${statusClass}"></span>
            <strong>${p.name}</strong>
            <small>${isNoneProfile ? '🔌 Прямое соединение (прокси отключен)' : `${p.type.toUpperCase()}://${p.host}:${p.port}`}</small>
          </div>
          <div class="profile-controls">
            ${p.id !== 'default' ? '<span class="delete" data-id="' + p.id + '" title="Удалить">×</span>' : ''}
          </div>
        `;
  
        div.onclick = (e) => {
          if (e.target.classList.contains('delete')) return;
          chrome.runtime.sendMessage({ action: 'activate', id: p.id });
          setTimeout(() => render(), 100);
        };
  
        if (p.id !== 'default') {
          const deleteBtn = div.querySelector('.delete');
          if (deleteBtn) {
            deleteBtn.onclick = (e) => {
              e.stopPropagation();
              if (confirm(`Удалить профиль "${p.name}"?`)) {
                const updatedProfiles = profiles.filter(x => x.id !== p.id);
                chrome.runtime.sendMessage({ action: 'saveProfiles', profiles: updatedProfiles });
                setTimeout(() => render(), 100);
              }
            };
          }
        }
  
        profilesDiv.appendChild(div);
      });
    }
  
    async function render() {
      const profilesRes = await chrome.runtime.sendMessage({ action: 'getProfiles' });
      const activeRes = await chrome.runtime.sendMessage({ action: 'getActive' });
      await renderProfiles(profilesRes.profiles, activeRes.profile.id);
    }
  
    // Добавить профиль по Enter
    [nameInput, hostInput, portInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          addBtn.click();
        }
      });
    });
  
    addBtn.onclick = () => {
      const name = nameInput.value.trim();
      const type = typeInput.value;
      const host = hostInput.value.trim();
      const port = portInput.value.trim();
  
      if (!name || (type !== 'none' && (!host || !port))) return;
      
      // Запретить создание профилей типа "none" (уже есть дефолтный)
      if (type === 'none') {
        alert('Профиль "Без прокси" уже существует. Используйте существующий профиль.');
        return;
      }
  
      chrome.runtime.sendMessage({ action: 'getProfiles' }).then((res) => {
        const profiles = res.profiles;
        
        // Проверка на дубликаты по имени
        if (profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
          alert(`Профиль с именем "${name}" уже существует!`);
          return;
        }
        
        // Проверка на дубликаты по host:port для прокси профилей
        if (profiles.some(p => p.host === host && p.port === port && p.type === type)) {
          alert(`Профиль с адресом ${type.toUpperCase()}://${host}:${port} уже существует!`);
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
          render();
          nameInput.value = '';
          hostInput.value = '';
          portInput.value = '';
          // Очистить черновик после успешного сохранения
          chrome.storage.local.remove('formDraft');
        });
      });
    };
  
    render();
  });