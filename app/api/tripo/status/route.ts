import { NextResponse } from "next/server";
import {
  getTripoApiKey,
  getTripoOutputModelUrl,
  readTripoResponse,
  tripoHeaders,
  tripoUrl,
  type TripoTask
} from "@/lib/tripo";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const taskId = new URL(request.url).searchParams.get("taskId")?.trim();
    if (!taskId || !/^[A-Za-z0-9_-]{1,200}$/.test(taskId)) {
      return NextResponse.json({ error: "3D 任务编号无效。" }, { status: 400 });
    }

    const apiKey = getTripoApiKey();
    const response = await fetch(tripoUrl(`/tasks/${encodeURIComponent(taskId)}`), {
      headers: tripoHeaders(apiKey),
      cache: "no-store"
    });
    const task = await readTripoResponse<TripoTask>(response);

    return NextResponse.json({
      taskId: task.task_id,
      status: task.status,
      progress: Math.max(0, Math.min(100, task.progress || 0)),
      modelUrl: getTripoOutputModelUrl(task.output),
      renderedImageUrl: task.output?.rendered_image_url,
      error: task.message
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "3D 任务状态查询失败。" },
      { status: 500 }
    );
  }
}
