"use client";

import { HardDrive, Images, Package, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LocalGalleryStats } from "@/lib/local-gallery";
import type { GenerationBatch, GenerationMetadata, GenerationResult, GenerationStatus } from "@/lib/types";
import { downloadResultsZip } from "@/lib/zip";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { LocalHistoryModal } from "./LocalHistoryModal";
import { ResultCard } from "./ResultCard";

type GalleryProps = {
  isGeneratingVariant?: boolean;
  status: GenerationStatus;
  batches: GenerationBatch[];
  activeBatchId: string | null;
  count: number;
  onGenerateMultiView: (result: GenerationResult) => void;
  onGenerateScene: (result: GenerationResult) => void;
  onGenerateDesignDescription: (result: GenerationResult) => Promise<string>;
  designDescriptionLoadingIds: string[];
  onLocalEdit: (result: GenerationResult, maskImageBase64: string, instruction: string) => void;
  onOpenSettings: () => void;
  historyStats: LocalGalleryStats | null;
  isHistoryReady: boolean;
  onRefreshHistoryStats: () => Promise<void>;
  onExportProject: () => Promise<void>;
  onImportProject: (file: File) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export function Gallery({
  status,
  batches,
  activeBatchId,
  count,
  onError,
  onSuccess,
  onGenerateMultiView,
  onGenerateScene,
  onGenerateDesignDescription,
  designDescriptionLoadingIds,
  onLocalEdit,
  onOpenSettings,
  historyStats,
  isHistoryReady,
  onRefreshHistoryStats,
  onExportProject,
  onImportProject,
  onClearHistory,
  isGeneratingVariant = false
}: GalleryProps) {
  const [preview, setPreview] = useState<GenerationResult | null>(null);
  const [previewMetadata, setPreviewMetadata] = useState<GenerationMetadata | null>(null);
  const [previewStartsEditing, setPreviewStartsEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const activeBatchRef = useRef<HTMLDivElement | null>(null);
  const pendingBatchRef = useRef<HTMLDivElement | null>(null);
  const allResults = useMemo(() => batches.flatMap((batch) => batch.results), [batches]);

  useEffect(() => {
    if (!preview) return;
    const updatedPreview = allResults.find((result) => result.id === preview.id);
    if (updatedPreview && updatedPreview !== preview) setPreview(updatedPreview);
  }, [allResults, preview]);

  async function handleZip() {
    try {
      await downloadResultsZip(allResults);
      onSuccess("ZIP 已开始打包下载。");
    } catch {
      onError("ZIP 打包失败，请稍后重试。");
    }
  }

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    const target = status === "generating" ? pendingBatchRef.current : activeBatchRef.current;
    if (!scrollArea || !target) return;

    const targetTop = target.offsetTop - 20;
    scrollArea.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth"
    });
  }, [activeBatchId, status]);

  const hasResults = batches.length > 0;

  return (
    <section className="content-panel flex min-h-0 flex-1 flex-col">
      <div className="gallery-header">
        <div>
          <h2 className="gallery-title">方案画廊</h2>
          <p className="gallery-subtitle">产品变款、参考风格与批量导出</p>
        </div>
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
                  <div key={result.id} ref={isActiveBatch && index === 0 ? activeBatchRef : null} className="gallery-batch">
                      <ResultCard
                        result={result}
                        index={startIndex + index}
                        onPreview={(selectedResult) => {
                          setPreviewStartsEditing(false);
                          setPreviewMetadata(batch.metadata || null);
                          setPreview(selectedResult);
                        }}
                        onEdit={(selectedResult) => {
                          setPreviewStartsEditing(true);
                          setPreviewMetadata(batch.metadata || null);
                          setPreview(selectedResult);
                        }}
                        onGenerateMultiView={onGenerateMultiView}
                        onGenerateScene={onGenerateScene}
                        isGeneratingVariant={isGeneratingVariant}
                      />
                  </div>
                ));
              })}
              {status === "generating"
                ? Array.from({ length: count }).map((_, index) => (
                    <div key={`pending-${index}`} ref={index === 0 ? pendingBatchRef : null} className="content-card gallery-batch overflow-hidden">
                      <div className="skeleton aspect-square w-full" />
                    </div>
                  ))
                : null}
                  </div>
          </div>
        ) : (
          <div className="gallery-empty-state">
            <div className="text-center">
              <div className="content-card mx-auto flex h-16 w-16 items-center justify-center">
                {isHistoryReady ? <Images className="h-7 w-7 text-violet-100" /> : <HardDrive className="h-7 w-7 animate-pulse text-violet-100" />}
              </div>
              <h2 className="mt-5 text-xl font-semibold text-white">{isHistoryReady ? "等待生成创意方案" : "正在恢复本地作品"}</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-400">
                {isHistoryReady ? "输入提示词即可生成，也可以额外上传产品图或参考图，提升方案控制感。" : "历史图片保存在当前设备，恢复完成后会自动出现在画廊中。"}
              </p>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>

      <ImagePreviewModal
        result={preview}
        metadata={previewMetadata}
        startEditing={previewStartsEditing}
        onClose={() => {
          setPreview(null);
          setPreviewMetadata(null);
          setPreviewStartsEditing(false);
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
        onGenerateDesignDescription={onGenerateDesignDescription}
        isGeneratingDesignDescription={Boolean(preview && designDescriptionLoadingIds.includes(preview.id))}
        onLocalEdit={(result, maskImageBase64, instruction) => {
          onLocalEdit(result, maskImageBase64, instruction);
          setPreview(null);
          setPreviewMetadata(null);
          setPreviewStartsEditing(false);
        }}
        isGeneratingVariant={isGeneratingVariant}
      />
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
    </section>
  );
}
