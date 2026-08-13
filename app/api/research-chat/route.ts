import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveProviderConfig } from "@/lib/provider";
import { generateResearchReply } from "@/lib/research";

export const runtime = "nodejs";
export const maxDuration = 300;

const imageSchema = z.object({
  name: z.string().min(1),
  dataUrl: z.string().startsWith("data:image/")
});

const messageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string(),
  images: z.array(imageSchema).max(4).optional()
});

const requestSchema = z.object({
  apiKey: z.string().min(1, "请先填写对话 API Key。"),
  baseUrl: z.string().url("请填写有效的对话请求地址。"),
  model: z.string().min(1, "请填写对话模型。"),
  conversation: z.array(messageSchema)
    .transform((messages) => messages
      .map((message) => ({ ...message, content: message.content.trim() }))
      .filter((message) => message.content.length > 0))
    .pipe(z.array(messageSchema).min(1, "当前没有可用对话内容。"))
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = resolveProviderConfig(payload, "chat");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        try {
          const result = await generateResearchReply({
            ...payload,
            ...provider,
            onDelta: (content) => send({ type: "delta", content })
          });
          send({ type: "done", sources: result.sources, images: result.images });
        } catch (error) {
          console.error("[research-chat] stream failed", error);
          send({
            type: "error",
            error: error instanceof Error ? error.message : "策划研究回复失败，请稍后重试。"
          });
        } finally {
          controller.close();
        }
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform"
      }
    });
  } catch (error) {
    console.error("[research-chat] request failed", error);
    const message = error instanceof Error ? error.message : "策划研究回复失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
