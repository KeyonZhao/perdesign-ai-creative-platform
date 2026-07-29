const DEFAULT_VIDEO_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_VIDEO_MODEL = "doubao-seedance-2-0-260128";

export function getVolcengineVideoConfig() {
  const apiKey = process.env.PERDESIGN_VIDEO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "服务器尚未配置视频服务，请在 Vercel 环境变量中添加 PERDESIGN_VIDEO_API_KEY。"
    );
  }

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(
      process.env.PERDESIGN_VIDEO_BASE_URL?.trim() || DEFAULT_VIDEO_BASE_URL
    ),
    model: process.env.PERDESIGN_VIDEO_MODEL?.trim() || DEFAULT_VIDEO_MODEL
  };
}

export function volcengineVideoHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

export async function readVolcengineVideoResponse<T>(response: Response): Promise<T> {
  const rawText = await response.text();
  let payload: unknown;

  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = rawText;
  }

  if (!response.ok) {
    throw new Error(extractVideoError(payload) || `视频服务请求失败（HTTP ${response.status}）。`);
  }

  return payload as T;
}

function extractVideoError(payload: unknown) {
  if (typeof payload === "string") return payload.trim();
  if (!payload || typeof payload !== "object") return "";

  const record = payload as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    const message = typeof errorRecord.message === "string" ? errorRecord.message : "";
    const code = typeof errorRecord.code === "string" ? errorRecord.code : "";
    return [code, message].filter(Boolean).join("：");
  }

  return typeof record.message === "string" ? record.message : "";
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}
