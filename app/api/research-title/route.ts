import { NextResponse } from "next/server";
import { z } from "zod";
import { callChatCompletion } from "@/lib/aihubmix";
import { resolveProviderConfig } from "@/lib/provider";

const requestSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  content: z.string().min(1).max(4000)
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = resolveProviderConfig(payload, "chat");
    const result = await callChatCompletion({
      ...provider,
      model: payload.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "你负责为策划研究项目生成简短、清晰的中文标题。",
            "从用户原话中提取品牌或主体、产品品类、关键创新主题和任务类型，删除口语、动作请求和无关修饰。",
            "优先采用‘品牌/主体 + 产品 + 核心主题 + 策划案’的结构，但不要机械补充原文没有的信息。",
            "例如：‘我要为海信设计一个空调，空调需要有显示屏，你给我写一个创新策划案’应输出‘海信空调屏幕策划案’。",
            "标题控制在6至18个汉字，只输出标题本身，不使用引号、句号、冒号或解释。"
          ].join("\n")
        },
        { role: "user", content: payload.content }
      ]
    });
    const title = result
      .replace(/[“”"'《》]/g, "")
      .replace(/[。！？!?：:]$/g, "")
      .trim()
      .slice(0, 24);
    if (!title) throw new Error("没有生成有效标题。");
    return NextResponse.json({ title });
  } catch (error) {
    console.error("[research-title] request failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "标题生成失败。" },
      { status: 400 }
    );
  }
}
