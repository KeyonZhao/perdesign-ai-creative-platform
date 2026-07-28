import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { GenerationResult } from "./types";

export async function downloadResultsZip(results: GenerationResult[]) {
  const zip = new JSZip();
  const validImages = results.filter((result) => result.assetType !== "model3d" && result.imageBase64);

  validImages.forEach((result, index) => {
    const base64 = result.imageBase64!.split(",")[1];
    zip.file(`concept-${String(index + 1).padStart(2, "0")}.png`, base64, { base64: true });
  });

  zip.file(
    "prompts.json",
    JSON.stringify(
      results.map(({ id, title, prompt, error }) => ({ id, title, prompt, error })),
      null,
      2
    )
  );

  zip.file(
    "README.txt",
    [
      "爆款产品批量变款 AI 工作站",
      "",
      `导出时间：${new Date().toLocaleString()}`,
      `成功图片：${validImages.length}`,
      `总方案数：${results.length}`,
      "",
      "图片文件与 prompts.json 一一对应。"
    ].join("\n")
  );

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `product-variations-${Date.now()}.zip`);
}
