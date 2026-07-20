import { appendFile, mkdir } from "fs/promises";
import { z } from "zod";
import { imageModels } from "./models";
import { buildPromptRepair, readSystemPrompt } from "./prompts";
import type { ConceptPrompt } from "./types";
import { getDataUrlMime } from "./image";
import { getFriendlyAiError, makeId } from "./utils";

const conceptSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(20)
});

const conceptListSchema = z.array(conceptSchema);
const IMAGE_DEBUG_LOG = `${process.cwd()}/logs/image-api-debug.log`;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

export async function callChatCompletion(params: {
  baseUrl?: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}) {
  const response = await fetch(`${resolveBaseUrl(params.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7
    })
  });

  const text = await response.text();
  if (!response.ok) throw new Error(getFriendlyAiError(response.status, text));

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("接口返回了无法解析的文本结果。");
  }

  const content = (json as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
  if (!content) throw new Error("接口没有返回有效文本内容。");
  return content;
}

export async function optimizeUserPrompt(params: { baseUrl?: string; apiKey: string; model: string; userPrompt: string }) {
  return callChatCompletion({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    model: params.model,
    temperature: 0.5,
    messages: [
      {
        role: "system",
        content:
          "你是资深工业设计提示词优化师。请保留用户核心意思，不改变产品结构、角度、比例，不添加无关场景，强化材质、工艺、CMF、细节、真实产品渲染和工业设计语言。只输出中文优化提示词。"
      },
      { role: "user", content: params.userPrompt }
    ]
  });
}

export async function analyzeReferenceStyle(params: {
  baseUrl?: string;
  apiKey: string;
  model: string;
  referenceImageBase64: string;
  referenceWeight?: number;
}) {
  const weight = Math.max(0, Math.min(100, params.referenceWeight ?? 0));

  return callChatCompletion({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    model: params.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an industrial design visual analyst. Read the input reference image and extract only reusable style language for image generation. Focus on CMF, materials, finish, color strategy, detail density, edge treatment, segmentation rhythm, lighting impression, and premium/tech feeling. Do not describe the literal subject identity. Output concise English only, in one paragraph, suitable for appending directly to an image prompt."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract visual style guidance from this reference image. Desired influence strength: ${weight}%.`
          },
          { type: "image_url", image_url: { url: params.referenceImageBase64 } }
        ]
      }
    ]
  });
}

export async function analyzeVisualInputs(params: {
  baseUrl?: string;
  apiKey: string;
  model: string;
  imageBase64?: string;
  referenceImageBase64?: string;
  referenceWeight?: number;
}) {
  const weight = Math.max(0, Math.min(100, params.referenceWeight ?? 0));
  const content: ChatMessage["content"] = [
    {
      type: "text",
      text: [
        "Read the uploaded images and extract only generation guidance.",
        params.imageBase64
          ? "If a product image is present, preserve its product category, main structure, proportions, silhouette logic, and viewpoint as much as possible."
          : "No product image is present.",
        params.referenceImageBase64
          ? `If a reference image is present, extract its reusable CMF, material, color, detailing, lighting, and premium/tech style language with about ${weight}% influence.`
          : "No reference image is present.",
        "Output concise English only, as one paragraph that can be appended directly to an image generation prompt.",
        "Do not restate these instructions. Do not output bullet points."
      ].join(" ")
    }
  ];

  if (params.imageBase64) {
    content.push({ type: "image_url", image_url: { url: params.imageBase64 } });
  }
  if (params.referenceImageBase64) {
    content.push({ type: "image_url", image_url: { url: params.referenceImageBase64 } });
  }

  return callChatCompletion({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    model: params.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an industrial design visual analyst. Convert uploaded images into reusable prompt constraints for image generation. Focus on structure, proportions, silhouette, CMF, materials, finish, color, detailing, segmentation rhythm, and render mood. Avoid mentioning unrelated objects or scene clutter."
      },
      {
        role: "user",
        content
      }
    ]
  });
}

