export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function dataUrlToBlob(dataUrl: string) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*);base64/)?.[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function dataUrlToFile(dataUrl: string, filename = "product.png") {
  const blob = dataUrlToBlob(dataUrl);
  return new File([blob], filename, { type: blob.type });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function prepareImageFileDrag(dataTransfer: DataTransfer, dataUrl: string, filename: string) {
  const blob = dataUrlToBlob(dataUrl);
  const objectUrl = URL.createObjectURL(blob);
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData("DownloadURL", `${blob.type || "image/png"}:${filename}:${objectUrl}`);
  dataTransfer.setData("text/uri-list", objectUrl);
  return objectUrl;
}

export function releaseImageFileDrag(objectUrl: string | null) {
  if (!objectUrl) return;
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
}

export function getDataUrlMime(dataUrl: string) {
  return dataUrl.match(/^data:(.*?);base64,/)?.[1] || "image/png";
}

export function prepareImageForVision(dataUrl: string, maxDimension = 1600, quality = 0.82) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("当前浏览器无法处理设计说明图片。"));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => reject(new Error("当前图片无法用于生成设计说明。"));
    image.src = dataUrl;
  });
}
