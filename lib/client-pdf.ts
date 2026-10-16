export async function extractPdfTextInBrowser(file: File, onProgress?: (progress: number) => void) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  onProgress?.(8);
  const bytes = new Uint8Array(await file.arrayBuffer());
  onProgress?.(16);
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => "str" in item ? item.str : "")
        .filter(Boolean)
        .join(" ");
      if (text.trim()) pages.push(`--- 第 ${pageNumber} 页 ---\n${text}`);
      onProgress?.(16 + Math.round((pageNumber / document.numPages) * 80));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  const normalized = pages
    .join("\n\n")
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 160_000);
  if (normalized.length < 20) {
    throw new Error("PDF 中没有识别到可用文字。若这是扫描件，请先进行 OCR 识别后重新上传。");
  }
  onProgress?.(100);
  return normalized;
}
