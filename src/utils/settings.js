const SETTINGS_STORAGE_KEY = "classworks:settings";
const SETTINGS_EVENT = "classworks:settings-change";

const defaultConfig = {
  background: {
    enabled: false,
    imageData: "",
    url: "",
    blur: 10,
    opacity: 30,
  },
  display: {
    forceDesktopMode: false,
    lateStudentsArePresent: false,
    showQuickTools: true,
    showRandomPickerButton: false,
    showFullscreenButton: true,
    showAntiScreenBurnCard: false,
    showTestCardButton: false,
  },
  font: {
    family: "system",
  },
  message: {
    maxActiveMessages: 50,
  },
  server: {
    classNumber: "1",
    provider: "kv-local",
    kvToken: "",
  },
  theme: {
    mode: "dark",
  },
  device: {
    uuid: "",
  },
};

let userConfig = loadUserConfig();

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  const result = {...base};

  for (const [key, value] of Object.entries(override || {})) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)])
    );
  }
  return value;
}

function loadUserConfig() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn("读取设置失败:", error);
    return {};
  }
}

function persistUserConfig() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(userConfig));
  } catch (error) {
    console.warn("保存设置失败:", error);
  }
}

function getMergedConfig() {
  return deepMerge(defaultConfig, userConfig);
}

function emitSettingsChange(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new window.CustomEvent(SETTINGS_EVENT, {
      detail: {
        key,
        value: cloneValue(value),
        settings: getMergedConfig(),
      },
    })
  );
}

export function getSetting(key) {
  const keys = key.split(".");
  let value = getMergedConfig();

  for (const part of keys) {
    if (value && typeof value === "object" && part in value) {
      value = value[part];
    } else {
      return undefined;
    }
  }

  return cloneValue(value);
}

export function setSetting(key, value) {
  const keys = key.split(".");
  let config = userConfig;

  for (let i = 0; i < keys.length - 1; i += 1) {
    const currentKey = keys[i];
    if (!isPlainObject(config[currentKey])) {
      config[currentKey] = {};
    }
    config = config[currentKey];
  }

  config[keys[keys.length - 1]] = cloneValue(value);
  persistUserConfig();
  emitSettingsChange(key, value);
}

export function watchSettings(callback) {
  if (typeof window === "undefined") {
    callback(getMergedConfig());
    return () => {};
  }

  const notify = (event) => {
    if (event?.type === "storage" && event.key && event.key !== SETTINGS_STORAGE_KEY) {
      return;
    }

    if (event?.type === "storage") {
      userConfig = loadUserConfig();
    }

    callback(getMergedConfig(), event);
  };

  window.addEventListener(SETTINGS_EVENT, notify);
  window.addEventListener("storage", notify);
  callback(getMergedConfig());

  return () => {
    window.removeEventListener(SETTINGS_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}
