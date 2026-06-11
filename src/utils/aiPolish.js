import forge from "node-forge";

const AI_POLISH_PROXY_ENDPOINT = "/api/ai-polish";
const AI_POLISH_MODEL = "GPT-OSS-120B";
const AI_KEY_STORAGE = "classworks_ai_polish_secret";

const ENCRYPTED_AI_KEY = {
  iv: "/tan0Id/aMC3kkhE",
  data: "JlJiM41TCFoun+aYILgHugHq69U0pz5x0Ddt/2/AHDAWOQHc/Wg77yO9KcH+oCO8mZnr",
  tag: "IQzrXccczA/8v445krbYvQ==",
};

export const AI_POLISH_PROVIDER_LABEL = "api.tianhw.top";
export const AI_POLISH_MODEL_LABEL = AI_POLISH_MODEL;

const SYSTEM_PROMPT = [
  "你是课程作业卡片的格式整理助手，只做删减和整理，不扩写，不解释。",
  "只输出最终能显示在作业卡片上的文本，不要标题、Markdown、引号或说明。",
  "保留作业任务、编号、题名、页码、范围、收交时间、检查时间。",
  "删除学生名单、背诵名单、背诵内容、课堂闲话、讲话、情绪提醒和无关句子。",
  "如果括号里是收交或检查信息则保留；如果只是批评、鼓励、催促则删除。",
  "多项作业逐行输出，不要把不同编号合并成一行。",
].join("\n");

const USER_PROMPT_PREFIX = `按规则整理下面的课程作业文本。
示例1
原文：整理错题【明天收】大题还没讲，不要顾前不顾后！应该尽改！
输出：整理错题【明天收】
示例2
原文：1、整理错题【一个也要好好改！昨天没改好的应改尽改！】
2、课时数智作业 热力环流 P29-30【明天收】
今日背诵名单：杨雅荀 朱晨宇 王家顺
背诵内容：大都市辐射相关
输出：1、整理错题
2、课时数智作业 热力环流 P29-30【明天收】
示例3
原文：1、学案后的7个选择
2、同步P12-15所有选择9个及P14光伏电站大题
共17+1
明天下早读收同步，明课前检查学案
输出：1、学案后的7个选择（课前检查）
2、同步P12-15所有选择9个及P14光伏电站大题（共17+1）（明天下早读收）
现在只输出整理结果：
`;

export function hasSavedAiSecret() {
  return Boolean(readSavedSecret());
}

export async function saveAiSecret(secret) {
  const normalizedSecret = normalizeSecret(secret);
  if (!normalizedSecret) {
    throw new Error("AI_SECRET_REQUIRED");
  }

  await decryptAiKey(normalizedSecret);
  localStorage.setItem(AI_KEY_STORAGE, normalizedSecret);
}

export function clearSavedAiSecret() {
  localStorage.removeItem(AI_KEY_STORAGE);
}

export async function polishHomework(content, secret, options = {}) {
  const source = normalizeInput(content);
  if (!source) {
    throw new Error("EMPTY_CONTENT");
  }

  const apiKey = await resolveAiKey(secret);
  const response = await raceAiPolishRequests({
    apiKey,
    source,
    signal: options.signal,
  });

  const data = await parseResponseSafely(response);

  if (!response.ok) {
    const code = data?.error?.code || `AI_POLISH_FAILED_${response.status}`;
    throw new Error(code);
  }

  const polished = extractPolishedText(data) || extractRawTextResponse(data);

  if (!polished) {
    const fallback = formatHomeworkLocally(source);
    if (fallback) {
      return fallback;
    }
    return numberHomeworkLines(source);
  }

  return normalizeHomework(polished);
}

async function raceAiPolishRequests({ apiKey, source, signal }) {
  const controllers = [new AbortController(), new AbortController()];
  const cleanup = linkAbortSignal(signal, controllers);

  try {
    return await Promise.any(
      controllers.map((controller, index) =>
        sendAiPolishRequest({
          apiKey,
          source,
          signal: controller.signal,
          requestTag: index + 1,
        }).then((response) => {
          controllers.forEach((item) => {
            if (item !== controller) {
              item.abort();
            }
          });
          return response;
        })
      )
    );
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("AI_POLISH_ABORTED");
    }

    const firstError = error?.errors?.find(Boolean) || error;
    if (firstError?.name === "AbortError") {
      throw new Error("AI_POLISH_ABORTED");
    }
    throw firstError;
  } finally {
    cleanup();
    controllers.forEach((controller) => controller.abort());
  }
}

async function sendAiPolishRequest({ apiKey, source, signal, requestTag }) {
  try {
    return await fetch(AI_POLISH_PROXY_ENDPOINT, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey,
        model: AI_POLISH_MODEL,
        content: source,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: `${USER_PROMPT_PREFIX}${source}`,
        requestTag,
      }),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    throw error;
  }
}

