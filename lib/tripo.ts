const TRIPO_BASE_URL = "https://openapi.tripo3d.com/v3";
const DEFAULT_TRIPO_MODEL = "P1-20260311";

type TripoEnvelope<T> = {
  code?: number;
  data?: T;
  message?: string;
};

export type TripoTask = {
  task_id: string;
  status: "queued" | "running" | "success" | "failed" | "cancelled" | "banned";
  progress?: number;
  output?: {
    model_url?: string;
    converted_model_url?: string;
    result_url?: string;
    model_urls?: string[] | Record<string, string>;
    rendered_image_url?: string;
  };
  message?: string;
};

export function getTripoApiKey() {
  const apiKey = process.env.TRIPO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("服务器尚未配置 Tripo 3D 服务，请添加 TRIPO_API_KEY。");
  }
  return apiKey;
}

export function getTripoModel() {
  return process.env.TRIPO_MODEL?.trim() || DEFAULT_TRIPO_MODEL;
}

export function tripoHeaders(apiKey: string, json = false) {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

export function tripoUrl(path: string) {
  return `${TRIPO_BASE_URL}${path}`;
}

export async function readTripoResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: TripoEnvelope<T> | undefined;

  try {
    payload = text ? JSON.parse(text) as TripoEnvelope<T> : undefined;
  } catch {
    // The upstream occasionally returns an HTML gateway error.
  }

  if (!response.ok || payload?.code !== 0 || !payload.data) {
    throw new Error(
      payload?.message ||
      `Tripo 服务请求失败（HTTP ${response.status}）。`
    );
  }

  return payload.data;
}

export function parseImageDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error("当前图片格式无法用于生成 3D 模型。");
  }

  const subtype = match[1].toLowerCase();
  const mimeType = subtype === "jpg" ? "image/jpeg" : `image/${subtype}`;
  const extension = subtype === "jpeg" ? "jpg" : subtype;
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");

  if (!bytes.length) throw new Error("当前图片内容为空。");
  if (bytes.length > 20 * 1024 * 1024) {
    throw new Error("图片不能超过 20MB。");
  }

  return { bytes, mimeType, extension };
}

export function isAllowedTripoModelUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "tripo3d.ai" ||
      host.endsWith(".tripo3d.ai") ||
      host === "tripo3d.com" ||
      host.endsWith(".tripo3d.com")
    );
  } catch {
    return false;
  }
}

export function getTripoOutputModelUrl(output?: TripoTask["output"]) {
  if (!output) return undefined;
  const modelUrls = Array.isArray(output.model_urls)
    ? output.model_urls
    : output.model_urls && typeof output.model_urls === "object"
      ? Object.values(output.model_urls)
      : [];
  return [
    output.model_url,
    output.converted_model_url,
    output.result_url,
    ...modelUrls
  ].find((value): value is string => typeof value === "string" && value.startsWith("https://"));
}
