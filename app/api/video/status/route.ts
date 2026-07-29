import { NextResponse } from "next/server";
import {
  getVolcengineVideoConfig,
  readVolcengineVideoResponse,
  volcengineVideoHeaders
} from "@/lib/volcengine-video";

export const runtime = "nodejs";
export const maxDuration = 60;

type VideoTaskResponse = {
  id?: string;
  status?: string;
  content?: {
    video_url?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

export async function GET(request: Request) {
  try {
    const taskId = new URL(request.url).searchParams.get("taskId")?.trim() || "";
    if (!taskId || !/^[A-Za-z0-9_-]+$/.test(taskId)) {
      return NextResponse.json({ error: "视频任务编号无效。" }, { status: 400 });
    }

    const config = getVolcengineVideoConfig();
    const response = await fetch(`${config.baseUrl}/contents/generations/tasks/${taskId}`, {
      method: "GET",
      headers: volcengineVideoHeaders(config.apiKey),
      cache: "no-store"
    });
    const payload = await readVolcengineVideoResponse<VideoTaskResponse>(response);
    const status = normalizeStatus(payload.status);
    const videoUrl = typeof payload.content?.video_url === "string"
      ? payload.content.video_url
      : undefined;
    const error = [payload.error?.code, payload.error?.message].filter(Boolean).join("：");

    return NextResponse.json({
      taskId: payload.id || taskId,
      status,
      videoUrl,
      error: error || undefined
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "视频任务查询失败。" },
      { status: 500 }
    );
  }
}

function normalizeStatus(status?: string) {
  if (status === "succeeded") return "succeeded";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "running") return "running";
  return "queued";
}