function linkAbortSignal(parentSignal, controllers) {
  if (!parentSignal) {
    return () => {};
  }

  if (parentSignal.aborted) {
    controllers.forEach((controller) => controller.abort());
    return () => {};
  }

  const abortHandler = () => {
    controllers.forEach((controller) => controller.abort());
  };

  parentSignal.addEventListener("abort", abortHandler, { once: true });
  return () => parentSignal.removeEventListener("abort", abortHandler);
}

async function resolveAiKey(secret) {
  const inputSecret = normalizeSecret(secret);
  const savedSecret = inputSecret || readSavedSecret();
  if (!savedSecret) {
    throw new Error("AI_SECRET_REQUIRED");
  }

  try {
    return await decryptAiKey(savedSecret);
  } catch {
    clearSavedAiSecret();
    throw new Error("AI_SECRET_INVALID");
  }
}

async function decryptAiKey(secret) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const keyMaterial = await subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const key = await subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["decrypt"]);
    const payload = concatBytes(base64ToBytes(ENCRYPTED_AI_KEY.data), base64ToBytes(ENCRYPTED_AI_KEY.tag));
    const decrypted = await subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(ENCRYPTED_AI_KEY.iv), tagLength: 128 },
      key,
      payload
    );
    return new TextDecoder().decode(decrypted);
  }

  return decryptAiKeyWithForge(secret);
}

async function decryptAiKeyWithForge(secret) {
  const digest = forge.md.sha256.create();
  digest.update(secret, "utf8");
  const keyBytes = digest.digest().getBytes();
  const decipher = forge.cipher.createDecipher("AES-GCM", keyBytes);

  decipher.start({
    iv: forge.util.decode64(ENCRYPTED_AI_KEY.iv),
    tag: forge.util.createBuffer(forge.util.decode64(ENCRYPTED_AI_KEY.tag)),
    tagLength: 128,
  });
  decipher.update(forge.util.createBuffer(forge.util.decode64(ENCRYPTED_AI_KEY.data)));

  if (!decipher.finish()) {
    throw new Error("AI_SECRET_INVALID");
  }

  return forge.util.decodeUtf8(decipher.output.getBytes());
}

