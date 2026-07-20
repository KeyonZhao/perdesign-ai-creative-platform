import { NextResponse } from "next/server";
import { z } from "zod";
import { callImageEdit, callImageGeneration, failedResult, mapWithConcurrency } from "@/lib/aihubmix";
import { makeId } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;
const BRAIN_MODEL = "gpt-5.5";

const requestSchema = z.object({
  imageApiKey: z.string().min(1, "请先填写生图 API Key。"),
  imageApiBaseUrl: z.string().url("请填写有效的生图请求地址。"),
  chatApiKey: z.string().optional().default(""),
  chatApiBaseUrl: z.string().optional().default(""),
  brainModel: z.string().min(1).optional().default(BRAIN_MODEL),
  imageModel: z.string().min(1, "请选择生图模型。"),
  imageBase64: z.string().startsWith("data:image/").optional(),
  referenceImageBase64: z.string().startsWith("data:image/").optional(),
  referenceWeight: z.number().int().min(0).max(100).optional().default(0),
  requirement: z.string().optional().default(""),
  count: z.number().int().min(1).max(10),
  size: z.string().min(1),
  quality: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    if (!payload.imageBase64 && !payload.referenceImageBase64 && !payload.requirement.trim()) {
      throw new Error("请至少输入提示词，或上传产品图 / 参考图后再生成。");
    }
    const hasReferenceImage = Boolean(payload.referenceImageBase64);
    const concepts = buildDirectConcepts(payload.requirement, payload.count, Boolean(payload.imageBase64));

    const results = await mapWithConcurrency(concepts, 2, async (concept, index) => {
      try {
        const imageBase64 = await generateConceptImage({
          payload,
          conceptPrompt: concept.prompt,
          hasReferenceImage
        });

        return {
          id: makeId(`concept-${index}`),
          title: concept.title,
          prompt: concept.prompt,
          imageBase64
        };
      } catch (error) {
        console.error("[generate] concept failed", {
          index,
          title: concept.title,
          hasProductImage: Boolean(payload.imageBase64),
          hasReferenceImage: Boolean(payload.referenceImageBase64),
          imageModel: payload.imageModel,
          message: error instanceof Error ? error.message : String(error)
        });
        return failedResult(concept, error, index);
      }
    });

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败，请检查配置后重试。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function generateConceptImage({
  payload,
  conceptPrompt,
  hasReferenceImage
}: {
  payload: z.infer<typeof requestSchema>;
  conceptPrompt: string;
  hasReferenceImage: boolean;
}) {
  if (payload.imageBase64 || payload.referenceImageBase64) {
    return callImageEdit({
      baseUrl: payload.imageApiBaseUrl,
      apiKey: payload.imageApiKey,
      imageModel: payload.imageModel,
      inputImages: [payload.imageBase64, payload.referenceImageBase64].filter((item): item is string => Boolean(item)),
      prompt: conceptPrompt,
      hasProductImage: Boolean(payload.imageBase64),
      referenceWeight: payload.referenceWeight,
      hasReference: hasReferenceImage,
      size: payload.size,
      quality: payload.quality
    });
  }

  return callImageGeneration({
    baseUrl: payload.imageApiBaseUrl,
    apiKey: payload.imageApiKey,
    imageModel: payload.imageModel,
    prompt: conceptPrompt,
    referenceWeight: payload.referenceWeight,
    hasReference: hasReferenceImage,
    size: payload.size,
    quality: payload.quality
  });
}

function buildDirectConcepts(requirement: string, count: number, hasProductImage: boolean) {
  const basePrompt = requirement.trim() || (hasProductImage
    ? "Preserve the original product structure, proportions and camera angle, create a refined industrial design variation with premium CMF, realistic rendering, clean background."
    : "Create a premium industrial design product concept, realistic rendering, clean background, strong CMF detailing.");

  return Array.from({ length: count }, (_, index) => ({
    title: `Concept ${String(index + 1).padStart(2, "0")}`,
    prompt: basePrompt
  }));
}
