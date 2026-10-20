const ICONS_OFF = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png'
};

const ICONS_ON = {
  16: 'icons/icon16-on.png',
  32: 'icons/icon32-on.png',
  48: 'icons/icon48-on.png'
};

/** Профиль реально включает прокси (не «Без прокси») */
export function isProxyConnected(profile) {
  return Boolean(profile && profile.type && profile.type !== 'none');
}

export function iconPathsFor(connected) {
  return connected ? ICONS_ON : ICONS_OFF;
}

/** Зелёные круги при подключении, белые — когда прокси выключен */
export async function updateActionIcon(connected) {
  if (!chrome?.action?.setIcon) return;
  await chrome.action.setIcon({ path: iconPathsFor(connected) });
}

export async function updateActionIconForProfile(profile) {
  await updateActionIcon(isProxyConnected(profile));
}
