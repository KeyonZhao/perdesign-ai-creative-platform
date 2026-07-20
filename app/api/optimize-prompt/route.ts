import { NextResponse } from "next/server";
import { z } from "zod";
import { optimizeUserPrompt } from "@/lib/aihubmix";

const requestSchema = z.object({
  apiKey: z.string().min(1, "请先填写对话 API Key。"),
  baseUrl: z.string().url("请填写有效的对话请求地址。"),
  model: z.string().min(1, "请选择大脑模型。"),
  userPrompt: z.string().min(1, "请先输入变款要求。")
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const optimizedPrompt = await optimizeUserPrompt(payload);
    return NextResponse.json({ optimizedPrompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "提示词优化失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
