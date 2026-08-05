import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({ taskId: z.string().regex(/^[A-Za-z0-9_-]{6,200}$/) });

function getConfig() {
  const apiKey = process.env.PERDESIGN_UPSCALE_API_KEY?.trim();
  const baseUrl = (process.env.PERDESIGN_UPSCALE_BASE_URL || "https://task-api-1.65535.space/v1")
    .trim()
    .replace(/\/+$/, "");
  if (!apiKey) throw new Error("高清放大服务尚未配置 API Key。");
  return { apiKey, baseUrl };
}

function readError(payload: Record<string, unknown> | null, fallback: string) {
  if (typeof payload?.error_message === "string" && payload.error_message.trim()) return payload.error_message;
  if (payload?.error && typeof payload.error === "object") {
    const message = (payload.error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function GET(request: Request) {
  try {
    const { taskId } = requestSchema.parse({
      taskId: new URL(request.url).searchParams.get("taskId") || ""
    });
    const { apiKey, baseUrl } = getConfig();
    const response = await fetch(`${baseUrl}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) throw new Error(readError(payload, "高清放大任务查询失败。"));
    const status = typeof payload?.status === "string" ? payload.status : "pending";
    if (status === "failed") {
      return NextResponse.json({ status, error: readError(payload, "高清放大失败。") }, { status: 422 });
    }
    if (status !== "done") return NextResponse.json({ status }, { status: 202 });

    const urls = Array.isArray(payload?.result_urls) ? payload.result_urls : [];
    const resultUrl = urls.find((value): value is string => typeof value === "string" && /^https?:\/\//.test(value));
    if (!resultUrl) throw new Error("高清放大任务已完成，但没有返回图片地址。");
    const imageResponse = await fetch(resultUrl, { cache: "no-store" });
    if (!imageResponse.ok) throw new Error("高清图片下载失败，请重新尝试。");
    const mimeType = imageResponse.headers.get("content-type")?.split(";")[0] || "image/png";
    const imageBase64 = `data:${mimeType};base64,${Buffer.from(await imageResponse.arrayBuffer()).toString("base64")}`;
    return NextResponse.json({ status: "done", imageBase64 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "高清放大任务查询失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
