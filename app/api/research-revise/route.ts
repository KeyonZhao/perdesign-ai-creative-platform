import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveProviderConfig } from "@/lib/provider";
import { reviseResearchDocument } from "@/lib/research";

const requestSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  originalContent: z.string().min(1),
  originalOutline: z.string().min(1),
  modifiedOutline: z.string().min(1),
  changes: z.array(z.string().min(1)).min(1).max(100)
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = resolveProviderConfig(payload, "chat");
    const content = await reviseResearchDocument({ ...payload, ...provider });
    return NextResponse.json({ content });
  } catch (error) {
    console.error("[research-revise] request failed", error);
    const message = error instanceof Error ? error.message : "策划案修改失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
