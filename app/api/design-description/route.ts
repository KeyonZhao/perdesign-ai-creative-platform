import { NextResponse } from "next/server";
import { z } from "zod";
import { callChatCompletion } from "@/lib/aihubmix";

export const runtime = "nodejs";
export const maxDuration = 120;

const DESIGN_DESCRIPTION_PROMPT = `请认真分析我提供的产品设计图，输出一份可直接粘贴到设计提案或 PPT 的精简设计说明。只依据图片中真实可见的产品轮廓、体块、线面、分色、材质、结构分缝和关键细节进行判断，讲清楚“为什么这样设计”以及“这些造型如何形成对应感受”。不要罗列功能，不要先编抽象概念再套用，不要使用“科技感、未来感、简约大气、高端”等空泛词汇，不要写分析过程、开场白或结尾客套话。

全文严格控制在 220—320 个中文字符，并严格按以下格式输出：

设计关键词：三个两个字的关键词，用“｜”分隔
设计主题：一个约 8 字、有辨识度的副标题
整体说明：一段 55—75 字的设计逻辑，只写最关键的轮廓、体块、线面、分色和材质关系
设计亮点：固定 3 条，每条采用“4—6 字标题：20—28 字解释”的格式
设计价值：一段 30—45 字的产品气质与设计价值总结

禁止增加上述格式之外的内容，禁止使用 Markdown 表格，禁止重复表达。`;

const requestSchema = z.object({
  apiKey: z.string().min(1, "当前认证信息不可用。"),
  baseUrl: z.string().url("对话请求地址无效。"),
  model: z.string().min(1, "对话模型无效。"),
  imageBase64: z.string().startsWith("data:image/", "当前图片无法用于生成设计说明。")
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const description = await callChatCompletion({
      baseUrl: payload.baseUrl,
      apiKey: payload.apiKey,
      model: payload.model,
      temperature: 0.45,
      messages: [
        {
          role: "system",
          content:
            "你是一名资深工业设计策略师和设计提案撰稿人。必须认真读取产品图片，只依据可见设计特征输出专业、克制、短小、可直接放入 PPT 的中文设计说明，并严格遵守字数上限。"
        },
        {
          role: "user",
          content: [
            { type: "text", text: DESIGN_DESCRIPTION_PROMPT },
            { type: "image_url", image_url: { url: payload.imageBase64 } }
          ]
        }
      ]
    });

    return NextResponse.json({ description: description.trim() });
  } catch (error) {
    console.error("[design-description] request failed", error);
    const message = error instanceof Error ? error.message : "设计说明生成失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
