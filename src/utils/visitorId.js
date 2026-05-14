let cachedVisitorId = null;

const generateLocalVisitorId = () => {
  // 尝试从 localStorage 获取已有的 ID
  const stored = localStorage.getItem('classworks_visitor_id');
  if (stored) {
    cachedVisitorId = stored;
    return stored;
  }

  // 生成新的本地 ID
  let newId;
  
  // 优先使用 crypto API（现代浏览器）
  if (crypto?.randomUUID) {
    newId = crypto.randomUUID();
  } else {
    // 回退方案：使用时间戳 + 随机数
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 15);
    const randomPart2 = Math.random().toString(36).substring(2, 15);
    newId = `${timestamp}-${randomPart}-${randomPart2}`;
  }

  // 存储 ID
  localStorage.setItem('classworks_visitor_id', newId);
  cachedVisitorId = newId;
  
  return newId;
};

export const loadFingerprint = () => {
  return Promise.resolve({
    get: async () => ({
      visitorId: generateLocalVisitorId(),
      error: null,
      fallback: false,
      method: 'local',
    }),
  });
};

export const getVisitorId = async () => {
  if (!cachedVisitorId) {
    generateLocalVisitorId();
  }
  return cachedVisitorId || 'unknown';
};

export const getFingerprintData = async () => {
  return {
    visitorId: await getVisitorId(),
    error: null,
    fallback: false,
    method: 'local',
  };
};
