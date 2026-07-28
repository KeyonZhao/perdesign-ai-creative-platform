import { NextResponse } from "next/server";
import {
  getTripoApiKey,
  getTripoModel,
  parseImageDataUrl,
  readTripoResponse,
  tripoHeaders,
  tripoUrl
} from "@/lib/tripo";

export const runtime = "nodejs";
export const maxDuration = 60;

type UploadResult = { file_token: string };
type CreateTaskResult = { task_id: string };
type MultiviewKey = "left" | "back" | "right";

async function uploadImage(apiKey: string, imageBase64: string, filename: string) {
  const image = parseImageDataUrl(imageBase64);
  const uploadForm = new FormData();
  uploadForm.append(
    "file",
    new Blob([image.bytes], { type: image.mimeType }),
    `${filename}.${image.extension}`
  );

  const uploadResponse = await fetch(tripoUrl("/files"), {
    method: "POST",
    headers: tripoHeaders(apiKey),
    body: uploadForm,
    cache: "no-store"
  });
  return readTripoResponse<UploadResult>(uploadResponse);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      imageBase64?: unknown;
      multiviewImages?: Partial<Record<MultiviewKey, unknown>>;
    };
    if (typeof body.imageBase64 !== "string") {
      return NextResponse.json({ error: "缺少需要转换的图片。" }, { status: 400 });
    }

    const apiKey = getTripoApiKey();
    const viewKeys: MultiviewKey[] = ["left", "back", "right"];
    const suppliedViews = viewKeys
      .map((key) => ({ key, value: body.multiviewImages?.[key] }))
      .filter((view): view is { key: MultiviewKey; value: string } => typeof view.value === "string" && Boolean(view.value));
    const uploadedFront = await uploadImage(apiKey, body.imageBase64, "perdesign-front");

    let endpoint = "/generation/image-to-model";
    let taskPayload: Record<string, unknown> = {
      input: uploadedFront.file_token,
      model: getTripoModel(),
      texture: false,
      pbr: false,
      export_uv: false,
      enable_image_autofix: true
    };

    if (suppliedViews.length) {
      const uploadedViews = await Promise.all(
        suppliedViews.map(async (view) => ({
          key: view.key,
          uploaded: await uploadImage(apiKey, view.value, `perdesign-${view.key}`)
        }))
      );
      endpoint = "/generation/multiview-to-model";
      taskPayload = {
        inputs: [
          { front: uploadedFront.file_token },
          ...uploadedViews.map((view) => ({ [view.key]: view.uploaded.file_token }))
        ],
        model: getTripoModel(),
        texture: false,
        pbr: false,
        export_uv: false
      };
    }

    const createResponse = await fetch(tripoUrl(endpoint), {
      method: "POST",
      headers: tripoHeaders(apiKey, true),
      body: JSON.stringify(taskPayload),
      cache: "no-store"
    });
    const task = await readTripoResponse<CreateTaskResult>(createResponse);
    const taskId = typeof task.task_id === "string" ? task.task_id.trim() : "";
    if (!taskId) {
      throw new Error("Tripo 没有返回有效的 3D 任务编号。");
    }

    return NextResponse.json({ taskId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "3D 生成任务创建失败。" },
      { status: 500 }
    );
  }
}
