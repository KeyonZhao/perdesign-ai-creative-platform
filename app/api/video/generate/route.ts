import { NextResponse } from "next/server";
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
      imageBase64?: unknown;
      prompt?: unknown;
      ratio?: unknown;
      duration?: unknown;
      resolution?: unknown;
    };

    if (typeof body.imageBase64 !== "string" || !body.imageBase64.startsWith("data:image/")) {
      return NextResponse.json({ error: "缺少可用于视频首帧的图片。" }, { status: 400 });
    }

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
    const response = await fetch(`${config.baseUrl}/contents/generations/tasks`, {
      method: "POST",
      headers: volcengineVideoHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        content: [
          {
            type: "text",
            text: prompt
          },
          {
            type: "image_url",
            image_url: { url: body.imageBase64 },
            role: "first_frame"
          }
        ],
        ratio,
        duration,
        resolution,
        watermark: false
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
