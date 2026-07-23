import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function makeId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getFriendlyAiError(status: number, body?: string) {
  const providerMessage = extractProviderErrorMessage(body);
  const modelMatch = providerMessage.match(/no access to model\s+([^\s"'()]+)/i);

  if (modelMatch) {
    return `当前接口 Key 没有模型 ${modelMatch[1]} 的使用权限，请在供应商后台为该 Key 开通模型权限或更换可用 Key。`;
  }
  if (status === 401) return "接口 Key 无效或已失效，请检查供应商后台的 Key 配置。";
  if (status === 403) {
    return providerMessage
      ? `接口已拒绝当前请求：${providerMessage}`
      : "当前接口 Key 权限不足，或所请求的能力尚未开通。";
  }
  if (status === 404) return "当前模型不存在或暂不可用，请更换模型。";
  if (status === 429) return "请求过于频繁或额度不足，请稍后再试。";
  if (status >= 500) return "接口服务暂时不可用，请稍后重试。";
  return providerMessage ? `接口返回错误：${providerMessage}` : "接口请求失败。";
}

function extractProviderErrorMessage(body?: string) {
  if (!body) return "";

  try {
    const parsed = JSON.parse(body) as {
      error?: string | { message?: string };
      message?: string;
    };
    const message = typeof parsed.error === "string"
      ? parsed.error
      : parsed.error?.message || parsed.message;
    return typeof message === "string" ? message.trim().slice(0, 300) : "";
  } catch {
    return body.replace(/\s+/g, " ").trim().slice(0, 300);
  }
}
