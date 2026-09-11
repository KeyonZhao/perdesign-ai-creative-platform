import { NextResponse } from "next/server";
import { z } from "zod";
import { streamChatCompletion } from "@/lib/aihubmix";
import { buildFreeExplorationPrompt } from "@/lib/creative-divergence";
import { resolveProviderConfig } from "@/lib/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

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

const looseConceptSchema = z.object({
  concept: z.string().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  route: z.string().optional(),
  instruction: z.string().optional(),
  description: z.string().optional(),
  prompt: z.string().optional()
});

const loosePlanSchema = z.union([
  z.object({ concepts: z.array(looseConceptSchema).min(4) }),
  z.object({ routes: z.array(looseConceptSchema).min(4) }),
  z.array(looseConceptSchema).min(4)
]);

function parsePlan(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const objectCandidate = raw.match(/\{[\s\S]*\}/)?.[0];
  const arrayCandidate = raw.match(/\[[\s\S]*\]/)?.[0];
  const firstObject = raw.indexOf("{");
  const firstArray = raw.indexOf("[");
  const candidate = fenced || (
    firstArray >= 0 && (firstObject < 0 || firstArray < firstObject)
      ? arrayCandidate
      : objectCandidate
  ) || raw;
  const parsed = loosePlanSchema.parse(JSON.parse(candidate.trim().replace(/,\s*([}\]])/g, "$1")));
  const items = Array.isArray(parsed) ? parsed : "concepts" in parsed ? parsed.concepts : parsed.routes;
  const concepts = items.slice(0, 4).map((item) => ({
    concept: (item.concept || item.title || item.name || item.route || "")
      .trim()
      .replace(/[｜|：:].*$/, "")
      .slice(0, 12),
    instruction: (item.instruction || item.description || item.prompt || "").trim().slice(0, 600)
  }));
  if (concepts.length !== 4 || concepts.some((item) => item.concept.length < 2 || item.instruction.length < 24)) {
    throw new Error("大脑模型返回的探索路线不完整。");
  }
  return { concepts };
}

async function generatePlan(
  payload: z.infer<typeof requestSchema>,
  provider: { apiKey: string; baseUrl: string },
  onDelta: (content: string) => void
) {
  const levelInstruction = {
      steady: "稳妥延展：保留较多成熟设计基因，重点寻找可落地且明显优于原方案的变化。",
      balanced: "明显突破：保留核心识别与功能骨架，同时允许重构比例、体块、结构和交互表达。",
      bold: "大胆探索：只守住品类、功能、人机与必要接口，可提出前瞻但仍可制造的新架构。"
  }[payload.explorationLevel];
  let raw = "";
  try {
    await streamChatCompletion({
      ...provider,
      model: payload.model,
      temperature: 0.75,
      maxCompletionTokens: 1000,
      timeoutMs: 52_000,
      reasoningEffort: "low",
      messages: [
        {
          role: "system",
          content: `你是资深工业设计策略总监。你的任务不是写生图提示词模板，而是先真正阅读产品图、判断品类与设计机会，再给出四条彼此独立、值得探索、可直接执行的完整产品设计路线。

要求：
1. 四条路线必须分别解决不同的高价值机会，优先从产品架构、使用体验、结构逻辑、形态语法、品牌识别与 CMF 的组合层面产生差异，禁止只换颜色、材质或装饰。
2. 每条路线应保留品类、核心功能、人机关系、必要接口与 2 至 3 个最有辨识度的原方案基因。
3. 每条 instruction 必须是一段 90 至 140 个汉字的凝练最终设计指令，包含设计命题、整体比例轮廓、主次体块/线面、结构或交互价值、关键细节与 CMF；不要给选项，不要出现“可以、或者、建议尝试”，不要反复解释保留项。
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
    }, (content) => {
      raw += content;
      onDelta(content);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/abort|timeout|超时/i.test(message)) throw error;
    return buildFallbackExploration(payload);
  }

  let plan: ReturnType<typeof parsePlan>;
  try {
    plan = parsePlan(raw);
  } catch {
    return buildFallbackExploration(payload);
  }
  const prepared = buildFreeExplorationPrompt({ productName: payload.productName, concepts: plan.concepts });
  return { prompt: prepared.prompt, concepts: prepared.quadrantStyleLabels };
}

function buildFallbackExploration(payload: z.infer<typeof requestSchema>) {
  const boundary = payload.note || payload.originalDescription;
  const boundaryText = boundary ? `同时遵守用户边界：${boundary.slice(0, 120)}。` : "";
  const concepts = [
    {
      concept: "架构重组",
      instruction: `重构主体比例与功能架构，以清晰的主承载体、独立功能舱和合理装配关系建立全新轮廓；强化结构可信度与维护逻辑，使用克制的深浅材质对比形成专业识别。${boundaryText}`
    },
    {
      concept: "交互前置",
      instruction: `围绕高频操作重新组织人机界面，将控制、反馈与关键功能集中为易理解的交互核心；用连续曲面包覆主体，以明确开口和状态细节表现使用价值与科技感。${boundaryText}`
    },
    {
      concept: "轻量悬浮",
      instruction: `通过上轻下稳的比例、悬浮分层与收窄连接重塑体块关系，在保持必要结构强度的同时降低视觉重量；采用细腻哑光主体、金属骨架和少量透明功能件。${boundaryText}`
    },
    {
      concept: "品牌模块",
      instruction: `建立可扩展的模块化产品语言，以统一圆角、特征切面和连续识别带串联功能单元；让分件、散热、接口与装配缝都服务真实功能，并用单一识别色强化品牌记忆。${boundaryText}`
    }
  ];
  const prepared = buildFreeExplorationPrompt({ productName: payload.productName, concepts });
  return { prompt: prepared.prompt, concepts: prepared.quadrantStyleLabels };
}

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = resolveProviderConfig(payload, "chat");
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        send({ type: "start" });
        try {
          const result = await generatePlan(payload, provider, (content) => send({ type: "delta", content }));
          send({ type: "done", ...result });
        } catch (error) {
          const message = error instanceof Error ? error.message : "自由探索规划失败，请稍后重试。";
          send({ type: "error", error: message });
        } finally {
          controller.close();
        }
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "自由探索规划失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
