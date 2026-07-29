"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import type { UploadedImage } from "@/lib/types";
import { getGalleryDraggedImage } from "@/lib/image";

const MAX_IMAGES = 3;
const MAX_SIZE = 25 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

type ReferenceImageUploaderProps = {
  values: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  onError: (message: string) => void;
};

async function readFile(file: File): Promise<UploadedImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败，请重试。"));
    reader.readAsDataURL(file);
  });

  return {
    name: file.name || "粘贴的参考图.png",
    size: file.size,
    type: file.type,
    dataUrl
  };
}

export function ReferenceImageUploader({
  values,
  onChange,
  onError
}: ReferenceImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteTargetActive, setPasteTargetActive] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const addFiles = useCallback(async (files: File[]) => {
    const remaining = MAX_IMAGES - values.length;
    if (remaining <= 0) {
      onError("参考图最多可上传 3 张。");
      return;
    }

    const imageFiles = files.filter((file) => ACCEPTED.includes(file.type));
    if (!imageFiles.length) {
      onError("请上传 PNG、JPG、JPEG 或 WebP 图片。");
      return;
    }

    const oversized = imageFiles.find((file) => file.size > MAX_SIZE);
    if (oversized) {
      onError(`图片“${oversized.name}”不能超过 25MB。`);
      return;
    }

    try {
      const acceptedFiles = imageFiles.slice(0, remaining);
      const nextImages = await Promise.all(acceptedFiles.map(readFile));
      onChange([...values, ...nextImages]);
      if (imageFiles.length > remaining) {
        onError("参考图最多可上传 3 张，已保留前 3 张。");
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "图片读取失败，请重试。");
    }
  }, [onChange, onError, values]);

  const addGalleryImage = useCallback((image: UploadedImage) => {
    if (values.length >= MAX_IMAGES) {
      onError("参考图最多可上传 3 张。");
      return;
    }
    onChange([...values, image]);
  }, [onChange, onError, values]);

  useEffect(() => {
    if (!pasteTargetActive) return;

    function handlePaste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (!files.length) return;

      event.preventDefault();
      void addFiles(files);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addFiles, pasteTargetActive]);

  function removeImage(index: number) {
    onChange(values.filter((_, imageIndex) => imageIndex !== index));
    setPreviewIndex(null);
  }

  const activePreview = previewIndex === null ? null : values[previewIndex];
  const isActive = dragging || pasteTargetActive;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-200">参考图</span>
        {values.length ? (
          <button
            type="button"
            className="btn-secondary flex h-8 items-center gap-2 rounded-xl px-2.5 text-xs"
            onClick={() => onChange([])}
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空
          </button>
        ) : null}
      </div>

      <div
        className={`reference-multi-uploader ${isActive ? "active" : ""}`}
        onMouseEnter={() => setPasteTargetActive(true)}
        onMouseLeave={() => setPasteTargetActive(false)}
        onFocus={() => setPasteTargetActive(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPasteTargetActive(false);
        }}
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
            addGalleryImage(galleryImage);
            return;
          }
          void addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {values.length ? (
          <div className="reference-multi-content">
            <div
              className="reference-card-stack"
              style={{ width: `${76 + (values.length - 1) * 18}px` }}
              aria-label={`已上传 ${values.length} 张参考图`}
            >
              {values.map((image, index) => {
                const center = (values.length - 1) / 2;
                const rotation = (index - center) * 7;
                return (
                  <div
                    key={`${image.name}-${index}`}
                    className="reference-card"
                    style={{
                      left: `${index * 18}px`,
                      transform: `rotate(${rotation}deg)`,
                      zIndex: index + 1
                    }}
                  >
                    <button
                      type="button"
                      className="reference-card-preview"
                      onClick={() => setPreviewIndex(index)}
                      aria-label={`预览参考图 ${index + 1}`}
                    >
                      <img src={image.dataUrl} alt={`参考图 ${index + 1}`} />
                    </button>
                    <button
                      type="button"
                      className="reference-card-remove"
                      onClick={() => removeImage(index)}
                      title={`移除参考图 ${index + 1}`}
                      aria-label={`移除参考图 ${index + 1}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="reference-multi-copy"
              onClick={() => {
                if (values.length < MAX_IMAGES) inputRef.current?.click();
                else setPreviewIndex(values.length - 1);
              }}
            >
              <strong>已上传 {values.length} 张参考图</strong>
              <span>{values.length < MAX_IMAGES ? `还可添加 ${MAX_IMAGES - values.length} 张` : "已达到 3 张上限"}</span>
            </button>

            {values.length < MAX_IMAGES ? (
              <button
                type="button"
                className="reference-add-button"
                onClick={() => inputRef.current?.click()}
                title="继续添加参考图"
                aria-label="继续添加参考图"
              >
                <ImagePlus className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="reference-multi-empty"
            onClick={() => inputRef.current?.click()}
          >
            <span className="reference-multi-icon">
              <ImagePlus className="h-5 w-5" />
            </span>
            <span>
              <strong>拖入参考图，提取风格语言</strong>
              <small>最多 3 张，仅参考材质、配色、细节和设计语言</small>
            </span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={(event) => {
          void addFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />

      {activePreview ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setPreviewIndex(null)}
        >
          <div
            className="relative inline-flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={activePreview.dataUrl}
              alt="参考图大图预览"
              className="block h-auto max-h-[calc(100dvh-2rem)] w-auto max-w-[calc(100vw-2rem)] rounded-[18px] border border-white/10 object-contain"
            />
            <button
              type="button"
              className="btn-secondary absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl bg-black/45"
              onClick={() => setPreviewIndex(null)}
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
