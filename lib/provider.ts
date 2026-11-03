type ProviderConfigInput = {
  apiKey?: string;
  baseUrl?: string;
};

type ProviderService = "chat" | "image";

export const SERVER_MANAGED_API_KEY = "server-managed";
export const DEFAULT_CHAT_PROVIDER_BASE_URL = "https://api2.65535.space/v1";
export const DEFAULT_IMAGE_PROVIDER_BASE_URL = "https://task-api-1.65535.space/apimart/v1";

export function resolveProviderConfig(input: ProviderConfigInput, service: ProviderService) {
  const servicePrefix = service === "image" ? "PERDESIGN_IMAGE" : "PERDESIGN_CHAT";
  const serverApiKey =
    process.env[`${servicePrefix}_API_KEY`]?.trim() ||
    process.env.PERDESIGN_PROVIDER_API_KEY?.trim();
  const serverBaseUrl =
    process.env[`${servicePrefix}_BASE_URL`]?.trim() ||
    process.env.PERDESIGN_PROVIDER_BASE_URL?.trim();
  // Accounts use company-owned server credentials; never accept a client destination/key.
  const apiKey = serverApiKey;
  const defaultBaseUrl = service === "image"
    ? DEFAULT_IMAGE_PROVIDER_BASE_URL
    : DEFAULT_CHAT_PROVIDER_BASE_URL;
  const baseUrl = serverBaseUrl || defaultBaseUrl;

  if (!apiKey) {
    throw new Error(`服务器尚未配置${service === "image" ? "生图" : "文本"}服务。`);
  }

  return {
    apiKey,
    baseUrl: normalizeProviderBaseUrl(baseUrl)
  };
}

function normalizeProviderBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}
