"use client";

/* eslint-disable @next/next/no-img-element */

import { AlertTriangle, Download, Maximize2 } from "lucide-react";
import type { GenerationResult } from "@/lib/types";
import { downloadDataUrl } from "@/lib/image";

type ResultCardProps = {
  result: GenerationResult;
  index: number;
  onPreview: (result: GenerationResult) => void;
};

export function ResultCard({ result, index, onPreview }: ResultCardProps) {
  return (
    <article className="content-card overflow-hidden">
      {result.imageBase64 ? (
        <div className="group relative bg-black/20">
          <button type="button" className="block w-full cursor-zoom-in" onClick={() => onPreview(result)} title="查看大图">
            <img src={result.imageBase64} alt={result.title} className="aspect-square w-full object-cover" />
          </button>
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition group-hover:bg-black/38 group-hover:opacity-100">
            <button
              className="btn-secondary flex h-10 w-10 items-center justify-center rounded-[12px]"
              onClick={() => downloadDataUrl(result.imageBase64!, `concept-${String(index + 1).padStart(2, "0")}.png`)}
              title="下载图片"
            >
              <Download className="h-4 w-4" />
            </button>
            <button className="btn-secondary flex h-10 w-10 items-center justify-center rounded-[12px]" onClick={() => onPreview(result)} title="查看大图">
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex aspect-square flex-col items-center justify-center gap-3 bg-red-950/15 p-5 text-center">
          <AlertTriangle className="h-8 w-8 text-red-200" />
          <p className="text-sm leading-6 text-red-100">{result.error || "当前方案生成失败。"}</p>
        </div>
      )}
    </article>
  );
}
