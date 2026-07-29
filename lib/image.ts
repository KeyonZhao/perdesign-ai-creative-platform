import type { UploadedImage } from "@/lib/types";

const GALLERY_IMAGE_DRAG_TYPE = "application/x-perdesign-gallery-image";
let activeGalleryDragImage: UploadedImage | null = null;

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
  activeGalleryDragImage = {
    name: filename,
    size: blob.size,
    type: blob.type || "image/png",
    dataUrl
  };
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(GALLERY_IMAGE_DRAG_TYPE, filename);
  dataTransfer.setData("DownloadURL", `${blob.type || "image/png"}:${filename}:${objectUrl}`);
  dataTransfer.setData("text/uri-list", objectUrl);
  return objectUrl;
}

export function getGalleryDraggedImage(dataTransfer: DataTransfer) {
  const isGalleryImage = Array.from(dataTransfer.types).includes(GALLERY_IMAGE_DRAG_TYPE);
  if (!isGalleryImage || !activeGalleryDragImage) return null;
  return { ...activeGalleryDragImage };
}

export function releaseImageFileDrag(objectUrl: string | null) {
  activeGalleryDragImage = null;
  if (!objectUrl) return;
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
}

export function getDataUrlMime(dataUrl: string) {
  return dataUrl.match(/^data:(.*?);base64,/)?.[1] || "image/png";
}

function loadDataUrlImage(dataUrl: string, errorMessage: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(errorMessage));
    image.src = dataUrl;
  });
}

export async function convertImageDataUrlToPng(dataUrl: string) {
  const image = await loadDataUrlImage(dataUrl, "局部修改源图无法读取，请重新打开图片后再试。");
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法准备局部修改图片。");
  context.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function compositeMaskedEdit(
  sourceDataUrl: string,
  editedDataUrl: string,
  maskDataUrl: string
) {
  const [sourceImage, editedImage, maskImage] = await Promise.all([
    loadDataUrlImage(sourceDataUrl, "原始图片无法用于局部修改合成。"),
    loadDataUrlImage(editedDataUrl, "生成图片无法用于局部修改合成。"),
    loadDataUrlImage(maskDataUrl, "局部修改蒙版无法读取，请重新涂抹。")
  ]);

  const width = sourceImage.naturalWidth;
  const height = sourceImage.naturalHeight;
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) throw new Error("当前浏览器无法完成局部修改合成。");
  outputContext.drawImage(sourceImage, 0, 0, width, height);

  const editCanvas = document.createElement("canvas");
  editCanvas.width = width;
  editCanvas.height = height;
  const editContext = editCanvas.getContext("2d");
  if (!editContext) throw new Error("当前浏览器无法完成局部修改合成。");
  editContext.drawImage(editedImage, 0, 0, width, height);

  // The API mask is transparent where edits are allowed and opaque elsewhere.
  editContext.globalCompositeOperation = "destination-out";
  editContext.drawImage(maskImage, 0, 0, width, height);
  editContext.globalCompositeOperation = "source-over";
  outputContext.drawImage(editCanvas, 0, 0);

  return outputCanvas.toDataURL("image/png");
}

export function prepareImageForVision(
  dataUrl: string,
  maxDimension = 1280,
  quality = 0.76,
  maximumDataUrlLength = 900_000
) {
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
