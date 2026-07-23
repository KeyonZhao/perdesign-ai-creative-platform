import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveProviderConfig } from "@/lib/provider";
import { generateResearchReply } from "@/lib/research";

const imageSchema = z.object({
  name: z.string().min(1),
  dataUrl: z.string().startsWith("data:image/")
});

const messageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().min(1),
  images: z.array(imageSchema).max(4).optional()
});

const requestSchema = z.object({
  apiKey: z.string().min(1, "请先填写对话 API Key。"),
  baseUrl: z.string().url("请填写有效的对话请求地址。"),
  model: z.string().min(1, "请填写对话模型。"),
  conversation: z.array(messageSchema).min(1, "当前没有可用对话内容。")
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = resolveProviderConfig(payload, "chat");
    const result = await generateResearchReply({
      ...payload,
      ...provider
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[research-chat] request failed", error);
    const message = error instanceof Error ? error.message : "策划研究回复失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
