import JSZip from "jszip";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_LENGTH = 220_000;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择文件。");
    if (file.size > MAX_FILE_BYTES) throw new Error("文件超过平台当前 25MB 单文件上限。");
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const buffer = Buffer.from(await file.arrayBuffer());
    let content = "";
    if (extension === "docx") {
      content = (await mammoth.extractRawText({ buffer })).value;
    } else if (extension === "pdf") {
      content = (await pdfParse(buffer)).text;
    } else if (["txt", "md", "markdown", "csv", "tsv"].includes(extension) || file.type.startsWith("text/")) {
      content = new TextDecoder("utf-8").decode(buffer);
    } else if (extension === "pptx") {
      content = await extractOfficeXmlText(buffer, /^ppt\/slides\/slide\d+\.xml$/);
    } else if (extension === "xlsx") {
      content = await extractOfficeXmlText(buffer, /^xl\/(?:worksheets\/sheet\d+|sharedStrings)\.xml$/);
    } else {
      throw new Error("支持图片、PDF、DOCX、TXT、Markdown、CSV、TSV、PPTX 和 XLSX 文件。");
    }
    const normalized = normalize(content).slice(0, MAX_TEXT_LENGTH);
    if (!normalized) throw new Error("没有从文件中读取到有效文字；扫描版文件请转成图片后上传。");
    return Response.json({ content: normalized, truncated: normalized.length >= MAX_TEXT_LENGTH });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "文件读取失败。" }, { status: 400 });
  }
}

async function extractOfficeXmlText(buffer: Buffer, matcher: RegExp) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((name) => matcher.test(name)).sort(naturalSort);
  const chunks = await Promise.all(names.map(async (name) => decodeXml(await zip.file(name)!.async("text"))));
  return chunks.join("\n\n");
}

function decodeXml(xml: string) {
  return xml
    .replace(/<a:br\s*\/>|<w:br\s*\/>/g, "\n")
    .replace(/<\/a:p>|<\/w:p>|<\/row>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

function normalize(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[\t\u00a0 ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
