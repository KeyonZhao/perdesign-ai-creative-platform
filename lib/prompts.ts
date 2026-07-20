import { promises as fs } from "fs";
import path from "path";

export async function readSystemPrompt() {
  const filePath = path.join(process.cwd(), "爆款原创重构设计师.txt");
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    throw new Error("缺少 爆款原创重构设计师.txt，请在项目根目录添加该文件。");
  }
}

export function buildPromptRepair(prompt: string) {
  const required = [
    "realistic product rendering",
    "KeyShot rendering",
    "industrial design",
    "refined CMF",
    "premium material",
    "high detail",
    "studio lighting",
    "no text",
    "no watermark",
    "no people"
  ];
  const missing = required.filter((term) => !prompt.toLowerCase().includes(term.toLowerCase()));
  return missing.length ? `${prompt}, ${missing.join(", ")}` : prompt;
}
