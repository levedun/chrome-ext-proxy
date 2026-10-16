/** Формат строки: `SOCKS5 213.165.54.5:1080` (также URI и HTTPS→http) */

const TYPE_ALIASES = {
  http: 'http',
  https: 'http',
  socks4: 'socks4',
  socks5: 'socks5'
};

const EXPORT_LABEL = {
  http: 'HTTP',
  socks4: 'SOCKS4',
  socks5: 'SOCKS5'
};

/** Имя профиля при импорте: socks4_213.165.54.5 */
export function defaultProfileName(type, host) {
  return `${type}_${host}`;
}

export function serializeProfiles(profiles) {
  return (profiles || [])
    .filter((p) => p && p.type !== 'none' && p.id !== 'default' && p.host && p.port)
    .map((p) => `${EXPORT_LABEL[p.type] || p.type.toUpperCase()} ${p.host}:${p.port}`)
    .join('\n');
}

/**
 * Разбор одной строки списка прокси.
 * @returns {{ type: string, host: string, port: string, name: string } | null}
 */
export function parseProxyLine(rawLine) {
  const line = String(rawLine || '').trim();
  if (!line || line.startsWith('#')) return null;

  let typeRaw = '';
  let hostPort = '';

  const uri = line.match(/^(https?|socks[45]):\/\/([^/\s]+)/i);
  if (uri) {
    typeRaw = uri[1];
    hostPort = uri[2];
  } else {
    const spaced = line.match(/^(\S+)\s+(\S+)/);
    if (spaced && /^(https?|socks[45])$/i.test(spaced[1])) {
      typeRaw = spaced[1];
      hostPort = spaced[2];
    } else if (/^[^:\s]+:\d{1,5}$/.test(line.split(/\s+/)[0])) {
      typeRaw = 'http';
      hostPort = line.split(/\s+/)[0];
    } else {
      return null;
    }
  }

  const type = TYPE_ALIASES[typeRaw.toLowerCase()];
  if (!type) return null;

  // host:port — IPv4 / hostname; IPv6 в скобках [addr]:port
  let host;
  let port;
  const v6 = hostPort.match(/^\[([^\]]+)\]:(\d{1,5})$/);
  const v4 = hostPort.match(/^([^:\s]+):(\d{1,5})$/);
  if (v6) {
    host = v6[1];
    port = v6[2];
  } else if (v4) {
    host = v4[1];
    port = v4[2];
  } else {
    return null;
  }

  const portNum = Number(port);
  if (!host || portNum < 1 || portNum > 65535) return null;

  return {
    type,
    host,
    port: String(portNum),
    name: defaultProfileName(type, host)
  };
}

export function parseProxyList(text) {
  const lines = String(text || '').split(/\r?\n/);
  const seen = new Set();
  const result = [];

  for (const line of lines) {
    const parsed = parseProxyLine(line);
    if (!parsed) continue;
    const key = `${parsed.type}|${parsed.host}|${parsed.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(parsed);
  }

  return result;
}

export function mergeImportedProfiles(existing, imported) {
  const profiles = [...(existing || [])];
  let added = 0;
  let skipped = 0;
  let idBase = Date.now();

  for (const item of imported) {
    const duplicate = profiles.some(
      (p) => p.host === item.host && String(p.port) === String(item.port) && p.type === item.type
    );
    if (duplicate) {
      skipped += 1;
      continue;
    }

    let name = item.name;
    if (profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      name = `${name}_${item.port}`;
    }

    profiles.push({
      id: String(idBase++),
      name,
      type: item.type,
      host: item.host,
      port: String(item.port)
    });
    added += 1;
  }

  return { profiles, added, skipped };
}
