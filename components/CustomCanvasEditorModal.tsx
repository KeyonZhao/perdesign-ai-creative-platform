"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Mountain, Paintbrush, Plus, Rotate3D, RotateCcw, Sparkles, UploadCloud, Wand2, X } from "lucide-react";
import { downloadDataUrl, getGalleryDraggedImage } from "@/lib/image";
import type { CustomCanvasGenerationRequest, GenerationStatus, UploadedImage } from "@/lib/types";
import { ImageSizeSelect } from "./ControlPanel";
import { ImageUploader } from "./ImageUploader";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

type CustomCanvasEditorModalProps = {
  initialSourceImage?: UploadedImage | null;
  status: GenerationStatus;
  hasChatConfig: boolean;
  onClose: () => void;
  onGenerate: (request: CustomCanvasGenerationRequest) => boolean;
  onOptimize: (request: CustomCanvasGenerationRequest) => Promise<string>;
  onOpenLocalEdit: (request: CustomCanvasGenerationRequest) => void;
  onGenerateMultiView: (request: CustomCanvasGenerationRequest) => void;
  onGenerateScene: (request: CustomCanvasGenerationRequest) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export function CustomCanvasEditorModal({
  initialSourceImage = null,
  status,
  hasChatConfig,
  onClose,
  onGenerate,
  onOptimize,
  onOpenLocalEdit,
  onGenerateMultiView,
  onGenerateScene,
  onError,
  onSuccess
}: CustomCanvasEditorModalProps) {
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const stageShellRef = useRef<HTMLDivElement | null>(null);
  const [sourceImage, setSourceImage] = useState<UploadedImage | null>(initialSourceImage);
  const [sourceDimensions, setSourceDimensions] = useState<{ width: number; height: number } | null>(null);
  const [fittedStageSize, setFittedStageSize] = useState<{ width: number; height: number } | null>(null);
  const [referenceImage, setReferenceImage] = useState<UploadedImage | null>(null);
  const [productName, setProductName] = useState("");
  const [innovationLevel, setInnovationLevel] = useState(50);
  const [requirement, setRequirement] = useState("");
  const [count, setCount] = useState(1);
  const [size, setSize] = useState("1024x1024");
  const [dragging, setDragging] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [promptBeforeOptimization, setPromptBeforeOptimization] = useState<string | null>(null);
  const [awaitingAuthorization, setAwaitingAuthorization] = useState(false);
  const busy = status === "generating" || isOptimizing;

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (awaitingAuthorization && status === "generating") onClose();
  }, [awaitingAuthorization, onClose, status]);

  useEffect(() => {
    const shell = stageShellRef.current;
    if (!shell || !sourceDimensions) {
      setFittedStageSize(null);
      return;
    }
    const dimensions = sourceDimensions;
    const activeShell = shell;

    function updateFittedSize() {
      const rect = activeShell.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const scale = Math.min(rect.width / dimensions.width, rect.height / dimensions.height);
      setFittedStageSize({
        width: Math.max(1, Math.round(dimensions.width * scale)),
        height: Math.max(1, Math.round(dimensions.height * scale))
      });
    }

    updateFittedSize();
    const observer = new ResizeObserver(updateFittedSize);
    observer.observe(activeShell);
    return () => observer.disconnect();
  }, [sourceDimensions]);

  async function readImage(file?: File) {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      onError("请上传 PNG、JPG、JPEG 或 WebP 图片。");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      onError("图片不能超过 10MB。");
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("图片读取失败，请重试。"));
        reader.readAsDataURL(file);
      });
      setSourceImage({ name: file.name, size: file.size, type: file.type, dataUrl });
    } catch (error) {
      onError(error instanceof Error ? error.message : "图片读取失败，请重试。");
    }
  }

  function buildRequest(): CustomCanvasGenerationRequest | null {
    if (!sourceImage) {
      onError("请先上传需要编辑的图片。");
      return null;
    }
    return {
      productName: productName.trim(),
      sourceImage,
      referenceImage,
      innovationLevel,
      requirement: requirement.trim(),
      count,
      size
    };
  }

  function getCurrentRequest() {
    if (!sourceImage) return null;
    return {
      productName: productName.trim(),
      sourceImage,
      referenceImage,
      innovationLevel,
      requirement: requirement.trim(),
      count,
      size
    };
  }

  async function optimizePrompt() {
    const request = buildRequest();
    if (!request || isOptimizing) return;
    setIsOptimizing(true);
    try {
      const optimizedPrompt = await onOptimize(request);
      setPromptBeforeOptimization(requirement);
      setRequirement(optimizedPrompt);
      onSuccess("提示词已撰写并回填。");
    } catch (error) {
      onError(error instanceof Error ? error.message : "提示词撰写失败，请稍后重试。");
    } finally {
      setIsOptimizing(false);
    }
  }

  function startGeneration() {
    const request = buildRequest();
    if (!request || busy) return;
    const started = onGenerate(request);
    if (started) {
      onClose();
      return;
    }
    setAwaitingAuthorization(true);
  }

  return (
    <div className="image-preview-backdrop custom-canvas-backdrop" onClick={onClose}>
      <div className="image-preview-dialog custom-canvas-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="image-preview-toolbar custom-canvas-toolbar">
          <div className="image-preview-toolbar-actions">
            <button
              className="btn-secondary image-preview-action disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                const request = getCurrentRequest();
                if (!request) return;
                onOpenLocalEdit(request);
              }}
              disabled={!sourceImage || busy}
              title="局部修改"
            >
              <Paintbrush className="h-4 w-4" />
              <span>局部修改</span>
            </button>
            <button
              className="btn-secondary image-preview-action disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                const request = getCurrentRequest();
                if (!request) return;
                onGenerateMultiView(request);
              }}
              disabled={!sourceImage || busy}
              title="生成多视图"
            >
              <Rotate3D className="h-4 w-4" />
              <span>生成多视图</span>
            </button>
            <button
              className="btn-secondary image-preview-action disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                const request = getCurrentRequest();
                if (!request) return;
                onGenerateScene(request);
              }}
              disabled={!sourceImage || busy}
              title="生成场景图"
            >
              <Mountain className="h-4 w-4" />
              <span>生成场景图</span>
            </button>
            <button
              className="btn-secondary image-preview-action disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => {
                if (!sourceImage) return;
                const filename = `${productName.trim() || sourceImage.name.replace(/\.[^.]+$/, "") || "perdesign-image"}.png`;
                downloadDataUrl(sourceImage.dataUrl, filename);
              }}
              disabled={!sourceImage}
              title="下载"
            >
              <Download className="h-4 w-4" />
              <span>下载</span>
            </button>
          </div>
          <button type="button" className="btn-secondary image-preview-close" onClick={onClose} title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="image-preview-main custom-canvas-main">
          <div ref={stageShellRef} className="custom-canvas-stage-shell">
            <div
              className={`custom-canvas-stage ${dragging ? "dragging" : ""} ${sourceImage ? "has-image" : ""}`}
              style={sourceImage && fittedStageSize ? { width: fittedStageSize.width, height: fittedStageSize.height } : undefined}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const galleryImage = getGalleryDraggedImage(event.dataTransfer);
              if (galleryImage) {
                setSourceImage(galleryImage);
                return;
              }
              void readImage(event.dataTransfer.files[0]);
            }}
          >
            {sourceImage ? (
              <>
                <img
                  src={sourceImage.dataUrl}
                  alt="待编辑图片"
                  onLoad={(event) => {
                    setSourceDimensions({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight
                    });
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary custom-canvas-replace"
                  onClick={() => sourceInputRef.current?.click()}
                  disabled={busy}
                >
                  <UploadCloud className="h-4 w-4" />
                  更换图片
                </button>
              </>
            ) : (
              <button
                type="button"
                className="custom-canvas-upload"
                onClick={() => sourceInputRef.current?.click()}
                disabled={busy}
              >
                <span><Plus className="h-8 w-8" /></span>
                <strong>上传需要编辑的图片</strong>
                <small>点击或拖入 PNG、JPG、WebP 图片</small>
              </button>
            )}
            </div>
          </div>

          <aside className="custom-canvas-settings" aria-label="图片重构设置">
            <div className="custom-canvas-settings-scroll">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">
                  产品名称
                </span>
                <input
                  className="field h-11 px-3 text-sm"
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  placeholder="选填，例如：智能骑行头盔"
                  maxLength={100}
                  disabled={busy}
                />
              </label>

              <ImageUploader
                value={referenceImage}
                onChange={setReferenceImage}
                onError={onError}
                title="参考图"
                emptyTitle="拖入参考图，提取风格语言"
                helperText="选填。仅参考材质、配色、细节和设计语言"
                imageAlt="上传的参考图"
              />

              <div className="liquid-card space-y-3 rounded-[18px] p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <span className="text-sm font-medium text-slate-200">创新度</span>
                    <p className="mt-1 text-xs text-slate-500">控制产品结构的延续与重构幅度</p>
                  </div>
                  <span className="shrink-0 text-sm text-white">{innovationLevel}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={innovationLevel}
                  onChange={(event) => setInnovationLevel(Number(event.target.value))}
                  disabled={busy}
                  className="w-full accent-violet-400 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="创新度"
                />
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>结构延续</span>
                  <span>自由创新</span>
                </div>
              </div>

              <label className="block space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-200">文字描述</span>
                  <div className="flex items-center gap-2">
                    {promptBeforeOptimization !== null ? (
                      <button
                        type="button"
                        className="btn-secondary flex h-8 w-8 items-center justify-center rounded-md"
                        onClick={() => {
                          setRequirement(promptBeforeOptimization);
                          setPromptBeforeOptimization(null);
                        }}
                        disabled={busy}
                        title="恢复撰写前内容"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary flex h-8 items-center gap-2 rounded-md px-2.5 text-xs disabled:opacity-40"
                      onClick={() => void optimizePrompt()}
                      disabled={!hasChatConfig || !sourceImage || busy}
                    >
                      {isOptimizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                      AI撰写提示词
                    </button>
                  </div>
                </div>
                <textarea
                  className="field min-h-28 resize-y px-3 py-3 text-sm leading-6"
                  value={requirement}
                  onChange={(event) => setRequirement(event.target.value)}
                  placeholder="描述希望保留、调整或重新设计的内容"
                  disabled={busy}
                />
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200">生成数量</span>
                  <span className="text-sm text-white">{count}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                  disabled={busy}
                  className="w-full accent-violet-400 disabled:cursor-not-allowed disabled:opacity-45"
                />
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-200">图片比例</span>
                <ImageSizeSelect value={size} onChange={setSize} disabled={busy} />
              </div>
            </div>

            <div className="custom-canvas-submit-wrap">
              <button
                type="button"
                className="btn-primary flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-sm font-semibold"
                onClick={startGeneration}
                disabled={!sourceImage || busy}
              >
                {status === "generating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {status === "generating" ? "正在重构..." : "开始智能重构"}
              </button>
            </div>
          </aside>
        </div>

        <input
          ref={sourceInputRef}
          className="hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            void readImage(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
