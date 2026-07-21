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

export function prepareImageForVision(dataUrl: string, maxDimension = 1280, quality = 0.76) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      let canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      let context = canvas.getContext("2d");
      if (!context) return reject(new Error("当前浏览器无法处理设计说明图片。"));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      let encoded = canvas.toDataURL("image/jpeg", quality);
      let currentQuality = quality;
      const maximumDataUrlLength = 900_000;
      for (let attempt = 0; encoded.length > maximumDataUrlLength && attempt < 5; attempt += 1) {
        currentQuality = Math.max(0.46, currentQuality - 0.08);
        if (attempt >= 2 && Math.max(canvas.width, canvas.height) > 720) {
          const smallerCanvas = document.createElement("canvas");
          smallerCanvas.width = Math.max(1, Math.round(canvas.width * 0.8));
          smallerCanvas.height = Math.max(1, Math.round(canvas.height * 0.8));
          const smallerContext = smallerCanvas.getContext("2d");
          if (!smallerContext) break;
          smallerContext.fillStyle = "#ffffff";
          smallerContext.fillRect(0, 0, smallerCanvas.width, smallerCanvas.height);
          smallerContext.drawImage(canvas, 0, 0, smallerCanvas.width, smallerCanvas.height);
          canvas = smallerCanvas;
          context = smallerContext;
        }
        encoded = canvas.toDataURL("image/jpeg", currentQuality);
      }
      resolve(encoded);
    };
    image.onerror = () => reject(new Error("当前图片无法用于生成设计说明。"));
    image.src = dataUrl;
  });
}
