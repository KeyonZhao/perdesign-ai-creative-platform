"use client";

import { Images, Package } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GenerationBatch, GenerationResult, GenerationStatus } from "@/lib/types";
import { downloadResultsZip } from "@/lib/zip";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { LoadingGrid } from "./LoadingGrid";
import { ResultCard } from "./ResultCard";

type GalleryProps = {
  isGeneratingVariant?: boolean;
  status: GenerationStatus;
  batches: GenerationBatch[];
  activeBatchId: string | null;
  count: number;
  onGenerateMultiView: (result: GenerationResult) => void;
  onGenerateScene: (result: GenerationResult) => void;
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
  isGeneratingVariant = false
}: GalleryProps) {
  const [preview, setPreview] = useState<GenerationResult | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const activeBatchRef = useRef<HTMLDivElement | null>(null);
  const pendingBatchRef = useRef<HTMLDivElement | null>(null);
  const allResults = useMemo(() => batches.flatMap((batch) => batch.results), [batches]);

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
      <div className="flex items-center justify-between px-11 pb-7 pt-10">
        <div>
          <h2 className="text-3xl font-semibold tracking-normal text-white">方案画廊</h2>
          <p className="mt-3 text-sm text-zinc-500">产品变款、参考风格与批量导出</p>
        </div>
        {hasResults ? (
          <button className="btn-secondary flex h-10 items-center gap-2 rounded-[14px] px-4 text-sm" onClick={handleZip}>
            <Package className="h-4 w-4" />
            一键打包 ZIP
          </button>
        ) : null}
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
          <div className="px-11 pb-10">
        {hasResults ? (
          <div className="space-y-7">
            {batches.map((batch, batchIndex) => {
              const isActiveBatch = activeBatchId === batch.id;
              const startIndex = batches.slice(0, batchIndex).reduce((sum, item) => sum + item.results.length, 0);

              return (
                <section
                  key={batch.id}
                  ref={isActiveBatch ? activeBatchRef : null}
                  className={`gallery-batch ${batchIndex < batches.length - 1 ? "gallery-batch-history" : ""}`}
                >
                  <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {batch.results.map((result, index) => (
                      <ResultCard key={result.id} result={result} index={startIndex + index} onPreview={setPreview} />
                    ))}
                  </div>
                </section>
              );
            })}
            {status === "generating" ? (
              <section ref={pendingBatchRef} className="gallery-batch gallery-batch-pending">
                <div className="content-card p-4 text-sm text-zinc-300">AI 正在生成新方案，历史图片已上移保留，新的结果会在这一组继续出现。</div>
                <div className="mt-5">
                  <LoadingGrid count={count} />
                </div>
              </section>
            ) : null}
          </div>
        ) : status === "generating" ? (
          <div ref={pendingBatchRef} className="space-y-5">
            <div className="content-card p-4 text-sm text-zinc-300">AI 正在整理提示词、参考风格与产品语言，并生成方案...</div>
            <LoadingGrid count={count} />
          </div>
        ) : (
          <div className="flex h-full min-h-[520px] items-center justify-center">
            <div className="text-center">
              <div className="content-card mx-auto flex h-16 w-16 items-center justify-center">
                <Images className="h-7 w-7 text-violet-100" />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-white">等待生成创意方案</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-400">
                输入提示词即可生成，也可以额外上传产品图或参考图，提升方案控制感。
              </p>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>

      <ImagePreviewModal
        result={preview}
        onClose={() => setPreview(null)}
        onGenerateMultiView={(result) => {
          onGenerateMultiView(result);
          setPreview(null);
        }}
        onGenerateScene={(result) => {
          onGenerateScene(result);
          setPreview(null);
        }}
        isGeneratingVariant={isGeneratingVariant}
      />
    </section>
  );
}
