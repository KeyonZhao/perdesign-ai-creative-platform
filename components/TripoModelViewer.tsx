"use client";

import { Download, LoaderCircle, Rotate3D, X } from "lucide-react";
import { createElement, useEffect, useState } from "react";

type TripoModelViewerProps = {
  open: boolean;
  phase: "uploading" | "generating" | "success" | "error";
  progress: number;
  modelUrl?: string;
  modelBlob?: Blob;
  modelTaskId?: string;
  error?: string;
  filename: string;
  onClose: () => void;
  onRetry?: () => void;
};

export function TripoModelViewer({
  open,
  phase,
  progress,
  modelUrl,
  modelBlob,
  modelTaskId,
  error,
  filename,
  onClose,
  onRetry
}: TripoModelViewerProps) {
  const [localModelUrl, setLocalModelUrl] = useState("");
  const [convertingFormat, setConvertingFormat] = useState<"OBJ" | "STL" | null>(null);
  const [conversionError, setConversionError] = useState("");

  useEffect(() => {
    if (!modelBlob) {
      setLocalModelUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(modelBlob);
    setLocalModelUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [modelBlob]);

  if (!open) return null;

  const resolvedModelUrl = localModelUrl || modelUrl;
  const isWorking = phase === "uploading" || phase === "generating";
  const progressLabel = phase === "uploading" ? "正在上传产品图" : `正在构建 3D 模型 ${progress}%`;

  async function readPayload(response: Response) {
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      throw new Error(`3D 格式转换返回了无法识别的内容（HTTP ${response.status}）。`);
    }
    if (!response.ok) {
      throw new Error(typeof payload.error === "string" ? payload.error : `3D 格式转换失败（HTTP ${response.status}）。`);
    }
    return payload;
  }

  async function downloadConvertedModel(format: "OBJ" | "STL") {
    if (!modelTaskId || convertingFormat) return;
    setConvertingFormat(format);
    setConversionError("");

    try {
      const response = await fetch("/api/tripo/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: modelTaskId, format })
      });
      const payload = await readPayload(response);
      const conversionTaskId = typeof payload.taskId === "string" ? payload.taskId : "";
      if (!conversionTaskId) throw new Error("格式转换服务没有返回任务编号。");

      for (let attempt = 0; attempt < 120; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const statusResponse = await fetch(`/api/tripo/status?taskId=${encodeURIComponent(conversionTaskId)}`, {
          cache: "no-store"
        });
        const statusPayload = await readPayload(statusResponse);
        const status = typeof statusPayload.status === "string" ? statusPayload.status : "";

        if (status === "success") {
          const remoteUrl = typeof statusPayload.modelUrl === "string" ? statusPayload.modelUrl : "";
          if (!remoteUrl) throw new Error("格式转换完成，但没有返回模型文件。");
          const extension = format.toLowerCase();
          const safeFilename = `${filename.replace(/[^A-Za-z0-9._-]+/g, "-") || "perdesign-model"}.${extension}`;
          const anchor = document.createElement("a");
          anchor.href = `/api/tripo/model?url=${encodeURIComponent(remoteUrl)}&filename=${encodeURIComponent(safeFilename)}`;
          anchor.download = safeFilename;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          return;
        }
        if (["failed", "cancelled", "banned"].includes(status)) {
          throw new Error(
            typeof statusPayload.error === "string" && statusPayload.error
              ? statusPayload.error
              : `${format} 格式转换失败。`
          );
        }
      }
      throw new Error(`${format} 格式转换等待超时，请重试。`);
    } catch (conversionFailure) {
      setConversionError(conversionFailure instanceof Error ? conversionFailure.message : `${format} 格式转换失败。`);
    } finally {
      setConvertingFormat(null);
    }
  }

  return (
    <div className="tripo-viewer-backdrop" onClick={onClose}>
      <section className="tripo-viewer-dialog" onClick={(event) => event.stopPropagation()} aria-label="3D 模型预览">
        <header className="tripo-viewer-header">
          <div>
            <Rotate3D className="h-4 w-4" />
            <span>3D 模型</span>
          </div>
          <div className="tripo-viewer-header-actions">
            {phase === "success" && resolvedModelUrl ? (
              <div className="tripo-viewer-format-actions">
                {(["OBJ", "STL"] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    className="btn-secondary tripo-viewer-download"
                    onClick={() => void downloadConvertedModel(format)}
                    disabled={!modelTaskId || Boolean(convertingFormat)}
                    title={modelTaskId ? `下载 ${format}` : "当前历史模型缺少转换任务编号"}
                  >
                    {convertingFormat === format
                      ? <LoaderCircle className="h-4 w-4 animate-spin" />
                      : <Download className="h-4 w-4" />}
                    <span>{convertingFormat === format ? "转换中" : format}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <button type="button" className="btn-secondary tripo-viewer-close" onClick={onClose} title="关闭">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="tripo-viewer-stage">
          {phase === "success" && resolvedModelUrl ? (
            createElement("model-viewer", {
              src: resolvedModelUrl,
              alt: `${filename} 3D模型`,
              class: "tripo-model-viewer",
              "camera-controls": true,
              "auto-rotate": true,
              "auto-rotate-delay": "800",
              "rotation-per-second": "20deg",
              "shadow-intensity": "1",
              "shadow-softness": "0.8",
              exposure: "1",
              "environment-image": "neutral",
              "interaction-prompt": "none"
            })
          ) : null}

          {isWorking ? (
            <div className="tripo-viewer-status">
              <span className="tripo-viewer-loader">
                <LoaderCircle className="h-6 w-6 animate-spin" />
              </span>
              <strong>{progressLabel}</strong>
              <p>模型生成通常需要几十秒，请保持此页面打开。</p>
              <div className="tripo-viewer-progress" aria-label={progressLabel}>
                <span style={{ width: `${phase === "uploading" ? 6 : Math.max(8, progress)}%` }} />
              </div>
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="tripo-viewer-status error">
              <Rotate3D className="h-7 w-7" />
              <strong>3D 模型生成失败</strong>
              <p>{error || "请稍后重试。"}</p>
              {onRetry ? <button type="button" className="btn-secondary" onClick={onRetry}>重新生成</button> : null}
            </div>
          ) : null}
        </div>

        {phase === "success" ? (
          <footer className={`tripo-viewer-footer ${conversionError ? "error" : ""}`}>
            {conversionError || "拖动旋转 · 滚轮缩放 · 双击复位视角"}
          </footer>
        ) : null}
      </section>
    </div>
  );
}
