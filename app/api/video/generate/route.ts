import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import {
  getVolcengineVideoConfig,
  readVolcengineVideoResponse,
  volcengineVideoHeaders
} from "@/lib/volcengine-video";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_RATIOS = new Set(["16:9", "9:16", "1:1"]);
const ALLOWED_DURATIONS = new Set([5, 10]);
const ALLOWED_RESOLUTIONS = new Set(["720p", "1080p"]);

type CreateVideoResponse = {
  id?: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      imageUrl?: unknown;
      imageBase64?: unknown;
      prompt?: unknown;
      ratio?: unknown;
      duration?: unknown;
      resolution?: unknown;
    };

    const suppliedImageUrl =
      typeof body.imageUrl === "string" && /^https:\/\//i.test(body.imageUrl)
        ? body.imageUrl
        : "";
    const suppliedImageBase64 =
      typeof body.imageBase64 === "string" && body.imageBase64.startsWith("data:image/")
        ? body.imageBase64
        : "";
    if (!suppliedImageUrl && !suppliedImageBase64) {
      return NextResponse.json(
        { error: "缺少可用于视频首帧的图片。" },
        { status: 400 }
      );
    }
    const imageUrl = suppliedImageUrl || await uploadVideoReference(suppliedImageBase64);

    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
    const ratio = typeof body.ratio === "string" && ALLOWED_RATIOS.has(body.ratio)
      ? body.ratio
      : "16:9";
    const duration = typeof body.duration === "number" && ALLOWED_DURATIONS.has(body.duration)
      ? body.duration
      : 5;
    const resolution =
      typeof body.resolution === "string" && ALLOWED_RESOLUTIONS.has(body.resolution)
        ? body.resolution
        : "720p";
    const config = getVolcengineVideoConfig();
    const response = await fetch(`${config.baseUrl}/v1/videos`, {
      method: "POST",
      headers: volcengineVideoHeaders(config.apiKey, `perdesign-video-${crypto.randomUUID()}`),
      body: JSON.stringify({
        model: config.model,
        prompt,
        seconds: duration,
        aspect_ratio: ratio,
        resolution,
        images: [imageUrl]
      }),
      cache: "no-store"
    });
    const payload = await readVolcengineVideoResponse<CreateVideoResponse>(response);
    const taskId = typeof payload.id === "string" ? payload.id.trim() : "";

    if (!taskId) throw new Error("视频服务没有返回有效的任务编号。");
    return NextResponse.json({ taskId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "视频生成任务创建失败。" },
      { status: 500 }
    );
  }
}

async function uploadVideoReference(dataUrl: string) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) throw new Error("视频参考图格式无效。");
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 4_000_000) {
    throw new Error("视频参考图过大，请压缩到 4MB 以内后重试。");
  }

  const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
  const blob = await put(`video-references/reference.${extension}`, buffer, {
    access: "public",
    addRandomSuffix: true,
    contentType
  });
  return blob.url;
}
