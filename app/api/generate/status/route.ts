import { NextResponse } from "next/server";
import { z } from "zod";
import { getAsyncImageJob } from "@/lib/aihubmix";
import { resolveProviderConfig } from "@/lib/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  imageApiKey: z.string().min(1),
  imageApiBaseUrl: z.string().url(),
  jobId: z.string().min(6).max(200)
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = resolveProviderConfig(
      {
        apiKey: payload.imageApiKey,
        baseUrl: payload.imageApiBaseUrl
      },
      "image"
    );
    const job = await getAsyncImageJob({
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      jobId: payload.jobId
    });

    if (job.status === "pending" || job.status === "running") {
      return NextResponse.json(job, { status: 202 });
    }
    if (job.status === "failed") {
      return NextResponse.json(job, { status: 422 });
    }
    return NextResponse.json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生图任务状态查询失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
