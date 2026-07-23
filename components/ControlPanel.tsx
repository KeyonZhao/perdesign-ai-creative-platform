"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { sizeOptions } from "@/lib/models";
import type { GenerationStatus, ProductInputMode, UploadedImage } from "@/lib/types";
import { ImageUploader } from "./ImageUploader";

function getSizePreviewClass(value: string) {
  if (value === "1536x1024") return "landscape";
  if (value === "1024x1536") return "portrait";
  if (value === "auto") return "auto";
  return "square";
}

export function ImageSizeSelect({
  value,
  onChange,
  disabled
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = sizeOptions.find((option) => option.value === value) || sizeOptions[0];

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className={`image-size-select ${isOpen ? "open" : ""}`}>
      <button
        type="button"
        className="image-size-trigger"
        onClick={() => setIsOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`image-size-preview ${getSizePreviewClass(selectedOption.value)}`} aria-hidden="true">
          <span />
        </span>
        <span className="image-size-trigger-label">{selectedOption.label}</span>
        <ChevronDown className="image-size-chevron h-4 w-4" />
      </button>

      {isOpen ? (
        <div className="image-size-menu" role="listbox" aria-label="图片比例">
          {sizeOptions.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={`image-size-option ${selected ? "selected" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span className={`image-size-preview ${getSizePreviewClass(option.value)}`} aria-hidden="true">
                  <span />
                </span>
                <span>{option.label}</span>
                {selected ? <Check className="ml-auto h-4 w-4" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

type ControlPanelProps = {
  productName: string;
  setProductName: (value: string) => void;
  productInputMode: ProductInputMode;
  setProductInputMode: (mode: ProductInputMode) => void;
  uploadedImage: UploadedImage | null;
  setUploadedImage: (image: UploadedImage | null) => void;
  referenceImage: UploadedImage | null;
  setReferenceImage: (image: UploadedImage | null) => void;
  innovationLevel: number;
  setInnovationLevel: (value: number) => void;
  requirement: string;
  setRequirement: (value: string) => void;
  count: number;
  setCount: (value: number) => void;
  size: string;
  setSize: (value: string) => void;
  status: GenerationStatus;
  hasChatConfig: boolean;
  canGenerate: boolean;
  onOptimize: () => void;
  onRestorePrompt: () => void;
  canRestorePrompt: boolean;
  onGenerate: () => void;
  onError: (message: string) => void;
};

export function ControlPanel(props: ControlPanelProps) {
  const busy = props.status === "generating" || props.status === "optimizing";
  const canGenerate = Boolean(props.canGenerate && props.productName.trim() && !busy);

  return (
    <div className="design-panel flex h-full min-h-0 flex-col">
      <div className="sidebar-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-200">
            产品名称 <span className="text-violet-300" aria-hidden="true">*</span>
          </span>
          <input
            className="field h-11 px-3 text-sm"
            value={props.productName}
            onChange={(event) => props.setProductName(event.target.value)}
            placeholder="例如：桌面蓝牙音响"
            maxLength={100}
            required
            disabled={busy}
          />
        </label>

        <ImageUploader
          value={props.uploadedImage}
          onChange={props.setUploadedImage}
          onError={props.onError}
          title="产品图"
          emptyTitle={props.productInputMode === "sketch" ? "上传设计草图，生成完整效果图" : "可上传产品原图，进行结构延展"}
          helperText={props.productInputMode === "sketch" ? "严格保留草图轮廓、比例、结构分区与核心设计特征" : "选填。上传后会优先走图生图；不上传时也可仅靠提示词生成"}
          imageAlt={props.productInputMode === "sketch" ? "上传的设计草图" : "上传的产品原图"}
          inputMode={props.productInputMode}
          onInputModeChange={props.setProductInputMode}
        />

        <ImageUploader
          value={props.referenceImage}
          onChange={props.setReferenceImage}
          onError={props.onError}
          title="参考图"
          emptyTitle="拖入参考图，提取风格语言"
          helperText="选填。仅参考材质、配色、细节和设计语言，不复制产品造型"
          imageAlt="上传的参考图"
        />

        <div className="liquid-card space-y-3 rounded-[18px] p-4">
          <div>
            <span className="text-sm font-medium text-slate-200">创新度</span>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <p className="text-xs text-slate-500">控制产品结构的延续与重构幅度</p>
              <span className="shrink-0 text-sm text-white">{props.innovationLevel}%</span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={props.innovationLevel}
            onChange={(event) => props.setInnovationLevel(Number(event.target.value))}
            disabled={busy}
            className="w-full accent-violet-400 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="创新度"
          />
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>结构延续</span>
            <span>自由创新</span>
          </div>
        </div>

        <label className="mt-7 block space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-200">文字描述</span>
            <div className="flex items-center gap-2">
              {props.canRestorePrompt ? (
                <button
                  type="button"
                  className="btn-secondary flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-40"
                  onClick={props.onRestorePrompt}
                  disabled={busy}
                  title="恢复优化前内容"
                  aria-label="恢复优化前内容"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <button
                type="button"
                className="btn-secondary flex h-8 items-center gap-2 rounded-md px-2.5 text-xs disabled:opacity-40"
                onClick={props.onOptimize}
                disabled={!props.hasChatConfig || !props.productName.trim() || busy}
              >
                {props.status === "optimizing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                AI撰写提示词
              </button>
            </div>
          </div>
          <textarea
            className="field min-h-32 resize-y px-3 py-3 text-sm leading-6"
            value={props.requirement}
            onChange={(event) => props.setRequirement(event.target.value)}
            placeholder="例如：不改变原有结构比例，优化外观细节，提升科技感和高级感，增加更强的品牌识别特征，KeyShot真实产品渲染质感。"
          />
          {!props.hasChatConfig ? <p className="text-xs leading-5 text-amber-200/80">当前未完成认证，暂时无法使用 AI 撰写提示词。</p> : null}
        </label>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">生成数量</span>
            <span className="text-sm text-white">{props.count}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={props.count}
            onChange={(event) => props.setCount(Number(event.target.value))}
            disabled={busy}
            className="w-full accent-violet-400 disabled:cursor-not-allowed disabled:opacity-45"
          />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium text-slate-200">图片比例</span>
          <ImageSizeSelect value={props.size} onChange={props.setSize} disabled={busy} />
        </div>
      </div>

      <div className="liquid-divider border-t p-6">
        <button
          type="button"
          className="btn-primary flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-sm font-semibold"
          disabled={!canGenerate}
          onClick={props.onGenerate}
        >
          {props.status === "generating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {props.status === "generating" ? "正在重构..." : "开始智能重构"}
        </button>
      </div>
    </div>
  );
}
