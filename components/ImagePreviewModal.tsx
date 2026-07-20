"use client";

/* eslint-disable @next/next/no-img-element */

import { Download, ImagePlus, Layers3, X } from "lucide-react";
import type { GenerationResult } from "@/lib/types";
import { downloadDataUrl } from "@/lib/image";

type ImagePreviewModalProps = {
  isGeneratingVariant?: boolean;
  onGenerateMultiView?: (result: GenerationResult) => void;
  onGenerateScene?: (result: GenerationResult) => void;
  result: GenerationResult | null;
  onClose: () => void;
};

export function ImagePreviewModal({
  result,
  onClose,
  onGenerateMultiView,
  onGenerateScene,
  isGeneratingVariant = false
}: ImagePreviewModalProps) {
  if (!result?.imageBase64) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="inline-block max-h-[92vh] w-auto max-w-[calc(100vw-2rem)]" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-end gap-2">
          <div className="flex gap-2">
            <button
              className="btn-secondary flex h-9 items-center gap-2 rounded-[12px] px-3 text-sm"
              onClick={() => downloadDataUrl(result.imageBase64!, `${result.title}.png`)}
            >
              <Download className="h-4 w-4" />
              下载
            </button>
            <button
              className="btn-secondary flex h-9 items-center gap-2 rounded-[12px] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => onGenerateMultiView?.(result)}
              disabled={isGeneratingVariant}
            >
              <Layers3 className="h-4 w-4" />
              {isGeneratingVariant ? "生成中" : "生成多视图"}
            </button>
            <button
              className="btn-secondary flex h-9 items-center gap-2 rounded-[12px] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => onGenerateScene?.(result)}
              disabled={isGeneratingVariant}
            >
              <ImagePlus className="h-4 w-4" />
              {isGeneratingVariant ? "生成中" : "生成场景图"}
            </button>
            <button className="btn-secondary flex h-9 w-9 items-center justify-center rounded-[12px]" onClick={onClose} title="关闭">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <img
          src={result.imageBase64}
          alt={result.title}
          className="block h-auto max-h-[82vh] w-auto max-w-[calc(100vw-2rem)] rounded-[20px] border border-white/10 object-contain"
        />
      </div>
    </div>
  );
}
