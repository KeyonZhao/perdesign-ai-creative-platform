"use client";

import { ChevronUp, Clapperboard, SendHorizontal } from "lucide-react";
import { useState } from "react";
import type { VideoGenerationRequest } from "@/lib/types";

type VideoGenerationPanelProps = {
  disabled?: boolean;
  value?: VideoGenerationRequest;
  onChange?: (request: VideoGenerationRequest) => void;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onSubmit: (request: VideoGenerationRequest) => void;
};

const DEFAULT_VIDEO_PROMPT =
  "以当前产品设计图作为首帧，保持产品造型、比例、材质与品牌特征稳定，生成自然、专业的产品展示短片。镜头缓慢环绕并轻微推进，产品主体始终清晰完整，光影与背景运动真实，不改变结构，不出现文字、标志错乱或多余物体。";

export function VideoGenerationPanel({
  disabled = false,
  value,
  onChange,
  onClose,
  onMouseEnter,
  onMouseLeave,
  onSubmit
}: VideoGenerationPanelProps) {
  const [localValue, setLocalValue] = useState<VideoGenerationRequest>({
    prompt: "",
    ratio: "16:9",
    duration: 5,
    resolution: "720p"
  });
  const currentValue = value ?? localValue;

  function updateValue(patch: Partial<VideoGenerationRequest>) {
    const nextValue = { ...currentValue, ...patch };
    if (!value) setLocalValue(nextValue);
    onChange?.(nextValue);
  }

  return (
    <section
      className="video-generation-panel"
      aria-label="视频生成设置"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="ecommerce-poster-panel-heading">
        <div>
          <strong>生成视频</strong>
          <span>当前图片作为首帧，可补充产品动作与镜头要求</span>
        </div>
        <button
          type="button"
          className="divergence-panel-close"
          onClick={onClose}
          title="收起"
          aria-label="收起视频生成设置"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      <textarea
        className="ecommerce-poster-instruction video-generation-prompt"
        value={currentValue.prompt}
        onChange={(event) => updateValue({ prompt: event.target.value })}
        placeholder="例如：镜头从左前方缓慢环绕至右侧，展示旋钮操作和材质反光。"
        maxLength={1000}
        rows={3}
        autoFocus
      />

      <div className="video-generation-options">
        <VideoOptionGroup
          label="画幅"
          value={currentValue.ratio}
          options={[
            { label: "横屏", value: "16:9" },
            { label: "竖屏", value: "9:16" },
            { label: "方形", value: "1:1" }
          ]}
          onChange={(ratio) => updateValue({ ratio: ratio as VideoGenerationRequest["ratio"] })}
        />
        <VideoOptionGroup
          label="时长"
          value={String(currentValue.duration)}
          options={[
            { label: "5 秒", value: "5" },
            { label: "10 秒", value: "10" }
          ]}
          onChange={(duration) => updateValue({ duration: duration === "10" ? 10 : 5 })}
        />
        <VideoOptionGroup
          label="清晰度"
          value={currentValue.resolution}
          options={[
            { label: "720P", value: "720p" },
            { label: "1080P", value: "1080p" }
          ]}
          onChange={(resolution) =>
            updateValue({ resolution: resolution as VideoGenerationRequest["resolution"] })
          }
        />
      </div>

      <div className="ecommerce-poster-panel-footer">
        <span>{currentValue.prompt.length}/1000</span>
        <button
          type="button"
          className="ecommerce-poster-submit"
          disabled={disabled}
          onClick={() =>
            onSubmit({
              ...currentValue,
              prompt: currentValue.prompt.trim() || DEFAULT_VIDEO_PROMPT
            })
          }
        >
          <Clapperboard className="h-4 w-4" />
          <span>开始生成</span>
          <SendHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}

function VideoOptionGroup({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="video-option-group">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "active" : ""}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
