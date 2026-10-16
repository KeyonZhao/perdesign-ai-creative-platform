import { z } from "zod";
import { resolveProviderConfig } from "@/lib/provider";
import { streamChatCompletion } from "@/lib/aihubmix";

export const runtime = "nodejs";
export const maxDuration = 300;

const FALLBACK_MODEL = process.env.PERDESIGN_FREE_CHAT_FALLBACK_MODEL?.trim() || "gpt-6-astra";
const imageSchema = z.object({
  name: z.string().min(1).max(180),
  dataUrl: z.string().startsWith("data:image/")
});
const messageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().max(500_000),
  images: z.array(imageSchema).max(20).optional()
});
const requestSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  conversation: z.array(messageSchema).min(1).max(80)
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = resolveProviderConfig(payload, "chat");
    const messages = payload.conversation.map((message) => ({
      role: message.role,
      content: message.images?.length
        ? [
            { type: "text" as const, text: message.content },
            ...message.images.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }))
          ]
        : message.content
    }));
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        const models = payload.model === FALLBACK_MODEL ? [payload.model, payload.model] : [payload.model, FALLBACK_MODEL];
        let emitted = "";
        try {
          let completed = false;
          let lastError: unknown;
          for (let index = 0; index < models.length; index += 1) {
            try {
              await streamChatCompletion({
                ...provider,
                model: models[index],
                temperature: 0.7,
                maxCompletionTokens: 8000,
                reasoningEffort: "low",
                timeoutMs: 240_000,
                messages
              }, (content) => {
                emitted += content;
                send({ type: "delta", content });
              });
              completed = true;
              break;
            } catch (error) {
              lastError = error;
              if (emitted.trim() || index === models.length - 1 || !isRetryable(error)) throw error;
            }
          }
          if (!completed) throw lastError instanceof Error ? lastError : new Error("自由对话服务暂时不可用。");
          send({ type: "done" });
        } catch (error) {
          send({ type: "error", error: error instanceof Error ? error.message : "自由对话请求失败。" });
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
    return Response.json({ error: error instanceof Error ? error.message : "自由对话请求无效。" }, { status: 400 });
  }
}

function isRetryable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /server_error|upstream|temporarily|overload|rate.?limit|too many requests|concurrency|timeout|abort|超时|繁忙|过载|限流/i.test(message);
}
