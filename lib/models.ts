import type { ModelOption, QualityOption, SizeOption } from "./types";

export const brainModels: ModelOption[] = [
  { label: "GPT-4o Mini", value: "gpt-4o-mini" },
  { label: "GPT-4o", value: "gpt-4o" },
  { label: "GPT-5", value: "gpt-5" },
  { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
  { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
  { label: "Claude Sonnet 4", value: "claude-sonnet-4" }
];

export const imageModels: ModelOption[] = [
  { label: "GPT Image 2", value: "gpt-image-2", supportsEdit: true },
  { label: "GPT Image 1", value: "gpt-image-1", supportsEdit: true },
  { label: "GPT Image 1.5", value: "gpt-image-1.5", supportsEdit: true },
  { label: "GPT Image 1 Mini", value: "gpt-image-1-mini", supportsEdit: true }
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
