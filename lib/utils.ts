import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function makeId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getFriendlyAiError(status: number, body?: string) {
  if (status === 401 || status === 403) return "接口 Key 无效、权限不足，或当前能力未开通，请检查后重试。";
  if (status === 404) return "当前模型不存在或暂不可用，请更换模型。";
  if (status === 429) return "请求过于频繁或额度不足，请稍后再试。";
  if (status >= 500) return "接口服务暂时不可用，请稍后重试。";
  return body ? `接口返回错误：${body.slice(0, 240)}` : "接口请求失败。";
}
