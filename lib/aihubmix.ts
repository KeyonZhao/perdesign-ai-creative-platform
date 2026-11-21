import { auditedFetch } from "@/lib/call-audit";
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
const IMAGE_FETCH_RETRY_DELAYS_MS = [800, 1800];
const PROMPT_FALLBACK_MODEL = process.env.PERDESIGN_PROMPT_FALLBACK_MODEL?.trim() || "gpt-6-astra";

export type AsyncImageSubmission = {
  jobId: string;
  status: string;
  created?: number;
};

export type AsyncImageJob =
  | { status: "pending" | "running"; jobId: string }
  | { status: "done"; jobId: string; imageBase64: string; imageUrl: string }
  | { status: "failed"; jobId: string; error: string };

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
  maxCompletionTokens?: number;
}) {
  const response = await auditedFetch(`${resolveBaseUrl(params.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      ...(params.maxCompletionTokens ? { max_completion_tokens: params.maxCompletionTokens } : {})
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

export async function streamChatCompletion(
  params: {
    baseUrl?: string;
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    maxCompletionTokens?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    reasoningEffort?: "minimal" | "low" | "medium" | "high";
  },
  onDelta: (delta: string) => void
) {
  const response = await auditedFetch(`${resolveBaseUrl(params.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    signal: params.signal && params.timeoutMs
      ? AbortSignal.any([params.signal, AbortSignal.timeout(params.timeoutMs)])
      : params.signal || (params.timeoutMs ? AbortSignal.timeout(params.timeoutMs) : undefined),
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      ...(params.maxCompletionTokens ? { max_completion_tokens: params.maxCompletionTokens } : {}),
      ...(params.reasoningEffort ? { reasoning_effort: params.reasoningEffort } : {}),
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(getFriendlyAiError(response.status, await response.text()));
  }
  if (!response.body) throw new Error("接口没有返回可读取的文本流。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finishReason = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = done ? "" : lines.pop() || "";
    for (const line of lines) {
      const data = line.trim().replace(/^data:\s*/, "");
      if (!data || data === "[DONE]") continue;
      let json: {
        choices?: Array<{
          delta?: { content?: string };
          message?: { content?: string };
          finish_reason?: string | null;
        }>;
        error?: { message?: string; type?: string; code?: string };
      };
      try {
        json = JSON.parse(data) as typeof json;
      } catch {
        // Ignore keep-alive and provider-specific non-JSON stream lines.
        continue;
      }
      if (json.error) {
        throw new Error(json.error.message || json.error.type || "上游文本服务返回错误。");
      }
      {
        const parsed = json as {
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
            finish_reason?: string | null;
          }>;
        };
        const choice = parsed.choices?.[0];
        const delta = choice?.delta?.content || choice?.message?.content || "";
        if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
        if (delta) {
          content += delta;
          onDelta(delta);
        }
      }
    }
    if (done) break;
  }

  if (!content) throw new Error("接口没有返回有效文本内容。");
  return { content, finishReason };
}

export const OPTIMIZED_PROMPT_MAX_CHARACTERS = 300;

const PROMPT_OPTIMIZER_SYSTEM_PROMPT = `将用户文字与图片整理成可直接生图的精炼中文工业设计提示词。通常120至220字，简单局部修改可更短，任何情况最多${OPTIMIZED_PROMPT_MAX_CHARACTERS}个字符（含标点、空格和英文）。不要为了凑字数扩写。
用户最新明确要求、产品品类、必须保留和禁止改变的内容优先；合并重复表达，不删改这些约束。产品名称决定目标主体，无法判断的内容不臆造。
读取图片但不复述整张图。产品图定义主体；草图须保留轮廓、比例、结构分区、部件位置与视角；参考图仅迁移适合目标产品的设计语言，不搬用其品类、功能或完整结构。局部修改只写改动及其余保持不变，不重新设计产品或场景。
围绕用户意图选择2至3个最有辨识度的造型或材质特征，形成统一设计方向；用清楚的比例、轮廓、曲面或材质关系表达美感。少量补充与任务相符的构图、光线即可。未指定的微小零件、接口、尺寸、工艺参数不编造，不逐项列举结构细节，不堆砌装饰、灯带、画质词或长串负面词。
整体设计默认适度优化；用户要求大幅创新时才重构，明确保留条件始终优先。结构连接与材质表达应合理，留出视觉探索空间。压缩时先删重复、套话和自行补充的细节，再精炼句子；不得为缩短篇幅反转用户要求。
只输出一段完整提示词，无标题、列表、Markdown、解释、分析或开场白。输出前检查长度和约束。`;

export async function optimizeUserPrompt(params: {
  baseUrl?: string;
  apiKey: string;
  model: string;
  productName: string;
  userPrompt: string;
  productImageBase64?: string;
  sketchImageBase64?: string;
  referenceImageBase64?: string;
  referenceImageBase64s?: string[];
  innovationLevel?: number;
}) {
  const productName = params.productName.trim();
  const hasProduct = Boolean(params.productImageBase64);
  const hasSketch = Boolean(params.sketchImageBase64);
  const referenceImages = [
    ...(params.referenceImageBase64 ? [params.referenceImageBase64] : []),
    ...(params.referenceImageBase64s || [])
  ].slice(0, 3);
  const hasReference = referenceImages.length > 0;
  if (!productName && !params.userPrompt.trim() && !hasProduct && !hasSketch && !hasReference) {
    throw new Error("请填写文字描述，或上传可用于撰写提示词的图片。");
  }

  const imageRoles: string[] = [];
  let imageIndex = 1;
  if (hasProduct) {
    imageRoles.push(`图片${imageIndex}是产品原图，是最终设计主体`);
    imageIndex += 1;
  }
  if (hasSketch) {
    imageRoles.push(`图片${imageIndex}是产品设计草图，是最终设计主体`);
    imageIndex += 1;
  }
  if (hasReference) {
    referenceImages.forEach((_, referenceIndex) => {
      imageRoles.push(`图片${imageIndex + referenceIndex}是设计参考图${referenceImages.length > 1 ? ` ${referenceIndex + 1}` : ""}，只用于提取和迁移适合的设计语言`);
    });
  }

  const content: ChatMessage["content"] = [
    {
      type: "text",
      text: [
        productName
          ? `产品名称：${productName}。这是最终要生成的产品主体，不得替换为其他产品品类。`
          : hasProduct || hasSketch
            ? "用户未填写产品名称，请以主体图片中能够可靠识别的产品品类作为最终生成主体。"
            : "用户未填写产品名称，请依据用户文字确定最终产品品类；无法可靠确定时使用中性工业产品表达。",
        `用户当前文字：${params.userPrompt.trim() || "用户尚未输入其他文字，请根据当前图片关系生成完整、准确且可执行的提示词。"}`,
        imageRoles.length ? `平台已明确图片角色：${imageRoles.join("；")}。` : "当前没有上传图片，不得描述或引用不存在的图片。",
        `当前创新度：${Math.max(0, Math.min(100, params.innovationLevel ?? 50))}%。创新度仅决定造型变化幅度，用户明确的局部修改、保留要求和草图忠实度优先级更高。`,
        `只输出精炼的最终提示词，通常120至220字，最多${OPTIMIZED_PROMPT_MAX_CHARACTERS}个字符；明确要求优先，不复述图片，不额外堆砌细节。`
      ].join("\n")
    }
  ];
  if (params.productImageBase64) content.push({ type: "image_url", image_url: { url: params.productImageBase64 } });
  if (params.sketchImageBase64) content.push({ type: "image_url", image_url: { url: params.sketchImageBase64 } });
  referenceImages.forEach((image) => {
    content.push({ type: "image_url", image_url: { url: image } });
  });

  let lastError: unknown;
  const attemptModels = params.model === PROMPT_FALLBACK_MODEL
    ? [params.model]
    : [params.model, PROMPT_FALLBACK_MODEL];
  for (let attempt = 0; attempt < attemptModels.length; attempt += 1) {
    let optimizedPrompt = "";
    try {
      const result = await streamChatCompletion({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        model: attemptModels[attempt],
        temperature: 0.35,
        maxCompletionTokens: 1000,
        timeoutMs: attempt === 0 ? 18_000 : 32_000,
        reasoningEffort: "low",
        messages: [
          { role: "system", content: PROMPT_OPTIMIZER_SYSTEM_PROMPT },
          { role: "user", content }
        ]
      }, (contentDelta) => {
        optimizedPrompt += contentDelta;
      });
      const normalizedPrompt = optimizedPrompt.trim();
      // Never truncate a prompt: its final sentence may contain a critical constraint.
      if (result.finishReason === "length") {
        lastError = new Error("提示词未完整生成，请重试；原文字未修改。");
      } else if (Array.from(normalizedPrompt).length > OPTIMIZED_PROMPT_MAX_CHARACTERS) {
        lastError = new Error(`提示词超过${OPTIMIZED_PROMPT_MAX_CHARACTERS}字上限，请重试；原文字未修改。`);
      } else if (normalizedPrompt) {
        return normalizedPrompt;
      } else {
        lastError = new Error("接口没有返回有效的提示词内容。");
      }
    } catch (error) {
      // A timed-out partial stream is not a complete, validated prompt.
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("提示词优化服务暂时不可用，请稍后重试。");
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

export async function submitAsyncImageEdit(params: {
  baseUrl?: string;
  apiKey: string;
  imageModel: string;
  inputImages: string[];
  maskImage?: string;
  hasLocalEditGuide?: boolean;
  prompt: string;
  innovationLevel?: number;
  hasSketchImage?: boolean;
  hasProductImage?: boolean;
  hasReference?: boolean;
  useExactPrompt?: boolean;
  size: string;
  quality: string;
}) {
  if (isApiMartProvider(params.baseUrl)) {
    return submitApiMartImageGeneration({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      imageModel: params.imageModel,
      prompt: params.useExactPrompt
        ? params.prompt.trim()
        : buildImageEditPrompt(params.prompt, {
            ...params,
            hasMaskGuideImage: Boolean(params.maskImage && !params.hasLocalEditGuide)
          }),
      inputImages: [
        ...params.inputImages,
        ...(params.maskImage ? [params.maskImage] : [])
      ],
      size: params.size,
      quality: params.quality,
      source: "images/edits"
    });
  }

  const model = imageModels.find((item) => item.value === params.imageModel);
  if (model && model.supportsEdit === false) {
    throw new Error("当前生图模型不支持图片编辑接口，请更换支持 image edit 的模型。");
  }
  if (!params.inputImages.length) {
    throw new Error("图片编辑接口缺少输入图片。");
  }

  const useGuideOnlyLocalEdit = Boolean(
    params.maskImage &&
    isGuideOnlyLocalEditProvider(params.baseUrl)
  );
  const useMaskAsGuideImage = Boolean(params.maskImage && !params.hasLocalEditGuide);
  const formData = new FormData();
  formData.append("model", params.imageModel);
  params.inputImages.forEach((image, index) => {
    const imageBlob = new Blob([Buffer.from(image.split(",")[1], "base64")], { type: getDataUrlMime(image) });
    formData.append("image", imageBlob, `input-image-${index + 1}.png`);
  });
  if (useMaskAsGuideImage && params.maskImage) {
    const maskGuideBlob = new Blob([Buffer.from(params.maskImage.split(",")[1], "base64")], { type: "image/png" });
    formData.append("image", maskGuideBlob, "input-image-2-mask-guide.png");
  }
  if (params.maskImage && !useGuideOnlyLocalEdit) {
    const maskBlob = new Blob([Buffer.from(params.maskImage.split(",")[1], "base64")], { type: "image/png" });
    formData.append("mask", maskBlob, "edit-mask.png");
  }
  formData.append(
    "prompt",
    params.useExactPrompt
      ? params.prompt.trim()
      : buildImageEditPrompt(params.prompt, {
          ...params,
          maskImage: useGuideOnlyLocalEdit ? undefined : params.maskImage,
          hasMaskGuideImage: useMaskAsGuideImage
        })
  );
  formData.append("n", "1");
  if (params.size !== "auto") formData.append("size", params.size);
  if (params.quality !== "auto") formData.append("quality", params.quality);
  formData.append("output_format", "png");
  const endpoint = `${resolveBaseUrl(params.baseUrl)}/images/edits`;

  await writeImageDebugLog({
    phase: "request",
    source: "images/edits",
    endpoint,
    baseUrl: resolveBaseUrl(params.baseUrl),
    model: params.imageModel,
    size: params.size,
    quality: params.quality,
    hasSketchImage: Boolean(params.hasSketchImage),
    hasProductImage: Boolean(params.hasProductImage),
    hasReference: Boolean(params.hasReference),
    innovationLevel: params.innovationLevel ?? 50,
    inputImageCount: params.inputImages.length + (useMaskAsGuideImage ? 1 : 0),
    hasMask: Boolean(params.maskImage),
    hasLocalEditGuide: Boolean(params.hasLocalEditGuide),
    localEditTransport: useGuideOnlyLocalEdit
      ? useMaskAsGuideImage ? "mask-as-guide" : "guide-only"
      : params.maskImage
        ? useMaskAsGuideImage ? "native-mask-with-map" : "native-mask-with-overlay"
        : "none",
    promptPreview: clipText(params.prompt, 500)
  });

  let response: Response;
  try {
    response = await auditedFetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "X-Async-Mode": "true"
      },
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

  return parseAsyncImageSubmission(json, "images/edits");
}

export async function submitAsyncImageGeneration(params: {
  baseUrl?: string;
  apiKey: string;
  imageModel: string;
  prompt: string;
  innovationLevel?: number;
  useExactPrompt?: boolean;
  size: string;
  quality: string;
}) {
  if (isApiMartProvider(params.baseUrl)) {
    return submitApiMartImageGeneration({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      imageModel: params.imageModel,
      prompt: params.useExactPrompt
        ? params.prompt.trim()
        : buildImageGenerationPrompt(params.prompt, params.innovationLevel),
      inputImages: [],
      size: params.size,
      quality: params.quality,
      source: "images/generations"
    });
  }

  const endpoint = `${resolveBaseUrl(params.baseUrl)}/images/generations`;
  const generationPrompt = params.useExactPrompt
    ? params.prompt.trim()
    : buildImageGenerationPrompt(params.prompt, params.innovationLevel);
  await writeImageDebugLog({
    phase: "request",
    source: "images/generations",
    endpoint,
    baseUrl: resolveBaseUrl(params.baseUrl),
    model: params.imageModel,
    size: params.size,
    quality: params.quality,
    innovationLevel: params.innovationLevel ?? 50,
    promptPreview: clipText(generationPrompt, 500)
  });

  let response: Response;
  try {
    response = await auditedFetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        "X-Async-Mode": "true"
      },
      body: JSON.stringify({
        model: params.imageModel,
        prompt: generationPrompt,
        n: 1,
        ...(params.size !== "auto" ? { size: params.size } : {}),
        output_format: "png"
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

  return parseAsyncImageSubmission(json, "images/generations");
}

// Kept for older exported copies that are still included by the workspace typecheck.
export const callImageEdit = submitAsyncImageEdit;
export const callImageGeneration = submitAsyncImageGeneration;

export async function getAsyncImageJob(params: {
  baseUrl?: string;
  apiKey: string;
  jobId: string;
}): Promise<AsyncImageJob> {
  const jobId = params.jobId.trim();
  if (!/^[a-zA-Z0-9_-]{6,200}$/.test(jobId)) {
    throw new Error("生图任务编号无效。");
  }

  const endpoint = isApiMartProvider(params.baseUrl)
    ? `${resolveBaseUrl(params.baseUrl)}/tasks/${encodeURIComponent(jobId)}`
    : `${resolveBaseUrl(params.baseUrl)}/images/async-generations/${encodeURIComponent(jobId)}`;
  let response: Response;
  try {
    response = await fetchWithRetry(
      () =>
        auditedFetch(endpoint, {
          method: "GET",
          headers: { Authorization: `Bearer ${params.apiKey}` },
          cache: "no-store"
        }),
      {
        endpoint,
        source: "images/generations"
      }
    );
  } catch (error) {
    throw new Error(`生图任务状态查询失败：${error instanceof Error ? error.message : "未知网络错误"}`);
  }

  const text = await response.text();
  await writeImageDebugLog({
    phase: "async_status_response",
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
    throw new Error("生图任务状态返回格式异常。");
  }

  const record = unwrapAsyncJobRecord(json);
  const status = String(record.status || "").toLowerCase();
  if (status === "pending" || status === "queued") {
    return { status: "pending", jobId };
  }
  if (status === "running" || status === "processing") {
    return { status: "running", jobId };
  }
  if (status === "failed" || status === "error" || status === "cancelled") {
    return {
      status: "failed",
      jobId,
      error: getAsyncJobError(record)
    };
  }
  if (status !== "done" && status !== "completed" && status !== "success" && status !== "succeeded") {
    return { status: "running", jobId };
  }

  const resultUrl = getAsyncJobResultUrl(record);
  if (!resultUrl) {
    return {
      status: "failed",
      jobId,
      error: "任务已完成，但供应商没有返回图片地址。"
    };
  }

  const imageBase64 = await normalizeImageResultToDataUrl(
    { data: [{ url: resultUrl }] },
    params.apiKey,
    "images/async-generations"
  );
  return { status: "done", jobId, imageBase64, imageUrl: resultUrl };
}

function buildImageEditPrompt(
  prompt: string,
  options: {
    hasSketchImage?: boolean;
    hasProductImage?: boolean;
    hasReference?: boolean;
    innovationLevel?: number;
    maskImage?: string;
    hasLocalEditGuide?: boolean;
    hasMaskGuideImage?: boolean;
  }
) {
  const parts: string[] = [];
  const innovationLevel = Math.max(0, Math.min(100, options.innovationLevel ?? 50));
  const trimmedPrompt = prompt.trim();

  if (options.maskImage) {
    const guideType = options.hasLocalEditGuide
      ? "overlay"
      : options.hasMaskGuideImage
        ? "mask-map"
        : "none";
    return buildMaskedLocalEditPrompt(trimmedPrompt, guideType, innovationLevel);
  }

  if (options.hasMaskGuideImage) {
    return buildMaskGuideLocalEditPrompt(trimmedPrompt, innovationLevel);
  }

  if (options.hasLocalEditGuide) {
    return buildGuidedLocalEditPrompt(trimmedPrompt, innovationLevel);
  }

  if (options.hasSketchImage) {
    return buildSketchRenderingPrompt(trimmedPrompt, options);
  }

  if (options.hasProductImage && options.hasReference) {
    parts.push("Input image order: image 1 is the source product image. image 2 is the reference style image.");
    parts.push(buildProductInnovationInstruction(innovationLevel));
    parts.push(buildReferenceOnlyInstruction());
  } else if (options.hasProductImage) {
    parts.push("Use the input image as the source product.");
    parts.push(buildProductInnovationInstruction(innovationLevel));
  } else if (options.hasReference) {
    parts.push("Use the input image only as a visual style reference.");
    parts.push(buildReferenceOnlyInstruction());
    parts.push(buildTextInnovationInstruction(innovationLevel));
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

function buildSketchRenderingPrompt(
  userDescription: string,
  options: { hasProductImage?: boolean; hasReference?: boolean }
) {
  const imageRoles = ["image 1 is the primary product line-art sketch and defines the required silhouette, proportions, layout, and design intent"];
  let nextImageIndex = 2;
  if (options.hasProductImage) {
    imageRoles.push(`image ${nextImageIndex} is a secondary product reference for plausible construction, materials, and functional details; it must not override the sketch geometry`);
    nextImageIndex += 1;
  }
  if (options.hasReference) {
    imageRoles.push(`image ${nextImageIndex} is only a secondary visual-style reference for CMF, finish, color strategy, and detail language; never copy its subject geometry`);
  }

  return [
    `Input image order: ${imageRoles.join("; ")}.`,
    "请严格基于我上传的产品线稿草图生成高完成度产品效果图，保留原有轮廓、比例、结构分区和核心设计特征，在不改变设计意图的前提下，补全合理的曲面、厚度、倒角、装配关系与功能细节。整体造型简洁、有设计感、符合真实结构与量产逻辑，材质和表面质感细腻真实，采用专业KeyShot级产品渲染，三分之四视角，摄影棚灯光，背景干净，细节清晰，4K高清，禁止随意改形、增加无关结构、生成文字或出现结构错误。",
    userDescription ? `User description (keep this intent exactly, do not rewrite it): ${userDescription}` : ""
  ].filter(Boolean).join("\n");
}

function buildMaskedLocalEditPrompt(
  userRequest: string,
  guideType: "overlay" | "mask-map" | "none",
  innovationLevel: number
) {
  const guideInstruction = guideType === "overlay"
    ? "Input image order: image 1 is the clean source product image; image 2 is a location guide with a bright purple brush overlay. Purple is annotation only and must not appear in the output."
    : guideType === "mask-map"
      ? "Input image order: image 1 is the clean source product image; image 2 is a location map. Its transparent or light opening marks the target area; the opaque dark area must be preserved. Never render this map in the output."
      : "Image 1 is the clean source product image. Use the attached PNG mask as the sole location constraint.";

  return [
    guideInstruction,
    `Primary task for the selected area: ${userRequest}`,
    buildLocalEditStrengthInstruction(innovationLevel),
    "Edit only the transparent area of the attached PNG mask. Every opaque, unmasked pixel must remain visually unchanged.",
    "Apply the change at the marked location, not on another similar-looking component. Use the softly expanded mask margin only to rebuild neighboring transitions and do not return an unchanged copy.",
    "Boundary alignment is mandatory: every contour, seam, shaft, bracket, surface, highlight, and shadow that crosses the mask boundary must meet the untouched source at exactly the same pixel position, tangent direction, thickness, perspective, and depth. Do not shift, duplicate, bend, or disconnect structures at the boundary.",
    "Understand the source product's category, construction, adjacent parts, curvature, proportions, design language, CMF, perspective, lighting, reflections, shadows, sharpness, and image grain before editing.",
    "Interpret the user's request as a product-specific industrial-design modification, not as a literal object pasted from another category. Any added feature must look purpose-designed for this exact product and must have plausible scale, placement, thickness, mounting, panel gaps, edge radii, material transitions, and functional relationship to the surrounding structure.",
    "Continue the edited geometry naturally from neighboring surfaces. Match local curvature, perspective, material response, color, highlights, reflections, contact shadows, sharpness, and noise so the result looks integrated rather than pasted on.",
    "If the requested feature does not fit, adapt its form to the available surface while preserving its functional intent. Do not redesign content outside the selected area."
  ].join("\n");
}

function buildGuidedLocalEditPrompt(userRequest: string, innovationLevel: number) {
  return [
    "Input image order: image 1 is the clean source product image; image 2 is a location guide showing the target area with a bright purple brush overlay. The purple color is only an annotation and must never appear in the output.",
    `Primary task for the marked area: ${userRequest}`,
    buildLocalEditStrengthInstruction(innovationLevel),
    "Modify only the purple-marked location and the smallest surrounding transition margin needed for a natural blend. Preserve the source image outside this local area.",
    "Boundary alignment is mandatory: every contour, seam, shaft, bracket, surface, highlight, and shadow leaving the purple area must reconnect to the clean source at exactly the same pixel position, tangent direction, thickness, perspective, and depth.",
    "Make the requested change clearly visible at the marked location. Do not move it to another visually similar part of the product and do not return an unchanged copy.",
    "First understand the complete source product: identify its product category, function, construction, adjacent parts, surface curvature, proportions, design language, CMF, manufacturing logic, perspective, lighting, reflections, shadows, depth of field, and image grain.",
    "Interpret the user's request as a product-specific industrial-design modification, not as a literal object pasted from another category. Any added feature must look purpose-designed for this exact product and must have plausible scale, placement, thickness, mounting, panel gaps, edge radii, material transitions, and functional relationship to the surrounding structure.",
    "Continue the edited geometry naturally from neighboring surfaces. Match local curvature, perspective, material response, color, highlights, reflections, contact shadows, sharpness, and noise so the modification appears integrated into the original design.",
    "If the requested feature is too large or incompatible with the marked location, adapt and simplify its form to fit the available surface while preserving the user's functional intent."
  ].join("\n");
}

function buildMaskGuideLocalEditPrompt(userRequest: string, innovationLevel: number) {
  return [
    "Input image order: image 1 is the clean source product image; image 2 is a PNG location map derived from the user's brush selection.",
    "In image 2, the transparent or light opening identifies the local area that may be changed; the opaque dark area identifies content that must be preserved. Treat image 2 only as a spatial annotation and never render the map itself in the output.",
    `Primary task for the marked area: ${userRequest}`,
    buildLocalEditStrengthInstruction(innovationLevel),
    "Modify only the identified local area and the smallest surrounding transition margin needed for a natural blend. Preserve the source image everywhere else.",
    "Boundary alignment is mandatory: every contour, seam, shaft, bracket, surface, highlight, and shadow leaving the target area must reconnect to the clean source at exactly the same pixel position, tangent direction, thickness, perspective, and depth.",
    "Make the requested change clearly visible at that exact location. Do not move it to another visually similar component and do not return an unchanged copy.",
    "First understand the complete source product: identify its product category, function, construction, adjacent parts, surface curvature, proportions, design language, CMF, manufacturing logic, perspective, lighting, reflections, shadows, depth of field, and image grain.",
    "Interpret the user's request as a product-specific industrial-design modification, not as a literal object pasted from another category. Any added feature must look purpose-designed for this exact product and must have plausible scale, placement, thickness, mounting, panel gaps, edge radii, material transitions, and functional relationship to the surrounding structure.",
    "Continue the edited geometry naturally from neighboring surfaces. Match local curvature, perspective, material response, color, highlights, reflections, contact shadows, sharpness, and noise so the modification appears integrated into the original design.",
    "If the requested feature is too large or incompatible with the marked location, adapt and simplify its form to fit the available surface while preserving the user's functional intent."
  ].join("\n");
}

function buildLocalEditStrengthInstruction(level: number) {
  if (level >= 80) {
    return "Modification strength is high. Produce an unmistakable, clearly visible redesign inside the selected area. Do not merely recolor, smooth, or make imperceptible detail changes unless the user explicitly asks for a subtle adjustment.";
  }
  if (level >= 45) {
    return "Modification strength is balanced. Make the requested change clearly visible while retaining necessary local construction cues.";
  }
  return "Modification strength is restrained. Prefer a subtle refinement that preserves most of the selected area's existing geometry.";
}

function buildImageGenerationPrompt(prompt: string, innovationLevel = 50) {
  return [
    buildTextInnovationInstruction(Math.max(0, Math.min(100, innovationLevel))),
    `User description (keep this intent exactly, do not rewrite it): ${prompt.trim()}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildProductInnovationInstruction(level: number) {
  if (level <= 10) {
    return "Innovation level is minimal. Preserve the source product category, functional architecture, primary geometry, proportions, silhouette, and camera viewpoint. Limit changes to CMF, surface treatment, fine detailing, and minor segmentation.";
  }
  if (level <= 30) {
    return "Innovation level is restrained. Preserve the product category, functional structure, and key proportions, but establish a visibly new design direction through changed surface segmentation, secondary volumes, edge treatment, details, and CMF. Avoid a simple recolor.";
  }
  if (level <= 55) {
    return "Innovation level is bold. Preserve only the product category, core function, and necessary interfaces. The result must not look like the same product with a cosmetic facelift. Redesign at least four of these dimensions: overall silhouette, primary proportions, dominant volume architecture, surface topology, structural segmentation, openings, edge language, detail system, and CMF. Create an obviously different design family while remaining manufacturable.";
  }
  if (level <= 80) {
    return "Innovation level is radical. Keep only the product category, essential function, safety constraints, and unavoidable interfaces. Replace the silhouette, proportion system, primary and secondary volumes, structural expression, panel layout, openings, edge treatment, details, and CMF. The output must be immediately distinguishable from the source at thumbnail size and must not preserve the original camera composition as an identity cue.";
  }
  return "Innovation level is extreme. Use the source image only to understand the product category, essential function, user interaction, and unavoidable engineering interfaces. Create a completely new design family with no part-for-part visual correspondence to the source. Replace the overall silhouette, proportion hierarchy, dominant volume architecture, surface topology, panel and seam layout, openings, edge language, functional-detail expression, CMF, viewpoint, and composition. Do not copy or lightly modify any recognizable shape, panel, trim, graphic, or styling cue from the source. The result must show a major conceptual leap, remain plausible and manufacturable, and be unmistakably different even when viewed as a small thumbnail. A recolor, reskin, detail swap, or ordinary facelift is unacceptable.";
}

function buildReferenceOnlyInstruction() {
  return "Use the reference image exclusively for CMF, materials, finish, color strategy, detail density, edge treatment, and design mood. Never copy its subject identity, product silhouette, geometry, proportions, structural layout, composition, or camera viewpoint.";
}

function buildTextInnovationInstruction(level: number) {
  if (level <= 10) return "Use a conservative, highly manufacturable design direction with familiar proportions and restrained detailing.";
  if (level <= 30) return "Use a clearly refreshed but practical design direction with new segmentation, details, edge treatment, and CMF rather than a simple recolor.";
  if (level <= 55) return "Create a bold, visibly differentiated design family with new silhouette logic, proportions, dominant volumes, segmentation, and details while retaining plausible function and manufacturability.";
  if (level <= 80) return "Explore a radical redesign with unconventional silhouette, volume architecture, proportions, topology, segmentation, and a strong original identity that is clearly different at thumbnail size.";
  return "Pursue an extreme conceptual leap with a completely new silhouette, proportion hierarchy, volume architecture, structural expression, surface topology, details, CMF, viewpoint, and composition. Do not produce a recolor, reskin, or ordinary facelift; the result must be unmistakably original while retaining plausible function.";
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

function parseAsyncImageSubmission(json: unknown, source: string): AsyncImageSubmission {
  const record = unwrapAsyncJobRecord(json);
  const jobId = String(
    record.job_id ||
    record.jobId ||
    record.task_id ||
    record.taskId ||
    record.id ||
    ""
  ).trim();
  if (!jobId) {
    throw new Error(`图片接口没有返回异步任务编号。来源：${source}。返回结构：${summarizeImagePayload(json)}`);
  }

  return {
    jobId,
    status: String(record.status || "pending"),
    created: typeof record.created === "number" ? record.created : undefined
  };
}

function unwrapAsyncJobRecord(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const record = json as Record<string, unknown>;
  for (const key of ["task", "job", "data"]) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      const firstRecord = nested.find(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      );
      if (
        firstRecord &&
        (
          firstRecord.job_id ||
          firstRecord.jobId ||
          firstRecord.task_id ||
          firstRecord.taskId ||
          firstRecord.id ||
          firstRecord.status
        )
      ) {
        return firstRecord;
      }
    }
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const nestedRecord = nested as Record<string, unknown>;
      if (
        nestedRecord.job_id ||
        nestedRecord.jobId ||
        nestedRecord.task_id ||
        nestedRecord.taskId ||
        nestedRecord.id ||
        nestedRecord.status
      ) {
        return nestedRecord;
      }
    }
  }
  return record;
}

function getAsyncJobResultUrl(record: Record<string, unknown>): string {
  const candidates = [
    record.result_urls,
    record.resultUrls,
    record.urls,
    record.output_urls,
    record.outputUrls
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const firstUrl = candidate.find((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value));
      if (firstUrl) return firstUrl;
    }
  }

  const result = record.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const resultRecord = result as Record<string, unknown>;
    const nestedUrl: string = getAsyncJobResultUrl(resultRecord);
    if (nestedUrl) return nestedUrl;
  }

  const images = record.images;
  if (Array.isArray(images)) {
    for (const image of images) {
      if (!image || typeof image !== "object" || Array.isArray(image)) continue;
      const url = (image as Record<string, unknown>).url;
      if (Array.isArray(url)) {
        const firstUrl = url.find((value): value is string =>
          typeof value === "string" && /^https?:\/\//i.test(value)
        );
        if (firstUrl) return firstUrl;
      }
      if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
    }
  }

  const data = record.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const url = (item as Record<string, unknown>).url;
      if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
    }
  }

  for (const key of ["url", "result_url", "resultUrl", "output_url", "outputUrl"]) {
    const value = record[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  return "";
}

function getAsyncJobError(record: Record<string, unknown>) {
  for (const key of ["error_message", "errorMessage", "message", "error", "task_error_code", "error_code"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      const nestedMessage = nested.message || nested.code;
      if (typeof nestedMessage === "string" && nestedMessage.trim()) return nestedMessage.trim();
    }
  }
  return "图片生成任务失败，请稍后重试。";
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
    () => auditedFetch(imageUrl),
    () => auditedFetch(imageUrl, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined })
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

async function fetchWithRetry(
  execute: () => Promise<Response>,
  context: { endpoint: string; source: "images/edits" | "images/generations" }
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= IMAGE_FETCH_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      lastError = error;
      if (!isRetryableFetchError(error) || attempt === IMAGE_FETCH_RETRY_DELAYS_MS.length) {
        throw error;
      }

      const retryAfterMs = IMAGE_FETCH_RETRY_DELAYS_MS[attempt];
      await writeImageDebugLog({
        phase: "retry_scheduled",
        source: context.source,
        endpoint: context.endpoint,
        attempt: attempt + 1,
        retryAfterMs,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      await sleep(retryAfterMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("未知网络错误");
}

function isRetryableFetchError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return error.name === "TypeError" || message.includes("fetch failed") || message.includes("network");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function isApiMartProvider(baseUrl?: string) {
  return /\/apimart(?:\/|$)/i.test(resolveBaseUrl(baseUrl));
}

async function submitApiMartImageGeneration(params: {
  baseUrl?: string;
  apiKey: string;
  imageModel: string;
  prompt: string;
  inputImages: string[];
  size: string;
  quality: string;
  source: "images/edits" | "images/generations";
}): Promise<AsyncImageSubmission> {
  const endpoint = `${resolveBaseUrl(params.baseUrl)}/images/generations`;
  const { size, resolution } = toApiMartImageDimensions(params.size);
  await writeImageDebugLog({
    phase: "request",
    source: params.source,
    transport: "apimart",
    endpoint,
    model: params.imageModel,
    size,
    resolution,
    quality: params.quality,
    inputImageCount: params.inputImages.length,
    promptPreview: clipText(params.prompt, 500)
  });

  const response = await auditedFetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.imageModel,
      prompt: params.prompt,
      n: 1,
      ...(size ? { size } : {}),
      ...(resolution ? { resolution } : {}),
      ...(params.quality !== "auto" ? { quality: params.quality } : {}),
      ...(params.inputImages.length ? { image_urls: params.inputImages } : {}),
      official_fallback: false
    })
  });

  const text = await response.text();
  await writeImageDebugLog({
    phase: "response",
    source: params.source,
    transport: "apimart",
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
    throw new Error("ApiMart 生图接口返回了无法解析的结果。");
  }
  return parseAsyncImageSubmission(json, params.source);
}

function toApiMartImageDimensions(value: string) {
  if (value === "1024x1024") return { size: "1:1", resolution: value };
  if (value === "1536x1024") return { size: "3:2", resolution: value };
  if (value === "1024x1536") return { size: "2:3", resolution: value };
  return value === "auto"
    ? { size: "", resolution: "" }
    : { size: value, resolution: value };
}

function isGuideOnlyLocalEditProvider(baseUrl?: string) {
  try {
    return new URL(resolveBaseUrl(baseUrl)).hostname.toLowerCase() === "geeknow.ai";
  } catch {
    return false;
  }
}
