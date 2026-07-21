"use client";

/* eslint-disable @next/next/no-img-element */

import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { qualityOptions, sizeOptions } from "@/lib/models";
import type { GenerationStatus, UploadedImage } from "@/lib/types";
import { ImageUploader } from "./ImageUploader";

type ControlPanelProps = {
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
  quality: string;
  setQuality: (value: string) => void;
  status: GenerationStatus;
  hasChatConfig: boolean;
  canGenerate: boolean;
  onOptimize: () => void;
  onGenerate: () => void;
  onError: (message: string) => void;
};

export function ControlPanel(props: ControlPanelProps) {
  const busy = props.status === "generating" || props.status === "optimizing";
  const canGenerate = Boolean(props.canGenerate && (props.uploadedImage || props.referenceImage || props.requirement.trim()) && !busy);

  return (
    <div className="design-panel flex h-full min-h-0 flex-col">
      <div className="sidebar-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <ImageUploader
          value={props.uploadedImage}
          onChange={props.setUploadedImage}
          onError={props.onError}
          title="产品图"
          emptyTitle="可上传产品图，进行结构延展"
          helperText="选填。上传后会优先走图生图；不上传时也可仅靠提示词生成"
          imageAlt="上传的产品图"
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
            <button
              type="button"
              className="btn-secondary flex h-8 items-center gap-2 rounded-md px-2.5 text-xs disabled:opacity-40"
              onClick={props.onOptimize}
              disabled={!props.hasChatConfig || !props.requirement || busy}
            >
              {props.status === "optimizing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              AI优化提示词
            </button>
          </div>
          <textarea
            className="field min-h-32 resize-y px-3 py-3 text-sm leading-6"
            value={props.requirement}
            onChange={(event) => props.setRequirement(event.target.value)}
            placeholder="例如：不改变原有结构比例，优化外观细节，提升科技感和高级感，增加更强的品牌识别特征，KeyShot真实产品渲染质感。"
          />
          {!props.hasChatConfig ? <p className="text-xs leading-5 text-amber-200/80">当前未完成认证，暂时无法使用 AI 优化提示词。</p> : null}
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-200">图片比例</span>
            <select className="field h-11 px-3 text-sm" value={props.size} onChange={(event) => props.setSize(event.target.value)}>
              {sizeOptions.map((option) => (
                <option key={option.value} value={option.value} className="bg-graphite-900">
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-200">图片质量</span>
            <select className="field h-11 px-3 text-sm" value={props.quality} onChange={(event) => props.setQuality(event.target.value)}>
              {qualityOptions.map((option) => (
                <option key={option.value} value={option.value} className="bg-graphite-900">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
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
