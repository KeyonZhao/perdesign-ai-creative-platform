"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, ImagePlus, PenLine, Trash2, UploadCloud, X } from "lucide-react";
import type { ProductInputMode, UploadedImage } from "@/lib/types";
import { formatBytes, getGalleryDraggedImage } from "@/lib/image";

const MAX_SIZE = 25 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

type ImageUploaderProps = {
  value: UploadedImage | null;
  onChange: (image: UploadedImage | null) => void;
  onError: (message: string) => void;
  title?: string;
  emptyTitle?: string;
  helperText?: string;
  imageAlt?: string;
  inputMode?: ProductInputMode;
  onInputModeChange?: (mode: ProductInputMode) => void;
};

export function ImageUploader({
  value,
  onChange,
  onError,
  title = "产品图",
  emptyTitle = "拖入产品图，开始变款重构",
  helperText = "支持 PNG / JPG / WebP，建议上传清晰产品渲染图或实拍图",
  imageAlt = "上传的图片",
  inputMode,
  onInputModeChange
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteTargetActive, setPasteTargetActive] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleFile = useCallback(async (file?: File) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      onError("请上传 PNG、JPG、JPEG 或 WebP 图片。");
      return;
    }
    if (file.size > MAX_SIZE) {
      onError("图片不能超过 25MB。");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("图片读取失败，请重试。"));
      reader.readAsDataURL(file);
    });

    onChange({ name: file.name, size: file.size, type: file.type, dataUrl });
  }, [onChange, onError]);

  useEffect(() => {
    if (!pasteTargetActive) return;

    function handlePaste(event: ClipboardEvent) {
      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      const file = imageItem?.getAsFile();
      if (!file) return;

      event.preventDefault();
      handleFile(file);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleFile, pasteTargetActive]);

  const interactionProps = {
    onMouseEnter: () => setPasteTargetActive(true),
    onMouseLeave: () => setPasteTargetActive(false),
    onFocus: () => setPasteTargetActive(true),
    onBlur: () => setPasteTargetActive(false),
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const galleryImage = getGalleryDraggedImage(event.dataTransfer);
      if (galleryImage) {
        onChange(galleryImage);
        return;
      }
      void handleFile(event.dataTransfer.files[0]);
    }
  };

  const uploadSurfaceClass = `w-full overflow-hidden rounded-[18px] border text-left transition ${
    dragging || pasteTargetActive
      ? "border-white/[0.08] bg-white/[0.04]"
      : "border-white/10 bg-[#18181a] hover:border-white/20 hover:bg-[#1d1d20]"
  }`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-200">{title}</span>
        {value ? (
          <button
            type="button"
            className="btn-secondary flex h-8 items-center gap-2 rounded-xl px-2.5 text-xs"
            onClick={() => onChange(null)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </button>
        ) : null}
      </div>

      <div className={uploadSurfaceClass} {...interactionProps}>
        {inputMode && onInputModeChange ? (
          <div className="flex justify-center px-4 pt-3.5">
            <div className="inline-grid grid-cols-2 gap-0.5 rounded-[10px] border border-white/[0.07] bg-black/20 p-1" role="group" aria-label="产品图类型">
              <button
                type="button"
                className={`flex h-7 items-center justify-center gap-1.5 rounded-[7px] border px-2.5 text-[11px] font-medium transition ${inputMode === "product" ? "border-violet-400/35 bg-white/[0.075] text-white shadow-[0_0_12px_rgba(111,76,255,0.13),inset_-1px_0_0_rgba(139,108,255,0.42)]" : value ? "cursor-not-allowed border-transparent text-zinc-700" : "border-transparent text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-300"}`}
                onClick={() => onInputModeChange("product")}
                aria-pressed={inputMode === "product"}
                disabled={Boolean(value && inputMode !== "product")}
              >
                <ImageIcon className={`h-3.5 w-3.5 ${inputMode === "product" ? "text-violet-200" : ""}`} />
                产品原图
              </button>
              <button
                type="button"
                className={`flex h-7 items-center justify-center gap-1.5 rounded-[7px] border px-2.5 text-[11px] font-medium transition ${inputMode === "sketch" ? "border-violet-400/35 bg-white/[0.075] text-white shadow-[0_0_12px_rgba(111,76,255,0.13),inset_-1px_0_0_rgba(139,108,255,0.42)]" : value ? "cursor-not-allowed border-transparent text-zinc-700" : "border-transparent text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-300"}`}
                onClick={() => onInputModeChange("sketch")}
                aria-pressed={inputMode === "sketch"}
                disabled={Boolean(value && inputMode !== "sketch")}
              >
                <PenLine className={`h-3.5 w-3.5 ${inputMode === "sketch" ? "text-violet-200" : ""}`} />
                设计草图
              </button>
            </div>
          </div>
        ) : null}

        {value ? (
          <div className={`p-4 ${inputMode ? "pt-3" : ""}`}>
            <div className="flex gap-3">
              <button
                type="button"
                className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl outline-none ring-violet-400/60 focus-visible:ring-2"
                onClick={() => setPreviewOpen(true)}
                aria-label={`预览${title}`}
                title={`预览${title}`}
              >
                <img src={value.dataUrl} alt={imageAlt} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.04]" />
                <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 self-stretch rounded-xl px-3 text-left outline-none transition hover:bg-white/[0.045] focus-visible:bg-white/[0.045] focus-visible:ring-2 focus-visible:ring-violet-400/50"
                onClick={() => inputRef.current?.click()}
                aria-label={`重新上传${title}：${value.name}`}
                title={`重新上传${title}`}
              >
                <p className="truncate text-sm font-medium text-white">{value.name}</p>
                <p className="mt-1 text-xs text-zinc-500">{formatBytes(value.size)}</p>
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`w-full p-4 text-left outline-none transition hover:bg-white/[0.025] focus-visible:bg-white/[0.035] ${inputMode ? "pt-3" : ""}`}
          >
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-[#222226]">
                {title.includes("参考") ? <ImagePlus className="h-5 w-5 text-violet-200" /> : <UploadCloud className="h-5 w-5 text-violet-200" />}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{emptyTitle}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{helperText}</p>
              </div>
            </div>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {previewOpen && value ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" onClick={() => setPreviewOpen(false)}>
          <div className="relative inline-flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)]" onClick={(event) => event.stopPropagation()}>
            <img
              src={value.dataUrl}
              alt={`${title}大图预览`}
              className="block h-auto max-h-[calc(100dvh-2rem)] w-auto max-w-[calc(100vw-2rem)] rounded-[18px] border border-white/10 object-contain"
            />
            <button
              type="button"
              className="btn-secondary absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl bg-black/45"
              onClick={() => setPreviewOpen(false)}
              aria-label="关闭图片预览"
              title="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
