import { NextResponse } from "next/server";
import { isAllowedTripoModelUrl } from "@/lib/tripo";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const modelUrl = searchParams.get("url")?.trim();
  const requestedFilename = searchParams.get("filename")?.trim();
  const filename = requestedFilename && /^[A-Za-z0-9._-]{1,120}$/.test(requestedFilename)
    ? requestedFilename
    : "perdesign-model.glb";
  if (!modelUrl || !isAllowedTripoModelUrl(modelUrl)) {
    return NextResponse.json({ error: "3D 模型下载地址无效。" }, { status: 400 });
  }

  try {
    const upstream = await fetch(modelUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `3D 模型读取失败（HTTP ${upstream.status}）。` },
        { status: 502 }
      );
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "model/gltf-binary",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=240"
      }
    });
  } catch {
    return NextResponse.json({ error: "3D 模型读取失败，请重新生成。" }, { status: 502 });
  }
}