export async function generateDesignPrompts(params: {
  baseUrl?: string;
  apiKey: string;
  brainModel?: string;
  imageBase64?: string;
  referenceImageBase64?: string;
  referenceWeight?: number;
  requirement: string;
  count: number;
}) {
  const systemPrompt = await readSystemPrompt();
  const hasProduct = Boolean(params.imageBase64);
  const hasReference = Boolean(params.referenceImageBase64 && (params.referenceWeight ?? 0) > 0);
  const referenceWeight = Math.max(0, Math.min(100, params.referenceWeight ?? 0));
  const content = await callChatCompletion({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    model: params.brainModel || "gpt-5.5",
    temperature: 0.85,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `用户变款要求：${params.requirement || "在保持原产品结构比例和视角的前提下，生成高端、真实、可量产的外观变款方案。"}`,
              hasProduct
                ? "第一张图片是产品原图，必须尽量保留产品品类、结构比例、主体体块和视角关系。"
                : "当前没有产品原图，请仅根据提示词生成高完成度的产品概念方案。",
              hasReference
                ? `有一张参考图，参考权重为 ${referenceWeight}%。请只参考其 CMF、材质、纹理、细节层级、品牌气质和工业设计语言。`
                : hasProduct
                  ? "没有参考图，请完全基于产品原图和用户要求生成方案。"
                  : "没有参考图，请完全基于提示词生成方案。",
              `请生成 ${params.count} 个差异化英文图像 Prompt。`,
              hasProduct
                ? hasReference
                  ? `每个英文 Prompt 都要自然体现 reference influence ${referenceWeight} percent，但必须明确 preserve original product structure, proportions, and camera angle。`
                  : "每个英文 Prompt 都必须明确 preserve original product structure, proportions, and camera angle。"
                : hasReference
                  ? `每个英文 Prompt 都要自然体现 reference influence ${referenceWeight} percent，并强化产品类别、材质、工业设计语言和真实渲染感。`
                  : "每个英文 Prompt 都要强化产品类别、工业设计语言、真实渲染、材质和细节。不要依赖原图结构。",
              "必须返回严格 JSON 数组，每项包含 title 和 prompt，不要 Markdown，不要解释。"
            ].join("\n")
          },
          ...(hasProduct ? [{ type: "image_url" as const, image_url: { url: params.imageBase64! } }] : []),
          ...(hasReference ? [{ type: "image_url" as const, image_url: { url: params.referenceImageBase64! } }] : [])
        ]
      }
    ]
  });

  return normalizeConcepts(content, params.count);
}

function normalizeConcepts(raw: string, count: number): ConceptPrompt[] {
  const stripped = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const arrayText = extractJsonArray(stripped);
  if (!arrayText) throw new Error("大脑模型没有返回可识别的 JSON 数组，请更换支持图片理解的模型后重试。");

  let parsed: unknown;
  try {
    parsed = JSON.parse(arrayText);
  } catch {
    throw new Error("大脑模型返回的方案格式不是有效 JSON，请重试或更换模型。");
  }

  const concepts = conceptListSchema.safeParse(parsed);
  if (!concepts.success || concepts.data.length === 0) {
    throw new Error("大脑模型返回的方案字段不完整，请重试。");
  }

  const normalized = concepts.data.map((item, index) => ({
    title: item.title || `Concept ${String(index + 1).padStart(2, "0")}`,
    prompt: buildPromptRepair(item.prompt)
  }));

  while (normalized.length < count) {
    const base = normalized[normalized.length % concepts.data.length];
    normalized.push({
      title: `Concept ${String(normalized.length + 1).padStart(2, "0")}`,
      prompt: buildPromptRepair(
        `${base.prompt}, unique alternative surface segmentation and CMF direction, clearly differentiated from previous concepts`
      )
    });
  }

  return normalized.slice(0, count);
}

function extractJsonArray(text: string) {
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first === -1 || last === -1 || last <= first) return null;
  return text.slice(first, last + 1);
}

