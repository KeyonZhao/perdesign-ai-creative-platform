import { NextResponse } from "next/server";
import { z } from "zod";
import { optimizeUserPrompt } from "@/lib/aihubmix";
import { resolveProviderConfig } from "@/lib/provider";

const requestSchema = z.object({
  apiKey: z.string().min(1, "请先填写对话 API Key。"),
  baseUrl: z.string().url("请填写有效的对话请求地址。"),
  model: z.string().min(1, "请选择大脑模型。"),
  productName: z.string().trim().max(100, "产品名称不能超过100个字符。").optional().default(""),
  userPrompt: z.string().optional().default(""),
  productImageBase64: z.string().startsWith("data:image/").optional(),
  sketchImageBase64: z.string().startsWith("data:image/").optional(),
  referenceImageBase64: z.string().startsWith("data:image/").optional(),
  referenceImageBase64s: z.array(z.string().startsWith("data:image/")).max(3).optional().default([]),
  innovationLevel: z.number().int().min(0).max(100).optional().default(50)
}).refine(
  (value) =>
    Boolean(
      value.productName ||
      value.userPrompt.trim() ||
      value.productImageBase64 ||
      value.sketchImageBase64 ||
      value.referenceImageBase64 ||
      value.referenceImageBase64s.length
    ),
  { message: "请填写文字描述，或上传可用于撰写提示词的图片。" }
);

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = resolveProviderConfig(payload, "chat");
    const optimizedPrompt = await optimizeUserPrompt({
      ...payload,
      ...provider
    });
    return NextResponse.json({ optimizedPrompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "提示词优化失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
