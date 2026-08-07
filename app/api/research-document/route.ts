import { NextResponse } from "next/server";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_LENGTH = 160_000;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("请选择需要转换的策划案文件。");
    if (file.size > MAX_FILE_BYTES) throw new Error("策划案文件不能超过 25MB。");

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const buffer = Buffer.from(await file.arrayBuffer());
    let content = "";
    if (extension === "docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      content = (await mammoth.extractRawText({ buffer })).value;
    } else if (extension === "pdf" || file.type === "application/pdf") {
      content = (await pdfParse(buffer)).text;
    } else if (["txt", "md", "markdown"].includes(extension) || file.type.startsWith("text/")) {
      content = new TextDecoder("utf-8").decode(buffer);
    } else {
      throw new Error("仅支持 DOCX、PDF、TXT 和 Markdown 策划案。");
    }

    const normalized = normalizeExtractedText(content).slice(0, MAX_TEXT_LENGTH);
    if (normalized.length < 280) {
      throw new Error("文件中提取到的正文过少，可能是扫描版 PDF 或文件内容为空。");
    }
    return NextResponse.json({
      content: normalized,
      title: file.name.replace(/\.(?:docx|pdf|txt|md|markdown)$/i, "").trim() || "导入策划案",
      truncated: normalized.length >= MAX_TEXT_LENGTH
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "策划案文件读取失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}
