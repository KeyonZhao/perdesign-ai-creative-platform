"use client";

/* eslint-disable @next/next/no-img-element */

import { AlertTriangle, Box, Clapperboard, Download, LoaderCircle, Maximize2, Mountain, Paintbrush, Play, Rotate3D } from "lucide-react";
import { useRef } from "react";
import type { GenerationResult } from "@/lib/types";
import { downloadDataUrl, prepareImageFileDrag, releaseImageFileDrag } from "@/lib/image";

type ResultCardProps = {
  result: GenerationResult;
  index: number;
  onPreview: (result: GenerationResult) => void;
  onPreviewModel: (result: GenerationResult) => void;
  onPreviewVideo: (result: GenerationResult) => void;
  onEdit: (result: GenerationResult) => void;
  onGenerateMultiView: (result: GenerationResult) => void;
  onGenerateScene: (result: GenerationResult) => void;
  isGeneratingVariant?: boolean;
};

export function ResultCard({
  result,
  index,
  onPreview,
  onPreviewModel,
  onPreviewVideo,
  onEdit,
  onGenerateMultiView,
  onGenerateScene,
  isGeneratingVariant = false
}: ResultCardProps) {
  const dragObjectUrlRef = useRef<string | null>(null);
  const filename = `concept-${String(index + 1).padStart(2, "0")}.png`;
  const isModel = result.assetType === "model3d" && Boolean(result.modelBlob);
  const isVideo = result.assetType === "video";

  return (
    <article className="content-card overflow-hidden">
      {isVideo ? (
        <button
          type="button"
          className="model-result-card video-result-card"
          onClick={() => onPreviewVideo(result)}
          aria-label={result.videoStatus === "succeeded" ? "播放视频" : "查看视频任务"}
          title={result.videoStatus === "succeeded" ? "播放视频" : "查看视频任务"}
        >
          {result.imageBase64 ? (
            <img src={result.imageBase64} alt="" className="model-result-thumbnail" aria-hidden="true" />
          ) : null}
          <span className="model-result-shade" />
          <span className="model-result-mark">
            {result.videoStatus === "succeeded"
              ? <Play className="h-7 w-7 fill-current" />
              : result.videoStatus === "failed" || result.videoStatus === "cancelled"
                ? <AlertTriangle className="h-7 w-7" />
                : <LoaderCircle className="h-7 w-7 animate-spin" />}
            <strong>
              {result.videoStatus === "succeeded"
                ? "播放"
                : result.videoStatus === "failed" || result.videoStatus === "cancelled"
                  ? "失败"
                  : "生成中"}
            </strong>
          </span>
          <span className="model-result-type">
            <Clapperboard className="h-3.5 w-3.5" />
            产品视频
          </span>
        </button>
      ) : isModel ? (
        <button
          type="button"
          className="model-result-card"
          onClick={() => onPreviewModel(result)}
          aria-label="打开3D模型"
          title="打开3D模型"
        >
          {result.imageBase64 ? (
            <img src={result.imageBase64} alt="" className="model-result-thumbnail" aria-hidden="true" />
          ) : null}
          <span className="model-result-shade" />
          <span className="model-result-mark">
            <Box className="h-7 w-7" />
            <strong>3D</strong>
          </span>
          <span className="model-result-type">无贴图模型</span>
        </button>
      ) : result.imageBase64 ? (
        <div className="group relative bg-black/20">
          <button type="button" className="block w-full cursor-grab active:cursor-grabbing" onClick={() => onPreview(result)}>
            <img
              src={result.imageBase64}
              alt={result.title}
              className="aspect-square w-full object-cover"
              draggable
              onDragStart={(event) => {
                dragObjectUrlRef.current = prepareImageFileDrag(event.dataTransfer, result.imageBase64!, filename);
              }}
              onDragEnd={() => {
                releaseImageFileDrag(dragObjectUrlRef.current);
                dragObjectUrlRef.current = null;
              }}
            />
          </button>
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center gap-2 bg-black/0 pb-4 opacity-0 transition group-hover:bg-black/28 group-hover:opacity-100">
            <button
              className="btn-secondary result-card-action pointer-events-auto flex h-10 w-10 items-center justify-center rounded-[12px] disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => onEdit(result)}
              disabled={isGeneratingVariant}
              aria-label="局部修改"
              title="局部修改"
            >
              <Paintbrush className="h-4 w-4" />
            </button>
            <button
              className="btn-secondary result-card-action pointer-events-auto flex h-10 w-10 items-center justify-center rounded-[12px] disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => onGenerateScene(result)}
              disabled={isGeneratingVariant}
              aria-label="生成场景图"
              title="生成场景图"
            >
              <Mountain className="h-4 w-4" />
            </button>
            <button
              className="btn-secondary result-card-action pointer-events-auto flex h-10 w-10 items-center justify-center rounded-[12px] disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => onGenerateMultiView(result)}
              disabled={isGeneratingVariant}
              aria-label="生成多视图"
              title="生成多视图"
            >
              <Rotate3D className="h-4 w-4" />
            </button>
            <button
              className="btn-secondary result-card-action pointer-events-auto flex h-10 w-10 items-center justify-center rounded-[12px]"
              onClick={() => downloadDataUrl(result.imageBase64!, filename)}
              aria-label="下载图片"
              title="下载图片"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              className="btn-secondary result-card-action pointer-events-auto flex h-10 w-10 items-center justify-center rounded-[12px]"
              onClick={() => onPreview(result)}
              aria-label="查看大图"
              title="查看大图"
            >
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
