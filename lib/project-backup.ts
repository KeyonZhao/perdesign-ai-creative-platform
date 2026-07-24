import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { GenerationBatch, GenerationMetadata, GenerationResult, GenerationSourceImage } from "./types";

const BACKUP_VERSION = 1;

type BackupResult = Omit<GenerationResult, "imageBase64"> & {
  imageFile?: string;
  imageMime?: string;
};

type BackupSourceImage = Omit<GenerationSourceImage, "dataUrl"> & {
  imageFile: string;
  imageMime: string;
};

type BackupMetadata = Omit<GenerationMetadata, "sketchImage" | "productImage" | "referenceImage" | "referenceImages"> & {
  sketchImage?: BackupSourceImage;
  productImage?: BackupSourceImage;
  referenceImage?: BackupSourceImage;
  referenceImages?: BackupSourceImage[];
};

type BackupManifest = {
  format: "perdesign-project";
  version: number;
  exportedAt: string;
  batches: Array<{
    id: string;
    metadata?: BackupMetadata;
    results: BackupResult[];
  }>;
};

export async function exportPerdesignProject(batches: GenerationBatch[]) {
  const zip = new JSZip();
  const imagesFolder = zip.folder("images");
  const inputsFolder = zip.folder("inputs");
  if (!imagesFolder || !inputsFolder) throw new Error("无法创建项目图片目录。");

  const manifest: BackupManifest = {
    format: "perdesign-project",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    batches: batches.map((batch, batchIndex) => {
      const batchNumber = String(batchIndex + 1).padStart(3, "0");
      const storeInputImage = (image: GenerationSourceImage | undefined, role: string) => {
        if (!image?.dataUrl) return undefined;
        const mime = getDataUrlMime(image.dataUrl);
        const filename = `batch-${batchNumber}-${role}.${getImageExtension(mime)}`;
        inputsFolder.file(filename, image.dataUrl.split(",")[1], { base64: true });
        return { name: image.name, imageFile: `inputs/${filename}`, imageMime: mime };
      };

      return {
        id: batch.id,
        metadata: batch.metadata
          ? {
              description: batch.metadata.description,
              innovationLevel: batch.metadata.innovationLevel,
              generationType: batch.metadata.generationType,
              divergenceStyles: batch.metadata.divergenceStyles,
              sketchImage: storeInputImage(batch.metadata.sketchImage, "sketch"),
              productImage: storeInputImage(batch.metadata.productImage, "product"),
              referenceImage: storeInputImage(batch.metadata.referenceImage, "reference"),
              referenceImages: batch.metadata.referenceImages
                ?.map((image, imageIndex) => storeInputImage(image, `reference-${String(imageIndex + 1).padStart(2, "0")}`))
                .filter((image): image is BackupSourceImage => Boolean(image))
            }
          : undefined,
        results: batch.results.map(({ imageBase64, ...result }, resultIndex) => {
          if (!imageBase64) return result;
          const mime = getDataUrlMime(imageBase64);
          const imageFile = `batch-${batchNumber}-image-${String(resultIndex + 1).padStart(3, "0")}.${getImageExtension(mime)}`;
          imagesFolder.file(imageFile, imageBase64.split(",")[1], { base64: true });
          return { ...result, imageFile: `images/${imageFile}`, imageMime: mime };
        })
      };
    })
  };

  zip.file("project.json", JSON.stringify(manifest, null, 2));
  zip.file(
    "README.txt",
    [
      "Perdesign AI Creative Platform 本地项目备份",
      "",
      "请通过平台的“本地作品 - 导入项目”恢复，不要单独修改 project.json 或 images 文件夹。",
      `导出时间：${new Date().toLocaleString()}`,
      `批次数量：${batches.length}`,
      `图片数量：${batches.reduce((sum, batch) => sum + batch.results.filter((result) => result.imageBase64).length, 0)}`
    ].join("\n")
  );

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `perdesign-project-${Date.now()}.zip`);
}

export async function importPerdesignProject(file: File): Promise<GenerationBatch[]> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file("project.json");
  if (!manifestFile) throw new Error("这不是有效的 Perdesign 项目文件。");

  const manifest = JSON.parse(await manifestFile.async("string")) as BackupManifest;
  if (manifest.format !== "perdesign-project" || manifest.version !== BACKUP_VERSION || !Array.isArray(manifest.batches)) {
    throw new Error("项目文件版本不受支持。");
  }

  return Promise.all(
    manifest.batches.map(async (batch) => ({
      id: String(batch.id || ""),
      metadata: batch.metadata
        ? {
            description: String(batch.metadata.description || ""),
            innovationLevel: Number(batch.metadata.innovationLevel ?? 50),
            generationType: batch.metadata.generationType,
            divergenceStyles: batch.metadata.divergenceStyles,
            sketchImage: await restoreBackupSourceImage(zip, batch.metadata.sketchImage),
            productImage: await restoreBackupSourceImage(zip, batch.metadata.productImage),
            referenceImage: await restoreBackupSourceImage(zip, batch.metadata.referenceImage),
            referenceImages: batch.metadata.referenceImages
              ? await Promise.all(batch.metadata.referenceImages.map((image) => restoreBackupSourceImage(zip, image)))
                  .then((images) => images.filter((image): image is GenerationSourceImage => Boolean(image)))
              : undefined
          }
        : undefined,
      results: await Promise.all(
        batch.results.map(async ({ imageFile, imageMime, ...result }) => {
          if (!imageFile) return result;
          const imageEntry = zip.file(imageFile);
          if (!imageEntry) throw new Error(`项目文件缺少图片：${imageFile}`);
          const base64 = await imageEntry.async("base64");
          return {
            ...result,
            imageBase64: `data:${imageMime || "image/png"};base64,${base64}`
          };
        })
      )
    }))
  );
}

async function restoreBackupSourceImage(zip: JSZip, image?: BackupSourceImage): Promise<GenerationSourceImage | undefined> {
  if (!image?.imageFile) return undefined;
  const imageEntry = zip.file(image.imageFile);
  if (!imageEntry) throw new Error(`项目文件缺少输入图片：${image.imageFile}`);
  return {
    name: image.name,
    dataUrl: `data:${image.imageMime || "image/png"};base64,${await imageEntry.async("base64")}`
  };
}

function getDataUrlMime(dataUrl: string) {
  return dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)?.[1] || "image/png";
}

function getImageExtension(mime: string) {
  return mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
}
