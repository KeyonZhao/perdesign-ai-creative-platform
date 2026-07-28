import type { GenerationBatch, GenerationMetadata, GenerationResult, GenerationSourceImage } from "./types";
import { dataUrlToBlob } from "./image";

const DATABASE_NAME = "perdesign-local-gallery";
const DATABASE_VERSION = 1;
const BATCH_STORE = "generation-batches";

type StoredGenerationResult = Omit<GenerationResult, "imageBase64" | "modelBlob"> & {
  imageBlob?: Blob;
  modelBlob?: Blob;
};

type StoredGenerationSourceImage = Omit<GenerationSourceImage, "dataUrl"> & {
  imageBlob: Blob;
};

type StoredGenerationMetadata = Omit<GenerationMetadata, "sketchImage" | "productImage" | "referenceImage" | "referenceImages"> & {
  sketchImage?: StoredGenerationSourceImage;
  productImage?: StoredGenerationSourceImage;
  referenceImage?: StoredGenerationSourceImage;
  referenceImages?: StoredGenerationSourceImage[];
};

type StoredGenerationBatch = {
  id: string;
  createdAt: number;
  results: StoredGenerationResult[];
  metadata?: StoredGenerationMetadata;
};

export type LocalGalleryStats = {
  batchCount: number;
  imageCount: number;
  savedBytes: number;
  browserUsage?: number;
  browserQuota?: number;
  persistent: boolean;
};

export async function loadLocalGenerationBatches() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BATCH_STORE, "readonly");
    const records = await requestToPromise<StoredGenerationBatch[]>(transaction.objectStore(BATCH_STORE).getAll());
    await transactionDone(transaction);

    const sorted = records.sort((a, b) => a.createdAt - b.createdAt);
    return Promise.all(sorted.map(restoreBatch));
  } finally {
    database.close();
  }
}

export async function saveLocalGenerationBatch(batch: GenerationBatch) {
  const storedBatch = await storeBatch(batch, Date.now());
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BATCH_STORE, "readwrite");
    transaction.objectStore(BATCH_STORE).put(storedBatch);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function replaceLocalGenerationBatches(batches: GenerationBatch[]) {
  const storedBatches = await Promise.all(batches.map((batch, index) => storeBatch(batch, Date.now() + index)));
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BATCH_STORE, "readwrite");
    const store = transaction.objectStore(BATCH_STORE);
    store.clear();
    storedBatches.forEach((batch) => store.put(batch));
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function clearLocalGenerationBatches() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BATCH_STORE, "readwrite");
    transaction.objectStore(BATCH_STORE).clear();
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function getLocalGalleryStats(): Promise<LocalGalleryStats> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(BATCH_STORE, "readonly");
    const records = await requestToPromise<StoredGenerationBatch[]>(transaction.objectStore(BATCH_STORE).getAll());
    await transactionDone(transaction);
    const storageEstimate = await navigator.storage?.estimate?.();
    const persistent = Boolean(await navigator.storage?.persisted?.());

    return {
      batchCount: records.length,
      imageCount: records.reduce((sum, batch) => sum + batch.results.filter((result) => result.imageBlob).length, 0),
      savedBytes: records.reduce(
        (sum, batch) =>
          sum +
          batch.results.reduce(
            (batchSum, result) => batchSum + (result.imageBlob?.size || 0) + (result.modelBlob?.size || 0),
            0
          ) +
          (batch.metadata?.sketchImage?.imageBlob.size || 0) +
          (batch.metadata?.productImage?.imageBlob.size || 0) +
          (batch.metadata?.referenceImage?.imageBlob.size || 0) +
          (batch.metadata?.referenceImages?.reduce((imageSum, image) => imageSum + image.imageBlob.size, 0) || 0),
        0
      ),
      browserUsage: storageEstimate?.usage,
      browserQuota: storageEstimate?.quota,
      persistent
    };
  } finally {
    database.close();
  }
}

export async function requestPersistentLocalStorage() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}

async function storeBatch(batch: GenerationBatch, createdAt: number): Promise<StoredGenerationBatch> {
  return {
    id: batch.id,
    createdAt,
    metadata: batch.metadata
      ? {
          description: batch.metadata.description,
          innovationLevel: batch.metadata.innovationLevel,
          generationType: batch.metadata.generationType,
          divergenceStyles: batch.metadata.divergenceStyles,
          sketchImage: storeSourceImage(batch.metadata.sketchImage),
          productImage: storeSourceImage(batch.metadata.productImage),
          referenceImage: storeSourceImage(batch.metadata.referenceImage),
          referenceImages: batch.metadata.referenceImages
            ?.map((image) => storeSourceImage(image))
            .filter((image): image is StoredGenerationSourceImage => Boolean(image))
        }
      : undefined,
    results: await Promise.all(
      batch.results.map(async ({ imageBase64, modelBlob, ...result }) => ({
        ...result,
        imageBlob: imageBase64 ? dataUrlToBlob(imageBase64) : undefined,
        modelBlob
      }))
    )
  };
}

async function restoreBatch(batch: StoredGenerationBatch): Promise<GenerationBatch> {
  return {
    id: batch.id,
    metadata: batch.metadata
      ? {
          description: batch.metadata.description,
          innovationLevel: batch.metadata.innovationLevel,
          generationType: batch.metadata.generationType,
          divergenceStyles: batch.metadata.divergenceStyles,
          sketchImage: await restoreSourceImage(batch.metadata.sketchImage),
          productImage: await restoreSourceImage(batch.metadata.productImage),
          referenceImage: await restoreSourceImage(batch.metadata.referenceImage),
          referenceImages: batch.metadata.referenceImages
            ? await Promise.all(batch.metadata.referenceImages.map((image) => restoreSourceImage(image)))
                .then((images) => images.filter((image): image is GenerationSourceImage => Boolean(image)))
            : undefined
        }
      : undefined,
    results: await Promise.all(
      batch.results.map(async ({ imageBlob, modelBlob, ...result }) => ({
        ...result,
        imageBase64: imageBlob ? await blobToDataUrl(imageBlob) : undefined,
        modelBlob
      }))
    )
  };
}

function storeSourceImage(image?: GenerationSourceImage): StoredGenerationSourceImage | undefined {
  if (!image?.dataUrl) return undefined;
  return { name: image.name, imageBlob: dataUrlToBlob(image.dataUrl) };
}

async function restoreSourceImage(image?: StoredGenerationSourceImage): Promise<GenerationSourceImage | undefined> {
  if (!image?.imageBlob) return undefined;
  return { name: image.name, dataUrl: await blobToDataUrl(image.imageBlob) };
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BATCH_STORE)) {
        database.createObjectStore(BATCH_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地作品库。"));
    request.onblocked = () => reject(new Error("本地作品库正被其他页面占用，请关闭其他标签页后重试。"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地作品库读取失败。"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("本地作品库写入失败。"));
    transaction.onabort = () => reject(transaction.error || new Error("本地作品库操作已中止。"));
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("本地图片读取失败。"));
    reader.readAsDataURL(blob);
  });
}
