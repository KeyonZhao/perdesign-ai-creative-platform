"use client";

import { useEffect, useState } from "react";

const EXPECTED_DURATION_MS = 80_000;

function getTimedProgress(elapsedMs: number) {
  const seconds = Math.max(0, elapsedMs / 1000);
  if (seconds < 10) return 4 + (seconds / 10) * 14;
  if (seconds < 30) return 18 + ((seconds - 10) / 20) * 30;
  if (seconds < 55) return 48 + ((seconds - 30) / 25) * 28;
  if (seconds < 75) return 76 + ((seconds - 55) / 20) * 18;
  if (seconds < 80) return 94 + ((seconds - 75) / 5) * 5;
  return 99;
}

function getStage(progress: number) {
  if (progress < 20) return ["解析产品特征", "正在理解产品结构、材质与设计要求"];
  if (progress < 50) return ["构建设计方案", "正在组织造型语言与视觉方向"];
  if (progress < 78) return ["渲染画面细节", "正在完善光影、材质与构图"];
  if (progress < 99) return ["优化输出效果", "正在进行最后的细节处理"];
  if (progress < 100) return ["即将完成", "生成时间稍长，正在等待最终图片"];
  return ["生成完成", "正在呈现设计结果"];
}

export function ImageGenerationProgress({
  startedAt,
  finishing = false
}: {
  startedAt: number;
  finishing?: boolean;
}) {
  const [progress, setProgress] = useState(4);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (finishing) {
      const currentElapsedMs = Date.now() - startedAt;
      const initial = Math.min(99, getTimedProgress(currentElapsedMs));
      setElapsedMs(currentElapsedMs);
      const finishStartedAt = performance.now();
      let frameId = 0;
      const animate = (now: number) => {
        const ratio = Math.min(1, (now - finishStartedAt) / 620);
        const eased = 1 - Math.pow(1 - ratio, 3);
        setProgress(initial + (100 - initial) * eased);
        if (ratio < 1) frameId = requestAnimationFrame(animate);
      };
      frameId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(frameId);
    }

    const update = () => {
      const currentElapsedMs = Date.now() - startedAt;
      setElapsedMs(currentElapsedMs);
      setProgress(getTimedProgress(currentElapsedMs));
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [finishing, startedAt]);

  const [stage, detail] = getStage(progress);
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

  return (
    <div className={`image-generation-progress ${finishing ? "finishing" : ""}`}>
      <div className="image-generation-progress-glow" />
      <div className="image-generation-progress-content">
        <div className="image-generation-progress-meta">
          <span>{stage}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="image-generation-progress-track" aria-label={`图片生成进度 ${Math.round(progress)}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="image-generation-progress-detail">
          <span>{detail}</span>
          <span>{elapsedSeconds < 80 ? `已等待 ${elapsedSeconds} 秒` : "仍在生成，请稍候"}</span>
        </div>
      </div>
    </div>
  );
}

export { EXPECTED_DURATION_MS };
