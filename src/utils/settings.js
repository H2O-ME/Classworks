const SETTINGS_STORAGE_KEY = "classworks:settings";

const defaultConfig = {
  display: {
    fontSizeLevel: 0,
  },
};

let userConfig = loadUserConfig();

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

  for (let index = 0; index < keys.length - 1; index += 1) {
    const currentKey = keys[index];
    if (!isPlainObject(config[currentKey])) {
      config[currentKey] = {};
    }
    config = config[currentKey];
  }

  config[keys[keys.length - 1]] = cloneValue(value);
  persistUserConfig();
}

function loadUserConfig() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? sanitizeConfig(JSON.parse(raw)) : {};
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

function sanitizeConfig(config) {
  return deepMerge(defaultConfig, config);
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  const result = { ...base };

  for (const [key, value] of Object.entries(override || {})) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      result[key] = deepMerge(base[key], value);
    } else if (key in base) {
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
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)]));
  }
  return value;
}
