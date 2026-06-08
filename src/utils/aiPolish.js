import forge from "node-forge";

const AI_POLISH_ENDPOINT = "https://api.tianhw.top/v1/chat/completions";
const AI_POLISH_MODEL = "GPT-OSS-120B";
const AI_KEY_STORAGE = "classworks_ai_polish_secret";

const ENCRYPTED_AI_KEY = {
  iv: "/tan0Id/aMC3kkhE",
  data: "JlJiM41TCFoun+aYILgHugHq69U0pz5x0Ddt/2/AHDAWOQHc/Wg77yO9KcH+oCO8mZnr",
  tag: "IQzrXccczA/8v445krbYvQ==",
};

export const AI_POLISH_PROVIDER_LABEL = "TianHW";
export const AI_POLISH_MODEL_LABEL = AI_POLISH_MODEL;

const SYSTEM_PROMPT = [
  "你是地理作业卡片的格式整理助手，只做删减和整理，不扩写、不解释。",
  "只输出最终能展示在作业卡片上的文本，不要标题、Markdown、引号或说明。",
  "保留作业任务、编号、题名、页码、范围、收交时间、检查时间。",
  "删除学生名单、背诵名单、背诵内容、课堂闲话、训话、情绪提醒和无关句子。",
  "如果括号里是收交或检查信息则保留；如果只是批评、鼓励、催促则删除。",
  "多项作业逐行输出，不要把不同编号合并成一行。",
].join("\n");

const USER_PROMPT_PREFIX = `按规则整理下面的地理作业文本。

示例1
原文：整理错题【明天收】大题还没讲，不要顾前不顾后！应该尽改！
输出：整理错题【明天收】

示例2
原文：1、整理错题
【一个也要好好改！昨天没改好的应改尽改！】
2、课时数智作业  热力环流 P29-30【明天收】
今日背诵名单：杨雅荀 朱晨宇 王家顺
背诵内容：大都市辐射相关
输出：1、整理错题
2、课时数智作业  热力环流 P29-30【明天收】

示例3
原文：1、学案后的4个选择
2、同步P12-15所有选择 9个 及P14光伏电站大题
共17+1
明天下早读收同步，明课前检查学案
输出：1、学案后的4个选择（课前检查）
2、同步P12-15所有选择 9个及P14光伏电站大题（共17+1）（明天下早读收）

现在只输出整理结果：
`;

export function hasSavedAiSecret() {
  return Boolean(readSavedSecret());
}

export async function saveAiSecret(secret) {
  const normalizedSecret = String(secret || "").trim();
  if (!normalizedSecret) throw new Error("AI_SECRET_REQUIRED");
  await decryptAiKey(normalizedSecret);
  localStorage.setItem(AI_KEY_STORAGE, normalizedSecret);
}

export function clearSavedAiSecret() {
  localStorage.removeItem(AI_KEY_STORAGE);
}

export async function polishGeographyHomework(content, secret) {
  const source = normalizeInput(content);
  if (!source) throw new Error("EMPTY_CONTENT");

  const apiKey = await resolveAiKey(secret);
  const response = await fetch(AI_POLISH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: AI_POLISH_MODEL,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: "low",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${USER_PROMPT_PREFIX}${source}` },
      ],
    }),
  });

  if (!response.ok) throw new Error(`AI_POLISH_FAILED_${response.status}`);

  const data = await response.json();
  const choice = data?.choices?.[0];
  const polished = extractAiMessageText(choice?.message);

  if (!polished) {
    const fallback = formatGeographyHomeworkLocally(source);
    if (fallback) return fallback;
    if (choice?.finish_reason === "length") throw new Error("AI_OUTPUT_TRUNCATED");
    throw new Error("EMPTY_AI_RESPONSE");
  }

  return normalizeGeographyHomework(polished);
}

async function resolveAiKey(secret) {
  const normalizedSecret = String(secret || "").trim();
  const savedSecret = normalizedSecret || readSavedSecret();
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
  if (globalThis.crypto?.subtle) {
    const keyMaterial = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const key = await globalThis.crypto.subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["decrypt"]);
    const payload = concatBytes(base64ToBytes(ENCRYPTED_AI_KEY.data), base64ToBytes(ENCRYPTED_AI_KEY.tag));
    const decrypted = await globalThis.crypto.subtle.decrypt(
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
  const ivBytes = forge.util.decode64(ENCRYPTED_AI_KEY.iv);
  const encryptedBytes = forge.util.decode64(ENCRYPTED_AI_KEY.data);
  const tagBytes = forge.util.decode64(ENCRYPTED_AI_KEY.tag);

  decipher.start({
    iv: ivBytes,
    tag: forge.util.createBuffer(tagBytes),
    tagLength: 128,
  });
  decipher.update(forge.util.createBuffer(encryptedBytes));

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

function normalizeInput(content) {
  return String(content || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeGeographyHomework(content) {
  return normalizeInput(content)
    .split("\n")
    .map((line) => removeNonTaskBrackets(line).trim())
    .filter(Boolean)
    .filter((line) => !isNonTaskLine(line))
    .slice(0, 12)
    .join("\n");
}

function extractAiMessageText(message) {
  const contentText = readContentText(message?.content);
  if (contentText) return contentText;
  return extractFinalAnswerFromReasoning(readContentText(message?.reasoning_content || message?.reasoning));
}

function readContentText(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : part?.text || part?.content || "")).join("").trim();
  }
  return "";
}

function extractFinalAnswerFromReasoning(reasoningText) {
  if (!reasoningText) return "";
  const match = reasoningText.match(/(?:输出|最终答案|整理结果)[:：]?\s*([\s\S]+)$/u);
  return cleanupExtractedAnswer(match?.[1] || "");
}

function cleanupExtractedAnswer(text) {
  const cleaned = String(text || "")
    .replace(/^["“”]+|["“”]+$/g, "")
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

function formatGeographyHomeworkLocally(content) {
  const lines = normalizeInput(content).split("\n");
  const tasks = [];

  for (const line of lines) {
    const taskMatch = line.match(/^(\d+[、.)）])\s*(.+)$/u);
    if (taskMatch) {
      tasks.push({ prefix: taskMatch[1].replace(/[.)）]/u, "、"), text: taskMatch[2].trim(), notes: [] });
      continue;
    }

    const current = tasks[tasks.length - 1];
    if (!current || isNonTaskLine(line)) continue;

    if (/^(及|和|与|并|P\d+|第\d+题)/u.test(line) || /大题|选择|填空|问答/u.test(line)) {
      current.text = `${current.text}${line}`.replace(/\s+/g, " ").trim();
      continue;
    }

    if (/^共\s*[\d+＋+-]+/u.test(line)) {
      addNote(current, line.replace(/\s+/g, ""));
      continue;
    }

    applyGlobalNote(tasks, line);
  }

  return tasks.map((task) => `${task.prefix}${task.text}${task.notes.map((note) => `（${note}）`).join("")}`).join("\n");
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
  if (task && note && !task.notes.includes(note)) task.notes.push(note);
}

function removeNonTaskBrackets(line) {
  return line.replace(/[【\[]([^【】\[\]]+)[】\]]/g, (match, inner) => {
    return /(收|交|截止|明天|今天|早读|周|星期|课前|检查)/u.test(inner) ? match : "";
  });
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