function readSavedSecret() {
  try {
    return localStorage.getItem(AI_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

function normalizeSecret(secret) {
  return String(secret || "").trim();
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concatBytes(left, right) {
  const result = new Uint8Array(left.length + right.length);
  result.set(left, 0);
  result.set(right, left.length);
  return result;
}

async function parseResponseSafely(response) {
  try {
    const rawText = await response.text();
    if (!rawText.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === "object") {
        return {
          ...parsed,
          __rawText: rawText,
        };
      }
      return {
        __rawText: rawText,
        value: parsed,
      };
    } catch {
      return {
        __rawText: rawText,
      };
    }
  } catch {
    return {};
  }
}

function normalizeInput(content) {
  return String(content || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeHomework(content) {
  return normalizeInput(content)
    .split("\n")
    .map((line) => removeNonTaskBrackets(line).trim())
    .filter(Boolean)
    .filter((line) => !isNonTaskLine(line))
    .slice(0, 12)
    .join("\n");
}

function extractPolishedText(data) {
  const choice = data?.choices?.[0];
  const candidateValues = [
    choice?.message,
    choice?.delta,
    data?.message,
    data?.output_text,
    data?.output?.text,
    data?.response,
    data?.text,
    data?.content,
  ];

  for (const candidate of candidateValues) {
    const text = extractAiMessageText(candidate);
    if (text) {
      return text;
    }
  }

  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      const text = extractAiMessageText(item);
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function extractRawTextResponse(data) {
  const rawText = String(data?.__rawText || "").trim();
  if (!rawText) {
    return "";
  }

  if (rawText.startsWith("{") || rawText.startsWith("[")) {
    return "";
  }

  return rawText;
}

function extractAiMessageText(message) {
  if (typeof message === "string" || Array.isArray(message)) {
    const directText = readContentText(message);
    if (directText) {
      return directText;
    }
  }

  const contentText = readContentText(message?.content);
  if (contentText) {
    return contentText;
  }

  const directText = readContentText(message?.text || message?.output_text);
  if (directText) {
    return directText;
  }

  const nestedOutputText = readOutputText(message?.output);
  if (nestedOutputText) {
    return nestedOutputText;
  }

  return extractFinalAnswerFromReasoning(
    readContentText(message?.reasoning_content || message?.reasoning || message?.output?.reasoning)
  );
}

function readContentText(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || part?.content || ""))
      .join("")
      .trim();
  }

  return "";
}

function readOutputText(output) {
  if (!Array.isArray(output)) {
    return "";
  }

  return output
    .flatMap((item) => {
      if (typeof item === "string") {
        return [item];
      }
      if (Array.isArray(item?.content)) {
        return item.content.map((part) => part?.text || part?.content || "");
      }
      return [item?.text || item?.content || outputItemText(item)];
    })
    .join("")
    .trim();
}

function outputItemText(item) {
  if (!item || typeof item !== "object") {
    return "";
  }

  if (Array.isArray(item.output)) {
    return readOutputText(item.output);
  }

  return "";
}

function extractFinalAnswerFromReasoning(reasoningText) {
  if (!reasoningText) {
    return "";
  }

  const match = reasoningText.match(/(?:输出|最终答案|整理结果)[:：]?\s*([\s\S]+)$/u);
  return cleanupExtractedAnswer(match?.[1] || "");
}

function cleanupExtractedAnswer(text) {
  const cleaned = String(text || "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^```[\w-]*\n?|\n?```$/g, "")
    .trim();

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(说明|注意|其中|示例|原文|输出)[:：]/u.test(line));

  const numbered = lines.filter((line) => /^\d+[、.)）]/u.test(line));
  return (numbered.length ? numbered : lines).join("\n");
}

function formatHomeworkLocally(content) {
  const lines = normalizeInput(content).split("\n");
  const tasks = [];
  const plainTasks = [];

  for (const line of lines) {
    const taskMatch = line.match(/^(\d+[、.)）])\s*(.+)$/u);
    if (taskMatch) {
      tasks.push({
        prefix: taskMatch[1].replace(/[.)）]/u, "、"),
        text: taskMatch[2].trim(),
        notes: [],
      });
      continue;
    }

    const current = tasks[tasks.length - 1];
    if (isNonTaskLine(line)) {
      continue;
    }

    if (!current) {
      const normalizedLine = normalizePlainTaskLine(line);
      if (normalizedLine) {
        plainTasks.push(normalizedLine);
      }
      continue;
    }

    if (/^(共\s*[\d+＋+]+|第?\d+题)/u.test(line) || /大题|选择|填空|问答/u.test(line)) {
      current.text = `${current.text}${line}`.replace(/\s+/g, " ").trim();
      continue;
    }

    if (/^共\s*[\d+＋+]+/u.test(line)) {
      addNote(current, line.replace(/\s+/g, ""));
      continue;
    }

    applyGlobalNote(tasks, line);
  }

  const numberedTasks = tasks
    .map((task) => `${task.prefix}${task.text}${task.notes.map((note) => `（${note}）`).join("")}`)
    .filter(Boolean);

  if (numberedTasks.length) {
    return numberedTasks.join("\n");
  }

  return numberPlainTasks(plainTasks).join("\n");
}

function applyGlobalNote(tasks, line) {
  const compact = line.replace(/\s+/g, "");

  if (/早读收.*同步|同步.*早读收/u.test(compact)) {
    const task = tasks.find((item) => /同步/u.test(item.text)) || tasks[tasks.length - 1];
    addNote(task, compact.includes("明天") ? "明天下早读收" : "早读收");
  }

  if (/课前检查.*学案|检查学案|学案.*课前检查/u.test(compact)) {
    const task = tasks.find((item) => /学案/u.test(item.text)) || tasks[0];
    addNote(task, "课前检查");
  }
}

function addNote(task, note) {
  if (task && note && !task.notes.includes(note)) {
    task.notes.push(note);
  }
}

function removeNonTaskBrackets(line) {
  return line.replace(/[【\[]([^【】\[\]]+)[】\]]/g, (match, inner) => {
    return /(收|交|截止|明天|今天|早读|周|星期|课前|检查)/u.test(inner) ? match : "";
  });
}

function normalizePlainTaskLine(line) {
  const cleaned = removeNonTaskBrackets(String(line || ""))
    .replace(/[！!。；;]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  if (isNonTaskLine(cleaned)) {
    return "";
  }

  if (/^(贴好|抓紧时间买|统一贴本子上|有些人不贴|不要浪费我的心血)/u.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function numberHomeworkLines(content) {
  const lines = normalizeInput(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return "";
  }

  return lines.map((line, index) => `${index + 1}、${line}`).join("\n");
}

function numberPlainTasks(tasks) {
  return tasks
    .map((task) => String(task || "").trim())
    .filter(Boolean)
    .map((task, index) => `${index + 1}、${task}`);
}

function isNonTaskLine(line) {
  const normalized = line.replace(/\s/g, "");
  if (/^(今日)?背诵名单[:：]/u.test(line)) return true;
  if (/^背诵内容[:：]/u.test(line)) return true;
  if (/^(名单|学生名单|未交名单|没交名单)[:：]/u.test(line)) return true;

  return /(一个也要好好改|应改尽改|不要顾前顾后|不要顾前不顾后|好好改|认真改|抓紧|别忘|提醒一下)/u.test(
    normalized
  );
}
