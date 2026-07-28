import { NextResponse } from "next/server";
import {
  getTripoApiKey,
  readTripoResponse,
  tripoHeaders,
  tripoUrl
} from "@/lib/tripo";

export const runtime = "nodejs";
export const maxDuration = 60;

type ConvertTaskResult = { task_id: string };

export async function POST(request: Request) {
  try {
    const body = await request.json() as { taskId?: unknown; format?: unknown };
    const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
    const format = typeof body.format === "string" ? body.format.trim().toUpperCase() : "";

    if (!/^[A-Za-z0-9_-]{1,200}$/.test(taskId)) {
      return NextResponse.json({ error: "3D 任务编号无效。" }, { status: 400 });
    }
    if (format !== "OBJ" && format !== "STL") {
      return NextResponse.json({ error: "仅支持转换为 OBJ 或 STL。" }, { status: 400 });
    }

    const apiKey = getTripoApiKey();
    const response = await fetch(tripoUrl("/models/convert"), {
      method: "POST",
      headers: tripoHeaders(apiKey, true),
      body: JSON.stringify({ input: taskId, format }),
      cache: "no-store"
    });
    const task = await readTripoResponse<ConvertTaskResult>(response);
    const conversionTaskId = typeof task.task_id === "string" ? task.task_id.trim() : "";
    if (!conversionTaskId) throw new Error("Tripo 没有返回格式转换任务编号。");

    return NextResponse.json({ taskId: conversionTaskId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "3D 模型格式转换失败。" },
      { status: 500 }
    );
  }
}