export async function callImageEdit(params: {
  baseUrl?: string;
  apiKey: string;
  imageModel: string;
  inputImages: string[];
  prompt: string;
  referenceWeight?: number;
  hasProductImage?: boolean;
  hasReference?: boolean;
  size: string;
  quality: string;
}) {
  const model = imageModels.find((item) => item.value === params.imageModel);
  if (model && model.supportsEdit === false) {
    throw new Error("当前生图模型不支持图片编辑接口，请更换支持 image edit 的模型。");
  }
  if (!params.inputImages.length) {
    throw new Error("图片编辑接口缺少输入图片。");
  }

  const formData = new FormData();
  formData.append("model", params.imageModel);
  params.inputImages.forEach((image, index) => {
    const imageBlob = new Blob([Buffer.from(image.split(",")[1], "base64")], { type: getDataUrlMime(image) });
    formData.append("image", imageBlob, `input-image-${index + 1}.png`);
  });
  formData.append("prompt", buildImageEditPrompt(params.prompt, params));
  formData.append("n", "1");
  if (params.size !== "auto") formData.append("size", params.size);
  if (params.quality !== "auto") formData.append("quality", params.quality);
  formData.append("output_format", "png");
  formData.append("response_format", "b64_json");
  const endpoint = `${resolveBaseUrl(params.baseUrl)}/images/edits`;

  await writeImageDebugLog({
    phase: "request",
    source: "images/edits",
    endpoint,
    baseUrl: resolveBaseUrl(params.baseUrl),
    model: params.imageModel,
    size: params.size,
    quality: params.quality,
    hasProductImage: Boolean(params.hasProductImage),
    hasReference: Boolean(params.hasReference),
    referenceWeight: params.referenceWeight ?? 0,
    inputImageCount: params.inputImages.length,
    promptPreview: clipText(params.prompt, 500)
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${params.apiKey}` },
      body: formData
    });
  } catch (error) {
    await writeImageDebugLog({
      phase: "network_error",
      source: "images/edits",
      endpoint,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? clipText(error.stack, 1200) : undefined
    });
    throw new Error(`图片编辑请求失败：${error instanceof Error ? error.message : "未知网络错误"}`);
  }

  const text = await response.text();
  await writeImageDebugLog({
    phase: "response",
    source: "images/edits",
    endpoint,
    status: response.status,
    ok: response.ok,
    headers: summarizeHeaders(response.headers),
    bodyPreview: clipText(text, 4000)
  });
  if (!response.ok) throw new Error(getFriendlyAiError(response.status, text));

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    await writeImageDebugLog({
      phase: "parse_error",
      source: "images/edits",
      endpoint,
      bodyPreview: clipText(text, 1200)
    });
    throw new Error("图片接口返回了无法解析的结果。");
  }

  return normalizeImageResultToDataUrl(json, params.apiKey, "images/edits");
}

export async function callImageGeneration(params: {
  baseUrl?: string;
  apiKey: string;
  imageModel: string;
  prompt: string;
  referenceWeight?: number;
  hasReference?: boolean;
  size: string;
  quality: string;
}) {
  const endpoint = `${resolveBaseUrl(params.baseUrl)}/images/generations`;
  await writeImageDebugLog({
    phase: "request",
    source: "images/generations",
    endpoint,
    baseUrl: resolveBaseUrl(params.baseUrl),
    model: params.imageModel,
    size: params.size,
    quality: params.quality,
    hasReference: Boolean(params.hasReference),
    referenceWeight: params.referenceWeight ?? 0,
    promptPreview: clipText(params.prompt, 500)
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: params.imageModel,
        prompt: params.prompt,
        n: 1,
        ...(params.size !== "auto" ? { size: params.size } : {}),
        ...(params.quality !== "auto" ? { quality: params.quality } : {}),
        output_format: "png",
        response_format: "b64_json"
      })
    });
  } catch (error) {
    await writeImageDebugLog({
      phase: "network_error",
      source: "images/generations",
      endpoint,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? clipText(error.stack, 1200) : undefined
    });
    throw new Error(`图片生成请求失败：${error instanceof Error ? error.message : "未知网络错误"}`);
  }

  const text = await response.text();
  await writeImageDebugLog({
    phase: "response",
    source: "images/generations",
    endpoint,
    status: response.status,
    ok: response.ok,
    headers: summarizeHeaders(response.headers),
    bodyPreview: clipText(text, 4000)
  });
  if (!response.ok) throw new Error(getFriendlyAiError(response.status, text));

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    await writeImageDebugLog({
      phase: "parse_error",
      source: "images/generations",
      endpoint,
      bodyPreview: clipText(text, 1200)
    });
    throw new Error("图片接口返回了无法解析的结果。");
  }

  return normalizeImageResultToDataUrl(json, params.apiKey, "images/generations");
}

function buildImageEditPrompt(
  prompt: string,
  options: { hasProductImage?: boolean; hasReference?: boolean; referenceWeight?: number }
) {
  const parts: string[] = [];
  const weight = Math.max(0, Math.min(100, options.referenceWeight ?? 0));
  const trimmedPrompt = prompt.trim();

  if (options.hasProductImage && options.hasReference) {
    parts.push("Input image order: image 1 is the source product image. image 2 is the reference style image.");
    parts.push("Keep the main structure, proportions, and viewpoint of image 1.");
    parts.push(buildReferenceWeightInstruction(weight));
  } else if (options.hasProductImage) {
    parts.push("Use the input image as the source product. Keep its main structure, proportions, and viewpoint.");
  } else if (options.hasReference) {
    parts.push("Use the input image as a real visual reference.");
    parts.push(buildReferenceWeightInstruction(weight));
    parts.push("Do not simply recreate the reference image subject unless the user explicitly asks for that.");
  }

  if (trimmedPrompt) {
    parts.push(`User description (keep this intent exactly, do not rewrite it): ${trimmedPrompt}`);
  } else if (options.hasProductImage) {
    parts.push("Create a refined industrial design variation with premium CMF, realistic rendering, and a clean background.");
  } else if (options.hasReference) {
    parts.push("Create a new product concept guided by the visual style of the input reference image, with realistic rendering and a clean background.");
  } else {
    parts.push("Create a premium industrial design product concept, realistic rendering, clean background.");
  }

  return parts.join("\n");
}

export function mergeReferenceStyleIntoPrompt(prompt: string, referenceStyleSummary?: string) {
  const base = prompt.trim();
  const style = referenceStyleSummary?.trim();
  if (!style) return base;

  return [base, `Reference style guidance: ${style}`].filter(Boolean).join("\n");
}

export function mergeVisualGuidanceIntoPrompt(prompt: string, visualGuidance?: string) {
  const base = prompt.trim();
  const guidance = visualGuidance?.trim();
  if (!guidance) return base;

  return [base, `Visual guidance: ${guidance}`].filter(Boolean).join("\n");
}

function buildReferenceWeightInstruction(weight: number) {
  if (weight <= 0) {
    return "Use the reference image only as a very light visual cue for CMF and design language.";
  }
  if (weight <= 25) {
    return `Use the reference image as a light visual reference, with about ${weight}% influence on CMF, material, color language, and detailing.`;
  }
  if (weight <= 55) {
    return `Use the reference image as a balanced visual reference, with about ${weight}% influence on CMF, material, color language, and detailing.`;
  }
  if (weight <= 80) {
    return `Use the reference image as a strong visual reference, with about ${weight}% influence on CMF, material, color language, and detailing.`;
  }
  return `Use the reference image as a very strong visual reference, with about ${weight}% influence on CMF, material, color language, and detailing.`;
}

export async function normalizeImageResultToDataUrl(json: unknown, apiKey?: string, source = "image api") {
  const item = (json as { data?: Array<{ b64_json?: string; url?: string }> }).data?.[0];
  if (!item) {
    await writeImageDebugLog({
      phase: "result_shape_error",
      source,
      payloadSummary: summarizeImagePayload(json)
    });
    throw new Error(`图片接口没有返回标准图片数据。来源：${source}。返回结构：${summarizeImagePayload(json)}`);
  }
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (!item.url) {
    await writeImageDebugLog({
      phase: "result_shape_error",
      source,
      payloadSummary: summarizeImagePayload(json)
    });
    throw new Error(`图片接口返回中没有 b64_json 或 url。来源：${source}。返回结构：${summarizeImagePayload(json)}`);
  }
  const imageUrl = item.url;

  const attempts = [
    () => fetch(imageUrl),
    () => fetch(imageUrl, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined })
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const response = await attempt();
      await writeImageDebugLog({
        phase: "download_response",
        source,
        imageUrl,
        status: response.status,
        ok: response.ok,
        headers: summarizeHeaders(response.headers)
      });
      if (!response.ok) {
        lastError = new Error(`图片 URL 下载失败（${response.status}）。`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "image/png";
      return `data:${contentType};base64,${buffer.toString("base64")}`;
    } catch (error) {
      await writeImageDebugLog({
        phase: "download_error",
        source,
        imageUrl,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      lastError = error;
    }
  }

  if (lastError instanceof Error && lastError.message) {
    throw new Error(`图片结果拉取失败：${lastError.message}`);
  }
  throw new Error("图片结果拉取失败，请稍后重试。");
}

function summarizeImagePayload(json: unknown) {
  if (json === null || json === undefined) return "empty";
  if (Array.isArray(json)) return `array(len=${json.length})`;
  if (typeof json !== "object") return typeof json;

  const record = json as Record<string, unknown>;
  const topKeys = Object.keys(record).slice(0, 8);
  const data = Array.isArray(record.data) ? record.data : null;
  const firstDataItem = data?.[0];
  const firstDataKeys =
    firstDataItem && typeof firstDataItem === "object" && !Array.isArray(firstDataItem)
      ? Object.keys(firstDataItem as Record<string, unknown>).slice(0, 8)
      : [];
  const taskKeys =
    record.task && typeof record.task === "object" && !Array.isArray(record.task)
      ? Object.keys(record.task as Record<string, unknown>).slice(0, 8)
      : [];

  return [
    `topKeys=${topKeys.join(",") || "none"}`,
    data ? `dataLen=${data.length}` : "data=missing",
    firstDataKeys.length ? `data0Keys=${firstDataKeys.join(",")}` : "",
    taskKeys.length ? `taskKeys=${taskKeys.join(",")}` : ""
  ]
    .filter(Boolean)
    .join("; ");
}

async function writeImageDebugLog(payload: Record<string, unknown>) {
  try {
    await mkdir(`${process.cwd()}/logs`, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...payload
    });
    await appendFile(IMAGE_DEBUG_LOG, `${line}\n`, "utf8");
  } catch {
    // swallow debug log failures
  }
}

function clipText(value: string | undefined, limit: number) {
  if (!value) return value;
  return value.length <= limit ? value : `${value.slice(0, limit)}...<clipped>`;
}

function summarizeHeaders(headers: Headers) {
  const summary: Record<string, string> = {};
  const allow = ["content-type", "content-length", "transfer-encoding", "location", "x-request-id", "server", "date"];
  for (const key of allow) {
    const value = headers.get(key);
    if (value) summary[key] = value;
  }
  return summary;
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function failedResult(concept: ConceptPrompt, error: unknown, index: number) {
  return {
    id: makeId(`failed-${index}`),
    title: concept.title,
    prompt: concept.prompt,
    error: error instanceof Error ? error.message : "单张图片生成失败。"
  };
}

function resolveBaseUrl(value?: string) {
  const normalized = String(value || "https://aihubmix.com/v1").trim().replace(/\/+$/, "");
  return normalized;
}
