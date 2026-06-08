import { polishGeographyHomework, saveAiSecret, hasSavedAiSecret } from "./aiPolish";
import { resolvePolishErrorMessage } from "./homeworkEditor";

export async function ensureAiSecret(promptText) {
  if (hasSavedAiSecret()) {
    return "";
  }

  const secret = window.prompt(promptText);
  if (secret == null) {
    throw new Error("AI_SECRET_REQUIRED");
  }

  const normalizedSecret = secret.trim();
  if (!normalizedSecret) {
    throw new Error("AI_SECRET_REQUIRED");
  }

  await saveAiSecret(normalizedSecret);
  return normalizedSecret;
}

export async function requestAiPolish(content, promptText, options = {}) {
  const secret = await ensureAiSecret(promptText);
  return polishGeographyHomework(content, secret, options);
}

export function getAiPolishError(error) {
  return resolvePolishErrorMessage(error);
}
