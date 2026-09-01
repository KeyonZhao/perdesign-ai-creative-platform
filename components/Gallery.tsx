"use client";

import { HardDrive, Package, Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LocalGalleryStats } from "@/lib/local-gallery";
import { getGalleryDraggedImage } from "@/lib/image";
import type { CreativeDivergenceRequest, CustomCanvasGenerationRequest, GenerationBatch, GenerationMetadata, GenerationResult, GenerationSourceImage, GenerationStatus, UploadedImage, VideoGenerationRequest } from "@/lib/types";
import { downloadResultsZip } from "@/lib/zip";
import { CustomCanvasEditorModal } from "./CustomCanvasEditorModal";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { ImageGenerationProgress } from "./ImageGenerationProgress";
import { LocalHistoryModal } from "./LocalHistoryModal";
import { ResultCard } from "./ResultCard";
import { TripoModelViewer } from "./TripoModelViewer";
import { VideoPreviewModal } from "./VideoPreviewModal";

type GalleryProps = {
  isActive: boolean;
  isGeneratingVariant?: boolean;
  status: GenerationStatus;
  batches: GenerationBatch[];
  activeBatchId: string | null;
  count: number;
  onGenerateMultiView: (result: GenerationResult) => void;
  onGenerateScene: (result: GenerationResult) => void;
  onGenerateEcommercePoster: (result: GenerationResult, productName?: string, instruction?: string) => void;
  onGenerateDivergence: (
    result: GenerationResult,
    productName: string | undefined,
    request: CreativeDivergenceRequest
  ) => void;
  onGenerateFromPrompt: (result: GenerationResult, instruction: string, referenceImages?: GenerationSourceImage[]) => void;
  onGenerateDesignDescription: (result: GenerationResult) => Promise<string>;
  onModelGenerated: (sourceResult: GenerationResult, modelBlob: Blob, modelTaskId: string) => void | Promise<void>;
  onUpscale: (result: GenerationResult) => void | Promise<void>;
  onGenerateVideo: (result: GenerationResult, request: VideoGenerationRequest) => void;
  designDescriptionLoadingIds: string[];
  onLocalEdit: (
    result: GenerationResult,
    maskImageBase64: string,
    instruction: string,
    guideImageBase64?: string
  ) => void;
  onGenerateCustom: (request: CustomCanvasGenerationRequest) => boolean;
  onOptimizeCustom: (request: CustomCanvasGenerationRequest) => Promise<string>;
  hasChatConfig: boolean;
  onOpenSettings: () => void;
  historyStats: LocalGalleryStats | null;
  isHistoryReady: boolean;
  onRefreshHistoryStats: () => Promise<void>;
  onExportProject: () => Promise<void>;
  onImportProject: (file: File) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onDeleteResult: (resultId: string) => Promise<boolean>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export function Gallery({
  isActive,
  status,
  batches,
  activeBatchId,
  count,
  onError,
  onSuccess,
  onGenerateMultiView,
  onGenerateScene,
  onGenerateEcommercePoster,
  onGenerateDivergence,
  onGenerateFromPrompt,
  onGenerateDesignDescription,
  onModelGenerated,
  onUpscale,
  onGenerateVideo,
  designDescriptionLoadingIds,
  onLocalEdit,
  onGenerateCustom,
  onOptimizeCustom,
  hasChatConfig,
  onOpenSettings,
  historyStats,
  isHistoryReady,
  onRefreshHistoryStats,
  onExportProject,
  onImportProject,
  onClearHistory,
  onDeleteResult,
  isGeneratingVariant = false
}: GalleryProps) {
  const [preview, setPreview] = useState<GenerationResult | null>(null);
  const [modelPreview, setModelPreview] = useState<GenerationResult | null>(null);
  const [videoPreview, setVideoPreview] = useState<GenerationResult | null>(null);
  const [previewMetadata, setPreviewMetadata] = useState<GenerationMetadata | null>(null);
  const [previewStartsEditing, setPreviewStartsEditing] = useState(false);
  const [previewStartsModel, setPreviewStartsModel] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [customSourceImage, setCustomSourceImage] = useState<UploadedImage | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const activeBatchRef = useRef<HTMLDivElement | null>(null);
  const pendingBatchRef = useRef<HTMLDivElement | null>(null);
  const preservedScrollTopRef = useRef<number | null>(null);
  const allResults = useMemo(() => batches.flatMap((batch) => batch.results), [batches]);
  const generationStartedAtRef = useRef(Date.now());
  const generationSessionBatchIdRef = useRef<string | null>(null);
  const wasGeneratingRef = useRef(false);
  const knownResultIdsRef = useRef(new Set(allResults.map((result) => result.id)));
  const revealTimersRef = useRef(new Map<string, number>());
  const [revealingResultIds, setRevealingResultIds] = useState<string[]>([]);
  const hasPositionedGalleryRef = useRef(false);
  const wasActiveRef = useRef(false);
  const isGenerating = status === "generating";

  if (isGenerating && !wasGeneratingRef.current) {
    generationStartedAtRef.current = Date.now();
  }
  if (isGenerating && generationSessionBatchIdRef.current !== activeBatchId) {
    generationSessionBatchIdRef.current = activeBatchId;
  }
  wasGeneratingRef.current = isGenerating;

  useEffect(() => {
    const knownIds = knownResultIdsRef.current;
    const newResultIds = allResults
      .filter((result) => !knownIds.has(result.id))
      .map((result) => result.id);
    allResults.forEach((result) => knownIds.add(result.id));
    if (!newResultIds.length || !generationSessionBatchIdRef.current) return;

    const activeSessionResultIds = new Set(
      batches
        .find((batch) => batch.id === generationSessionBatchIdRef.current)
        ?.results.map((result) => result.id) || []
    );
    const idsToReveal = newResultIds.filter((id) => activeSessionResultIds.has(id));
    if (!idsToReveal.length) return;

    setRevealingResultIds((current) => Array.from(new Set([...current, ...idsToReveal])));
    idsToReveal.forEach((id) => {
      const previousTimer = revealTimersRef.current.get(id);
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);
      const timer = window.setTimeout(() => {
        revealTimersRef.current.delete(id);
        setRevealingResultIds((current) => current.filter((currentId) => currentId !== id));
      }, 720);
      revealTimersRef.current.set(id, timer);
    });
  }, [allResults, batches]);

  useEffect(() => () => {
    revealTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    revealTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!preview) return;
    const updatedPreview = allResults.find((result) => result.id === preview.id);
    if (updatedPreview && updatedPreview !== preview) setPreview(updatedPreview);
  }, [allResults, preview]);

  useEffect(() => {
    if (!videoPreview) return;
    const updatedPreview = allResults.find((result) => result.id === videoPreview.id);
    if (updatedPreview && updatedPreview !== videoPreview) setVideoPreview(updatedPreview);
  }, [allResults, videoPreview]);

  async function handleZip() {
    try {
      await downloadResultsZip(allResults);
      onSuccess("ZIP 已开始打包下载。");
    } catch {
      onError("ZIP 打包失败，请稍后重试。");
    }
  }

  async function handleDeleteResult(resultId: string) {
    preservedScrollTopRef.current = scrollAreaRef.current?.scrollTop ?? null;
    const deleted = await onDeleteResult(resultId);
    if (!deleted) preservedScrollTopRef.current = null;
    return deleted;
  }

  useLayoutEffect(() => {
    if (preservedScrollTopRef.current !== null) {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTop = preservedScrollTopRef.current;
      }
      preservedScrollTopRef.current = null;
      return;
    }

    if (!isActive) {
      wasActiveRef.current = false;
      return;
    }

    if (hasPositionedGalleryRef.current && !wasActiveRef.current) {
      wasActiveRef.current = true;
      return;
    }
    wasActiveRef.current = true;

    const scrollArea = scrollAreaRef.current;
    const target = isGenerating ? pendingBatchRef.current : activeBatchRef.current;
    if (!scrollArea || !target) return;

    const targetTop = target.offsetTop - 20;
    const top = Math.max(0, targetTop);
    if (!hasPositionedGalleryRef.current) {
      scrollArea.scrollTop = top;
      hasPositionedGalleryRef.current = true;
      return;
    }

    scrollArea.scrollTo({
      top,
      behavior: "smooth"
    });
  }, [activeBatchId, allResults.length, count, isActive, isGenerating]);

  const hasResults = allResults.length > 0;

  return (
    <section className="content-panel flex min-h-0 flex-1 flex-col">
      <div className="gallery-header">
        <div className="gallery-header-actions">
          <button className="btn-secondary mobile-design-settings-button" onClick={onOpenSettings}>
            <SlidersHorizontal className="h-4 w-4" />
            设计设置
          </button>
          <button
            className="btn-secondary gallery-history-button"
            aria-label="本地作品"
            title="本地作品"
            onClick={() => {
              setHistoryOpen(true);
              void onRefreshHistoryStats();
            }}
          >
            <HardDrive className="h-4 w-4" />
            <span>本地作品</span>
          </button>
          {hasResults ? (
            <button className="btn-secondary gallery-zip-button" onClick={handleZip}>
              <Package className="h-4 w-4" />
              一键打包 ZIP
            </button>
          ) : null}
        </div>
      </div>

      <div className="gallery-scroll-wrap min-h-0 flex-1">
        <div className="gallery-top-fade" />
        <div
          ref={scrollAreaRef}
          className="gallery-scroll-area"
          onWheel={(event) => {
            const node = scrollAreaRef.current;
            if (!node) return;
            node.scrollTop += event.deltaY;
          }}
        >
          <div className="gallery-content">
        {hasResults || status === "generating" ? (
          <div className="space-y-5">
            {status === "generating" ? (
              <div className="content-card p-4 text-sm text-zinc-300">
                {hasResults ? "AI 正在生成新方案，完成后会接在最后一张图片后面。" : "AI 正在整理提示词、参考风格与产品语言，并生成方案..."}
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {batches.flatMap((batch, batchIndex) => {
                const isActiveBatch = activeBatchId === batch.id;
                const startIndex = batches.slice(0, batchIndex).reduce((sum, item) => sum + item.results.length, 0);

                return batch.results.map((result, index) => (
                  <div key={result.id} ref={isActiveBatch && index === 0 ? activeBatchRef : null} className="gallery-batch relative overflow-hidden">
                      <ResultCard
                        result={result}
                        index={startIndex + index}
                        onPreview={(selectedResult) => {
                          setPreviewStartsEditing(false);
                          setPreviewStartsModel(false);
                          setPreviewMetadata(batch.metadata || null);
                          setPreview(selectedResult);
                        }}
                        onPreviewModel={setModelPreview}
                        onPreviewVideo={setVideoPreview}
                        onEdit={(selectedResult) => {
                          setPreviewStartsEditing(true);
                          setPreviewStartsModel(false);
                          setPreviewMetadata(batch.metadata || null);
                          setPreview(selectedResult);
                        }}
                        onGenerateMultiView={onGenerateMultiView}
                        onGenerateScene={onGenerateScene}
                        onDelete={() => void handleDeleteResult(result.id)}
                        isGeneratingVariant={isGeneratingVariant}
                      />
                      {revealingResultIds.includes(result.id) ? (
                        <ImageGenerationProgress startedAt={generationStartedAtRef.current} finishing />
                      ) : null}
                  </div>
                ));
              })}
              {status === "generating"
                ? Array.from({ length: count }).map((_, index) => (
                    <div key={`pending-${index}`} ref={index === 0 ? pendingBatchRef : null} className="content-card gallery-batch overflow-hidden">
                      <div className="skeleton relative aspect-square w-full overflow-hidden">
                        <ImageGenerationProgress startedAt={generationStartedAtRef.current} />
                      </div>
                    </div>
                  ))
                : null}
              <CustomCanvasTile
                onClick={() => {
                  setCustomSourceImage(null);
                  setCustomEditorOpen(true);
                }}
                onDropImage={(image) => {
                  setCustomSourceImage(image);
                  setCustomEditorOpen(true);
                }}
                onError={onError}
              />
                  </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {isHistoryReady ? (
              <CustomCanvasTile
                onClick={() => {
                  setCustomSourceImage(null);
                  setCustomEditorOpen(true);
                }}
                onDropImage={(image) => {
                  setCustomSourceImage(image);
                  setCustomEditorOpen(true);
                }}
                onError={onError}
              />
            ) : (
              <div className="content-card gallery-batch flex aspect-square items-center justify-center">
                <HardDrive className="h-7 w-7 animate-pulse text-violet-100" />
              </div>
            )}
          </div>
        )}
          </div>
        </div>
      </div>

      <ImagePreviewModal
        result={preview}
        metadata={previewMetadata}
        startEditing={previewStartsEditing}
        startModelPanel={previewStartsModel}
        onClose={() => {
          setPreview(null);
          setPreviewMetadata(null);
          setPreviewStartsEditing(false);
          setPreviewStartsModel(false);
        }}
        onGenerateMultiView={(result) => {
          onGenerateMultiView(result);
          setPreview(null);
          setPreviewMetadata(null);
          setPreviewStartsEditing(false);
        }}
        onGenerateScene={(result) => {
          onGenerateScene(result);
          setPreview(null);
          setPreviewMetadata(null);
          setPreviewStartsEditing(false);
        }}
        onGenerateEcommercePoster={(result, instruction) => {
          onGenerateEcommercePoster(result, previewMetadata?.productName, instruction);
          setPreview(null);
          setPreviewMetadata(null);
          setPreviewStartsEditing(false);
        }}
        onGenerateDivergence={(result, productName, request) => {
          onGenerateDivergence(result, productName, request);
          setPreview(null);
          setPreviewMetadata(null);
          setPreviewStartsEditing(false);
        }}
        onGenerateFromPrompt={(result, instruction, referenceImages) => {
          onGenerateFromPrompt(result, instruction, referenceImages);
          setPreview(null);
          setPreviewMetadata(null);
          setPreviewStartsEditing(false);
        }}
        onGenerateDesignDescription={onGenerateDesignDescription}
        onGenerateVideo={(result, request) => {
          onGenerateVideo(result, request);
          setPreview(null);
          setPreviewMetadata(null);
          setPreviewStartsEditing(false);
        }}
        onModelGenerated={onModelGenerated}
        onUpscale={(result) => {
          void onUpscale(result);
          setPreview(null);
          setPreviewMetadata(null);
          setPreviewStartsEditing(false);
          setPreviewStartsModel(false);
        }}
        isGeneratingDesignDescription={Boolean(preview && designDescriptionLoadingIds.includes(preview.id))}
        onLocalEdit={(result, maskImageBase64, instruction, guideImageBase64) => {
          onLocalEdit(result, maskImageBase64, instruction, guideImageBase64);
          setPreview(null);
          setPreviewMetadata(null);
          setPreviewStartsEditing(false);
        }}
        isGeneratingVariant={isGeneratingVariant}
        onDelete={async (result) => {
          const deleted = await handleDeleteResult(result.id);
          if (deleted) {
            setPreview(null);
            setPreviewMetadata(null);
            setPreviewStartsEditing(false);
            setPreviewStartsModel(false);
          }
        }}
      />
      <TripoModelViewer
        open={Boolean(modelPreview)}
        phase="success"
        progress={100}
        modelBlob={modelPreview?.modelBlob}
        modelTaskId={modelPreview?.modelTaskId}
        filename={modelPreview?.title.trim().replace(/\s+/g, "-").toLowerCase() || "perdesign-model"}
        onClose={() => setModelPreview(null)}
      />
      <VideoPreviewModal result={videoPreview} onClose={() => setVideoPreview(null)} />
      <LocalHistoryModal
        open={historyOpen}
        stats={historyStats}
        loading={!isHistoryReady}
        hasResults={hasResults}
        onClose={() => setHistoryOpen(false)}
        onExport={onExportProject}
        onImport={onImportProject}
        onClear={onClearHistory}
      />
      {customEditorOpen ? (
        <CustomCanvasEditorModal
          initialSourceImage={customSourceImage}
          status={status}
          hasChatConfig={hasChatConfig}
          onClose={() => {
            setCustomEditorOpen(false);
            setCustomSourceImage(null);
          }}
          onGenerate={onGenerateCustom}
          onOptimize={onOptimizeCustom}
          onOpenLocalEdit={(request) => {
            setCustomEditorOpen(false);
            setPreviewStartsEditing(true);
            setPreviewStartsModel(false);
            setPreviewMetadata(createCustomMetadata(request));
            setPreview(createCustomResult(request));
          }}
          onGenerateMultiView={(request) => {
            setCustomEditorOpen(false);
            onGenerateMultiView(createCustomResult(request));
          }}
          onGenerateScene={(request) => {
            setCustomEditorOpen(false);
            onGenerateScene(createCustomResult(request));
          }}
          onGenerateEcommercePoster={(request, instruction) => {
            setCustomEditorOpen(false);
            setCustomSourceImage(null);
            onGenerateEcommercePoster(createCustomResult(request), request.productName, instruction);
          }}
          onGenerateVideo={(request, videoRequest) => {
            setCustomEditorOpen(false);
            setCustomSourceImage(null);
            onGenerateVideo(createCustomResult(request), videoRequest);
          }}
          onOpenModelPanel={(request) => {
            setCustomEditorOpen(false);
            setCustomSourceImage(null);
            setPreviewStartsEditing(false);
            setPreviewStartsModel(true);
            setPreviewMetadata(createCustomMetadata(request));
            setPreview(createCustomResult(request));
          }}
          onGenerateDivergence={(request, divergenceRequest) => {
            setCustomEditorOpen(false);
            setCustomSourceImage(null);
            onGenerateDivergence(createCustomResult(request), request.productName, divergenceRequest);
          }}
          onError={onError}
          onSuccess={onSuccess}
        />
      ) : null}
    </section>
  );
}

function createCustomResult(request: CustomCanvasGenerationRequest): GenerationResult {
  return {
    id: `custom-canvas-${Date.now()}`,
    title: request.productName || "上传图片",
    prompt: request.requirement,
    imageBase64: request.sourceImage.dataUrl
  };
}

function createCustomMetadata(request: CustomCanvasGenerationRequest): GenerationMetadata {
  return {
    productName: request.productName,
    description: request.requirement,
    innovationLevel: request.innovationLevel,
    generationType: "design",
    productImage: {
      name: request.sourceImage.name,
      dataUrl: request.sourceImage.dataUrl
    },
    referenceImage: request.referenceImage
      ? {
          name: request.referenceImage.name,
          dataUrl: request.referenceImage.dataUrl
        }
      : undefined
  };
}

function CustomCanvasTile({
  onClick,
  onDropImage,
  onError
}: {
  onClick: () => void;
  onDropImage: (image: UploadedImage) => void;
  onError: (message: string) => void;
}) {
  const [dragging, setDragging] = useState(false);

  async function handleDroppedFile(file?: File) {
    if (!file) {
      onError("没有读取到图片，请重新拖入。");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      onError("请拖入 PNG、JPG、JPEG 或 WebP 图片。");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      onError("图片不能超过 25MB。");
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("图片读取失败，请重试。"));
        reader.readAsDataURL(file);
      });
      onDropImage({
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : "图片读取失败，请重试。");
    }
  }

  return (
    <button
      type="button"
      className={`custom-canvas-tile ${dragging ? "dragging" : ""}`}
      onClick={onClick}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        const galleryImage = getGalleryDraggedImage(event.dataTransfer);
        if (galleryImage) {
          onDropImage(galleryImage);
          return;
        }
        void handleDroppedFile(event.dataTransfer.files[0]);
      }}
      aria-label="打开自定义图片编辑"
    >
      <span><Plus className="h-7 w-7" /></span>
      <strong>空画布</strong>
      <small>上传图片并继续编辑</small>
    </button>
  );
}
