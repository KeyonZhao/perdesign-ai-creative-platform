import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  imageBase64: z.string().startsWith("data:image/"),
  size: z.string().regex(/^\d{2,5}x\d{2,5}$/)
});

function getConfig() {
  const apiKey = process.env.PERDESIGN_UPSCALE_API_KEY?.trim();
  const baseUrl = (process.env.PERDESIGN_UPSCALE_BASE_URL || "https://task-api-1.65535.space/v1")
    .trim()
    .replace(/\/+$/, "");
  if (!apiKey) throw new Error("高清放大服务尚未配置 API Key。");
  return { apiKey, baseUrl };
}

function readError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  if (typeof record.error_message === "string" && record.error_message.trim()) return record.error_message;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (record.error && typeof record.error === "object") {
    const message = (record.error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const { apiKey, baseUrl } = getConfig();
    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify({
        kind: "image",
        model: "seedvr2-7b",
        input: {
          prompt: "Upscale this image while preserving the original composition, colors and product details.",
          image: input.imageBase64,
          size: input.size,
          seed: 42,
          color_correction: "wavelet",
          resize_method: "lanczos",
          response_format: "url"
        }
      })
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) throw new Error(readError(payload, "高清放大任务提交失败。"));
    const taskId = typeof payload?.id === "string" ? payload.id.trim() : "";
    if (!taskId) throw new Error("高清放大服务没有返回任务编号。");
    return NextResponse.json({ taskId }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "高清放大任务提交失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
