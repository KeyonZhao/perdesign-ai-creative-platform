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
  assetType?: "image" | "model3d" | "video";
  imageBase64?: string;
  modelBlob?: Blob;
  modelTaskId?: string;
  videoUrl?: string;
  videoTaskId?: string;
  videoStatus?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  designDescription?: string;
  error?: string;
};

export type GenerationSourceImage = {
  name: string;
  dataUrl: string;
};

export type DivergenceStyleId =
  | "precision"
  | "soft"
  | "dynamic"
  | "minimal"
  | "professional"
  | "signature"
  | "modern-minimal"
  | "industrial-rugged"
  | "future-sci-fi";

export type DivergenceMode = "free" | "directed";
export type DivergenceExplorationLevel = "steady" | "balanced" | "bold";

export type CreativeDivergenceRequest = {
  mode?: DivergenceMode;
  explorationLevel?: DivergenceExplorationLevel;
  note?: string;
  styleIds?: DivergenceStyleId[];
  referenceImage?: GenerationSourceImage;
  referenceWeight?: number;
};

export type VideoGenerationRequest = {
  prompt: string;
  ratio: "16:9" | "9:16" | "1:1";
  duration: 5 | 10;
  resolution: "720p" | "1080p";
};

export type GenerationType =
  | "design"
  | "multi-view"
  | "scene"
  | "ecommerce-poster"
  | "divergence"
  | "local-edit"
  | "image-prompt"
  | "upscale"
  | "video";

export type GenerationMetadata = {
  productName?: string;
  description: string;
  innovationLevel: number;
  generationType?: GenerationType;
  divergenceStyles?: string[];
  sketchImage?: GenerationSourceImage;
  productImage?: GenerationSourceImage;
  referenceImage?: GenerationSourceImage;
  referenceImages?: GenerationSourceImage[];
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
