import type { ModelOption, QualityOption, SizeOption } from "./types";

export const brainModels: ModelOption[] = [
  { label: "GPT-5.6 Sol", value: "gpt-5.6-sol" },
  { label: "GPT-5.6 Terra", value: "gpt-5.6-terra" },
  { label: "GPT-5.6 Luna", value: "gpt-5.6-luna" },
  { label: "GPT-5.5", value: "gpt-5.5" },
  { label: "GPT-5.4", value: "gpt-5.4" },
  { label: "GPT-5.4 Mini", value: "gpt-5.4-mini" }
];

export const imageModels: ModelOption[] = [
  { label: "GPT Image 2", value: "gpt-image-2", supportsEdit: true },
  { label: "GPT Image 2 Auto", value: "gpt-image-2-auto", supportsEdit: true },
  { label: "GPT Image 2 N", value: "gpt-image-2-n", supportsEdit: true },
  { label: "GPT Image 2 Eco", value: "gpt-image-2-eco", supportsEdit: true },
  { label: "Gemini 3 Pro Image", value: "gemini-3-pro-image", supportsEdit: true },
  { label: "Gemini 3.1 Flash Image", value: "gemini-3.1-flash-image", supportsEdit: true }
];

export const sizeOptions: SizeOption[] = [
  { label: "1:1 方图", value: "1024x1024" },
  { label: "4:3 横图", value: "1536x1024" },
  { label: "3:4 竖图", value: "1024x1536" },
  { label: "自动", value: "auto" }
];

export const qualityOptions: QualityOption[] = [
  { label: "自动", value: "auto" },
  { label: "高质量", value: "high" },
  { label: "中等", value: "medium" },
  { label: "低成本", value: "low" }
];
