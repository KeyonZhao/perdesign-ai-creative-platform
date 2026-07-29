"use client";

/* eslint-disable @next/next/no-img-element */

import { Clapperboard, Download, LoaderCircle, RotateCcw, X } from "lucide-react";
import type { GenerationResult } from "@/lib/types";

export function VideoPreviewModal({
  result,
  onClose
}: {
  result: GenerationResult | null;
  onClose: () => void;
}) {
  if (!result) return null;

  const isReady = result.videoStatus === "succeeded" && Boolean(result.videoUrl);
  const isFailed = result.videoStatus === "failed" || result.videoStatus === "cancelled";

  return (
    <div className="image-preview-backdrop video-preview-backdrop" onClick={onClose}>
      <div className="video-preview-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="image-preview-toolbar">
          <div className="video-preview-heading">
            <Clapperboard className="h-4 w-4" />
            <span>{isReady ? "产品视频" : isFailed ? "视频生成失败" : "视频生成中"}</span>
          </div>
          <div className="video-preview-actions">
            {isReady ? (
              <a
                className="btn-secondary image-preview-action"
                href={result.videoUrl}
                target="_blank"
                rel="noreferrer"
                download={`${result.title || "perdesign-video"}.mp4`}
                title="下载视频"
              >
                <Download className="h-4 w-4" />
                <span>下载视频</span>
              </a>
            ) : null}
            <button className="btn-secondary image-preview-close" onClick={onClose} title="关闭">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="video-preview-stage">
          {isReady ? (
            <video
              src={result.videoUrl}
              poster={result.imageBase64}
              controls
              autoPlay
              playsInline
              preload="metadata"
            />
          ) : (
            <>
              {result.imageBase64 ? <img src={result.imageBase64} alt="" aria-hidden="true" /> : null}
              <div className={`video-preview-state ${isFailed ? "failed" : ""}`}>
                {isFailed ? <RotateCcw className="h-7 w-7" /> : <LoaderCircle className="h-7 w-7 animate-spin" />}
                <strong>{isFailed ? "视频生成未完成" : "正在生成产品视频"}</strong>
                <span>{result.error || "视频完成后会自动更新到画廊，请稍候。"}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
