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

export type ProductInputMode = "product" | "sketch";

export type ConceptPrompt = {
  title: string;
  prompt: string;
};

export type GenerationResult = ConceptPrompt & {
  id: string;
  imageBase64?: string;
  designDescription?: string;
  error?: string;
};

export type GenerationSourceImage = {
  name: string;
  dataUrl: string;
};

export type GenerationType = "design" | "multi-view" | "scene" | "local-edit" | "image-prompt";

export type GenerationMetadata = {
  description: string;
  innovationLevel: number;
  generationType?: GenerationType;
  sketchImage?: GenerationSourceImage;
  productImage?: GenerationSourceImage;
  referenceImage?: GenerationSourceImage;
};

export type GenerationBatch = {
  id: string;
  results: GenerationResult[];
  metadata?: GenerationMetadata;
};

export type GenerationStatus = "idle" | "optimizing" | "generating" | "success" | "error";

export type CustomCanvasGenerationRequest = {
  productName: string;
  sourceImage: UploadedImage;
  referenceImage: UploadedImage | null;
  innovationLevel: number;
  requirement: string;
  count: number;
  size: string;
};

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
