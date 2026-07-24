import { NextResponse } from "next/server";
import { z } from "zod";
import { submitAsyncImageEdit, submitAsyncImageGeneration } from "@/lib/aihubmix";
import { resolveProviderConfig } from "@/lib/provider";

export const runtime = "nodejs";
export const maxDuration = 60;
const BRAIN_MODEL = "gpt-5.5";

const requestSchema = z.object({
  imageApiKey: z.string().min(1, "请先填写生图 API Key。"),
  imageApiBaseUrl: z.string().url("请填写有效的生图请求地址。"),
  chatApiKey: z.string().optional().default(""),
  chatApiBaseUrl: z.string().optional().default(""),
  brainModel: z.string().min(1).optional().default(BRAIN_MODEL),
  imageModel: z.string().min(1, "请选择生图模型。"),
  productName: z.string().trim().max(100, "产品名称不能超过100个字符。").optional().default(""),
  sketchImageBase64: z.string().startsWith("data:image/").optional(),
  imageBase64: z.string().startsWith("data:image/").optional(),
  maskImageBase64: z.string().startsWith("data:image/").optional(),
  localEditGuideImageBase64: z.string().startsWith("data:image/").optional(),
  referenceImageBase64: z.string().startsWith("data:image/").optional(),
  referenceImageBase64s: z.array(z.string().startsWith("data:image/")).max(3).optional().default([]),
  innovationLevel: z.number().int().min(0).max(100).optional().default(50),
  requirement: z.string().optional().default(""),
  useExactPrompt: z.boolean().optional().default(false),
  count: z.number().int().min(1).max(10),
  size: z.string().min(1),
  quality: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const requestPayload = requestSchema.parse(await request.json());
    const provider = resolveProviderConfig({
      apiKey: requestPayload.imageApiKey,
      baseUrl: requestPayload.imageApiBaseUrl
    }, "image");
    const payload = {
      ...requestPayload,
      imageApiKey: provider.apiKey,
      imageApiBaseUrl: provider.baseUrl
    };
    if (!payload.sketchImageBase64 && !payload.imageBase64 && !payload.referenceImageBase64 && !payload.referenceImageBase64s.length && !payload.requirement.trim() && !payload.productName) {
      throw new Error("请先填写产品名称，或提供可用于生成的图片和文字。");
    }
    const hasSketchImage = Boolean(payload.sketchImageBase64);
    const hasReferenceImage = Boolean(payload.referenceImageBase64 || payload.referenceImageBase64s.length);
    const concept = buildDirectConcepts(
      payload.productName,
      payload.requirement,
      1,
      Boolean(payload.sketchImageBase64 || payload.imageBase64),
      payload.useExactPrompt
    )[0];

    const submission = await submitConceptImage({
      payload,
      conceptPrompt: concept.prompt,
      hasSketchImage,
      hasReferenceImage
    });

    return NextResponse.json(
      {
        jobId: submission.jobId,
        status: submission.status,
        prompt: concept.prompt,
        title: concept.title
      },
      { status: 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败，请检查配置后重试。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function submitConceptImage({
  payload,
  conceptPrompt,
  hasSketchImage,
  hasReferenceImage
}: {
  payload: z.infer<typeof requestSchema>;
  conceptPrompt: string;
  hasSketchImage: boolean;
  hasReferenceImage: boolean;
}) {
  if (payload.sketchImageBase64 || payload.imageBase64 || payload.referenceImageBase64 || payload.referenceImageBase64s.length) {
    return submitAsyncImageEdit({
      baseUrl: payload.imageApiBaseUrl,
      apiKey: payload.imageApiKey,
      imageModel: payload.imageModel,
      inputImages: [
        payload.sketchImageBase64,
        payload.imageBase64,
        payload.localEditGuideImageBase64,
        payload.referenceImageBase64,
        ...payload.referenceImageBase64s
      ].filter((item): item is string => Boolean(item)),
      maskImage: payload.maskImageBase64,
      hasLocalEditGuide: Boolean(payload.localEditGuideImageBase64),
      prompt: conceptPrompt,
      hasSketchImage,
      hasProductImage: Boolean(payload.imageBase64),
      innovationLevel: payload.innovationLevel,
      hasReference: hasReferenceImage,
      useExactPrompt: payload.useExactPrompt,
      size: payload.size,
      quality: payload.quality
    });
  }

  return submitAsyncImageGeneration({
    baseUrl: payload.imageApiBaseUrl,
    apiKey: payload.imageApiKey,
    imageModel: payload.imageModel,
    prompt: conceptPrompt,
    innovationLevel: payload.innovationLevel,
    useExactPrompt: payload.useExactPrompt,
    size: payload.size,
    quality: payload.quality
  });
}

function buildDirectConcepts(
  productName: string,
  requirement: string,
  count: number,
  hasProductImage: boolean,
  useExactPrompt: boolean
) {
  const targetProduct = productName.trim();
  const userRequirement = requirement.trim();
  if (useExactPrompt) {
    if (!userRequirement) throw new Error("请输入文字描述。");
    return Array.from({ length: count }, (_, index) => ({
      title: `Concept ${String(index + 1).padStart(2, "0")}`,
      prompt: userRequirement
    }));
  }
  const productConstraint = targetProduct
    ? `最终生成主体必须是“${targetProduct}”，不得替换为其他产品品类。`
    : "";
  const taskConstraint = userRequirement
    ? `用户文字描述（保持原意并完整执行）：${userRequirement}`
    : hasProductImage
      ? "在保留主体产品必要结构、比例和使用关系的基础上，生成高完成度、可量产的工业设计方案，使用真实材质与干净背景。"
      : "生成高完成度、可量产的工业产品设计方案，明确合理结构、CMF、真实材质与干净背景。";
  const basePrompt = [productConstraint, taskConstraint].filter(Boolean).join("\n");

  return Array.from({ length: count }, (_, index) => ({
    title: `Concept ${String(index + 1).padStart(2, "0")}`,
    prompt: basePrompt
  }));
}
