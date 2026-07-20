export type ModelOption = {
  label: string;
  value: string;
  supportsEdit?: boolean;
};

export type UploadedImage = {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
};

export type ConceptPrompt = {
  title: string;
  prompt: string;
};

export type GenerationResult = ConceptPrompt & {
  id: string;
  imageBase64?: string;
  error?: string;
};

export type GenerationBatch = {
  id: string;
  results: GenerationResult[];
};

export type GenerationStatus = "idle" | "optimizing" | "generating" | "success" | "error";

export type ToastMessage = {
  id: string;
  type: "success" | "error" | "info";
  message: string;
};

export type SizeOption = {
  label: string;
  value: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
};

export type QualityOption = {
  label: string;
  value: "auto" | "high" | "medium" | "low";
};
