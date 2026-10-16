export function createChromeMock() {
  const localStore = new Map();
  const syncStore = new Map();

  function makeArea(store) {
    return {
      get: async (keys) => {
        const result = {};
        const list = keys == null
          ? [...store.keys()]
          : Array.isArray(keys)
            ? keys
            : typeof keys === 'string'
              ? [keys]
              : Object.keys(keys);

        for (const key of list) {
          if (store.has(key)) result[key] = structuredClone(store.get(key));
        }
        return result;
      },
      set: async (items) => {
        for (const [key, value] of Object.entries(items)) {
          store.set(key, structuredClone(value));
        }
      },
      remove: async (keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) store.delete(key);
      },
      clear: async () => store.clear(),
      _store: store
    };
  }

  let proxyValue = { mode: 'system' };

  const chrome = {
    storage: {
      local: makeArea(localStore),
      sync: makeArea(syncStore)
    },
    proxy: {
      settings: {
        get: (_opts, cb) => cb({ value: proxyValue }),
        set: ({ value }) => {
          proxyValue = value;
        },
        clear: () => {
          proxyValue = { mode: 'system' };
        },
        _getValue: () => proxyValue
      }
    },
    runtime: {
      onMessage: { addListener: () => {} }
    }
  };

  return chrome;
}

export function installChromeMock() {
  const chrome = createChromeMock();
  globalThis.chrome = chrome;
  return chrome;
}
