import { NextResponse } from "next/server";
import { z } from "zod";
import { callChatCompletion } from "@/lib/aihubmix";
import { buildFreeExplorationPrompt } from "@/lib/creative-divergence";
import { resolveProviderConfig } from "@/lib/provider";

const requestSchema = z.object({
  apiKey: z.string().min(1, "请先填写对话 API Key。"),
  baseUrl: z.string().url("请填写有效的对话请求地址。"),
  model: z.string().min(1, "请选择大脑模型。"),
  productName: z.string().trim().max(100).optional().default(""),
  sourceImageBase64: z.string().startsWith("data:image/"),
  explorationLevel: z.enum(["steady", "balanced", "bold"]).optional().default("balanced"),
  note: z.string().trim().max(500).optional().default(""),
  originalDescription: z.string().trim().max(4000).optional().default("")
});

const conceptSchema = z.object({
  concept: z.string().trim().min(2).max(12),
  instruction: z.string().trim().min(40).max(500)
});
const planSchema = z.object({ concepts: z.array(conceptSchema).length(4) });

function parsePlan(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || raw.match(/\{[\s\S]*\}/)?.[0] || raw;
  return planSchema.parse(JSON.parse(candidate.trim()));
}

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = resolveProviderConfig(payload, "chat");
    const levelInstruction = {
      steady: "稳妥延展：保留较多成熟设计基因，重点寻找可落地且明显优于原方案的变化。",
      balanced: "明显突破：保留核心识别与功能骨架，同时允许重构比例、体块、结构和交互表达。",
      bold: "大胆探索：只守住品类、功能、人机与必要接口，可提出前瞻但仍可制造的新架构。"
    }[payload.explorationLevel];
    const raw = await callChatCompletion({
      ...provider,
      model: payload.model,
      temperature: 0.75,
      maxCompletionTokens: 2400,
      messages: [
        {
          role: "system",
          content: `你是资深工业设计策略总监。你的任务不是写生图提示词模板，而是先真正阅读产品图、判断品类与设计机会，再给出四条彼此独立、值得探索、可直接执行的完整产品设计路线。

要求：
1. 四条路线必须分别解决不同的高价值机会，优先从产品架构、使用体验、结构逻辑、形态语法、品牌识别与 CMF 的组合层面产生差异，禁止只换颜色、材质或装饰。
2. 每条路线应保留品类、核心功能、人机关系、必要接口与 2 至 3 个最有辨识度的原方案基因。
3. 每条 instruction 必须是一段明确的最终设计指令，包含设计命题、整体比例轮廓、主次体块/线面、结构或交互价值、关键细节与 CMF；不要给选项，不要出现“可以、或者、建议尝试”。
4. 四条路线之间不得同义重复，也不要为了凑数制造空洞概念。
5. 不要描述摄影、构图、象限、背景、渲染质量，这些由下一阶段统一处理。
6. 只输出严格 JSON，不要 Markdown、解释或分析过程：{"concepts":[{"concept":"2-8字路线名","instruction":"具体最终设计指令"},共4项]}`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                payload.productName ? `产品名称：${payload.productName}` : "产品名称：请根据图片判断",
                `探索幅度：${levelInstruction}`,
                payload.note ? `用户补充边界：${payload.note}` : "用户补充边界：无，请自主寻找最有价值的机会",
                payload.originalDescription ? `原方案信息：${payload.originalDescription}` : ""
              ].filter(Boolean).join("\n")
            },
            { type: "image_url", image_url: { url: payload.sourceImageBase64 } }
          ]
        }
      ]
    });
    const plan = parsePlan(raw);
    const prepared = buildFreeExplorationPrompt({ productName: payload.productName, concepts: plan.concepts });
    return NextResponse.json({ prompt: prepared.prompt, concepts: prepared.quadrantStyleLabels });
  } catch (error) {
    const message = error instanceof Error ? error.message : "自由探索规划失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
