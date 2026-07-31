"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Box, Check, ChevronDown, ChevronUp, Clapperboard, Copy, Download, Eraser, FileText, LoaderCircle, Maximize2, Mountain, Paintbrush, Plus, Rotate3D, RotateCcw, SendHorizontal, ShoppingBag, Sparkles, Trash2, UploadCloud, X } from "lucide-react";
import { DIVERGENCE_STYLES } from "@/lib/creative-divergence";
import type { CreativeDivergenceRequest, DivergenceStyleId, GenerationMetadata, GenerationResult, GenerationSourceImage, VideoGenerationRequest } from "@/lib/types";
import { downloadDataUrl, prepareImageFileDrag, releaseImageFileDrag } from "@/lib/image";
import { TripoModelViewer } from "./TripoModelViewer";
import { VideoGenerationPanel } from "./VideoGenerationPanel";

type ImagePreviewModalProps = {
  isGeneratingVariant?: boolean;
  isGeneratingDesignDescription?: boolean;
  onGenerateMultiView?: (result: GenerationResult) => void;
  onGenerateScene?: (result: GenerationResult) => void;
  onGenerateEcommercePoster?: (result: GenerationResult, instruction?: string) => void;
  onGenerateDivergence?: (
    result: GenerationResult,
    productName: string | undefined,
    request: CreativeDivergenceRequest
  ) => void;
  onGenerateFromPrompt?: (result: GenerationResult, instruction: string, referenceImages?: GenerationSourceImage[]) => void;
  onGenerateVideo?: (result: GenerationResult, request: VideoGenerationRequest) => void;
  onGenerateDesignDescription?: (result: GenerationResult) => Promise<string>;
  onLocalEdit?: (result: GenerationResult, maskImageBase64: string, instruction: string, guideImageBase64?: string) => void;
  onModelGenerated?: (sourceResult: GenerationResult, modelBlob: Blob, modelTaskId: string) => void | Promise<void>;
  onDelete?: (result: GenerationResult) => void | Promise<void>;
  startEditing?: boolean;
  startModelPanel?: boolean;
  metadata?: GenerationMetadata | null;
  result: GenerationResult | null;
  onClose: () => void;
};

type PaintTool = "brush" | "eraser";
type MaskSnapshot = { imageData: ImageData; hadMask: boolean };
type ModelGenerationPhase = "idle" | "uploading" | "generating" | "success" | "error";
type ModelViewKey = "left" | "back" | "right";
type DivergenceQuadrantPosition = "左上" | "右上" | "左下" | "右下";
const DIVERGENCE_QUADRANTS: DivergenceQuadrantPosition[] = ["左上", "右上", "左下", "右下"];
const MODEL_VIEW_OPTIONS: Array<{ key: ModelViewKey; label: string }> = [
  { key: "left", label: "左视图" },
  { key: "back", label: "后视图" },
  { key: "right", label: "右视图" }
];
const LEGACY_SCENE_PROMPT = "分析图片中的产品品类，生成该品类经常出现在的场景下的产品场景图";
const LEGACY_MULTI_VIEW_PROMPT =
  "生成这个产品的多视角图片，画面最右侧是产品的斜侧透视图，左侧包含产品正视图、左视图、后视图、顶视图。";
const LEGACY_LOCAL_EDIT_PROMPT_PREFIX = "请仅修改透明蒙版标记的涂抹区域。";
const LOCAL_EDIT_USER_PROMPT_MARKER = "用户对涂抹区域的修改要求：";

export function ImagePreviewModal({
  result,
  onClose,
  onGenerateMultiView,
  onGenerateScene,
  onGenerateEcommercePoster,
  onGenerateDivergence,
  onGenerateFromPrompt,
  onGenerateVideo,
  onGenerateDesignDescription,
  onLocalEdit,
  onModelGenerated,
  onDelete,
  startEditing = false,
  startModelPanel = false,
  metadata,
  isGeneratingVariant = false,
  isGeneratingDesignDescription = false
}: ImagePreviewModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const brushCursorRef = useRef<HTMLDivElement | null>(null);
  const imagePromptFileInputRef = useRef<HTMLInputElement | null>(null);
  const divergenceFileInputRef = useRef<HTMLInputElement | null>(null);
  const divergenceCloseTimerRef = useRef<number | null>(null);
  const isDivergenceFileDialogOpenRef = useRef(false);
  const ecommercePanelCloseTimerRef = useRef<number | null>(null);
  const videoPanelCloseTimerRef = useRef<number | null>(null);
  const modelViewFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingModelViewRef = useRef<ModelViewKey>("left");
  const hoveredModelViewRef = useRef<ModelViewKey | null>(null);
  const readModelViewRef = useRef<(file?: File) => Promise<void>>(async () => {});
  const modelPanelCloseTimerRef = useRef<number | null>(null);
  const modelRequestAbortRef = useRef<AbortController | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<MaskSnapshot[]>([]);
  const dragObjectUrlRef = useRef<string | null>(null);
  const activeResultIdRef = useRef(result?.id);
  const [isEditing, setIsEditing] = useState(false);
  const [paintTool, setPaintTool] = useState<PaintTool>("brush");
  const [brushSize, setBrushSize] = useState(42);
  const [instruction, setInstruction] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imagePromptReferences, setImagePromptReferences] = useState<GenerationSourceImage[]>([]);
  const [imagePromptUploadError, setImagePromptUploadError] = useState("");
  const [isEcommercePanelOpen, setIsEcommercePanelOpen] = useState(false);
  const [isVideoPanelOpen, setIsVideoPanelOpen] = useState(false);
  const [videoRequestDraft, setVideoRequestDraft] = useState<VideoGenerationRequest>({
    prompt: "",
    ratio: "16:9",
    duration: 5,
    resolution: "720p"
  });
  const [ecommerceInstruction, setEcommerceInstruction] = useState("");
  const [isDivergenceOpen, setIsDivergenceOpen] = useState(false);
  const [divergenceStyleIds, setDivergenceStyleIds] = useState<DivergenceStyleId[]>([]);
  const [divergenceReference, setDivergenceReference] = useState<GenerationSourceImage | undefined>();
  const [divergenceReferenceWeight, setDivergenceReferenceWeight] = useState(50);
  const [divergenceUploadError, setDivergenceUploadError] = useState("");
  const [hasMask, setHasMask] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [designDescription, setDesignDescription] = useState(result?.designDescription || "");
  const [designDescriptionError, setDesignDescriptionError] = useState("");
  const [hasCopiedDescription, setHasCopiedDescription] = useState(false);
  const [isSourceDescriptionExpanded, setIsSourceDescriptionExpanded] = useState(false);
  const [isPosterZoomOpen, setIsPosterZoomOpen] = useState(false);
  const [selectedDivergenceQuadrant, setSelectedDivergenceQuadrant] =
    useState<DivergenceQuadrantPosition | null>(null);
  const [isModelPanelOpen, setIsModelPanelOpen] = useState(false);
  const [modelViews, setModelViews] = useState<Partial<Record<ModelViewKey, GenerationSourceImage>>>({});
  const [modelViewUploadError, setModelViewUploadError] = useState("");
  const [isModelViewerOpen, setIsModelViewerOpen] = useState(false);
  const [modelGenerationPhase, setModelGenerationPhase] = useState<ModelGenerationPhase>("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const [modelUrl, setModelUrl] = useState("");
  const [modelBlob, setModelBlob] = useState<Blob | undefined>();
  const [modelTaskId, setModelTaskId] = useState("");
  const [modelGenerationError, setModelGenerationError] = useState("");

  activeResultIdRef.current = result?.id;
  readModelViewRef.current = readModelView;

  useEffect(() => {
    modelRequestAbortRef.current?.abort();
    modelRequestAbortRef.current = null;
    setIsEditing(startEditing);
    setPaintTool("brush");
    setInstruction("");
    setImagePrompt("");
    setImagePromptReferences([]);
    setImagePromptUploadError("");
    setIsEcommercePanelOpen(false);
    setIsVideoPanelOpen(false);
    setVideoRequestDraft({
      prompt: "",
      ratio: "16:9",
      duration: 5,
      resolution: "720p"
    });
    setEcommerceInstruction("");
    setIsDivergenceOpen(false);
    setDivergenceStyleIds([]);
    setDivergenceReference(undefined);
    setDivergenceReferenceWeight(50);
    setDivergenceUploadError("");
    setHasMask(false);
    historyRef.current = [];
    setHistoryCount(0);
    setDesignDescription(result?.designDescription || "");
    setDesignDescriptionError("");
    setHasCopiedDescription(false);
    setIsSourceDescriptionExpanded(false);
    setIsPosterZoomOpen(false);
    setSelectedDivergenceQuadrant(null);
    setIsModelPanelOpen(startModelPanel);
    setModelViews({});
    setModelViewUploadError("");
    setIsModelViewerOpen(false);
    setModelGenerationPhase("idle");
    setModelProgress(0);
    setModelUrl("");
    setModelBlob(undefined);
    setModelTaskId("");
    setModelGenerationError("");
  }, [result?.designDescription, result?.id, startEditing, startModelPanel]);

  useEffect(() => () => modelRequestAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!isModelPanelOpen) hoveredModelViewRef.current = null;

    function handleModelViewPaste(event: ClipboardEvent) {
      const hoveredView = hoveredModelViewRef.current;
      if (!isModelPanelOpen || !hoveredView) return;
      const imageFile = Array.from(event.clipboardData?.items || [])
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
      if (!imageFile) return;

      event.preventDefault();
      pendingModelViewRef.current = hoveredView;
      void readModelViewRef.current(imageFile);
    }

    window.addEventListener("paste", handleModelViewPaste);
    return () => window.removeEventListener("paste", handleModelViewPaste);
  }, [isModelPanelOpen]);

  useEffect(() => () => {
    if (divergenceCloseTimerRef.current !== null) {
      window.clearTimeout(divergenceCloseTimerRef.current);
    }
    if (ecommercePanelCloseTimerRef.current !== null) {
      window.clearTimeout(ecommercePanelCloseTimerRef.current);
    }
    if (modelPanelCloseTimerRef.current !== null) {
      window.clearTimeout(modelPanelCloseTimerRef.current);
    }
    if (videoPanelCloseTimerRef.current !== null) {
      window.clearTimeout(videoPanelCloseTimerRef.current);
    }
  }, []);

  function keepEcommercePanelOpen() {
    if (ecommercePanelCloseTimerRef.current !== null) {
      window.clearTimeout(ecommercePanelCloseTimerRef.current);
      ecommercePanelCloseTimerRef.current = null;
    }
    setIsDivergenceOpen(false);
    setIsModelPanelOpen(false);
    setIsVideoPanelOpen(false);
    setIsEcommercePanelOpen(true);
  }

  function scheduleEcommercePanelClose() {
    if (ecommercePanelCloseTimerRef.current !== null) {
      window.clearTimeout(ecommercePanelCloseTimerRef.current);
    }
    ecommercePanelCloseTimerRef.current = window.setTimeout(() => {
      if (document.activeElement?.closest(".ecommerce-poster-panel")) {
        ecommercePanelCloseTimerRef.current = null;
        return;
      }
      setIsEcommercePanelOpen(false);
      ecommercePanelCloseTimerRef.current = null;
    }, 520);
  }

  function keepDivergenceOpen() {
    if (divergenceCloseTimerRef.current !== null) {
      window.clearTimeout(divergenceCloseTimerRef.current);
      divergenceCloseTimerRef.current = null;
    }
    setIsEcommercePanelOpen(false);
    setIsModelPanelOpen(false);
    setIsVideoPanelOpen(false);
    setIsDivergenceOpen(true);
  }

  function scheduleDivergenceClose() {
    if (isDivergenceFileDialogOpenRef.current) return;
    if (divergenceCloseTimerRef.current !== null) {
      window.clearTimeout(divergenceCloseTimerRef.current);
    }
    divergenceCloseTimerRef.current = window.setTimeout(() => {
      if (document.activeElement?.closest(".divergence-panel")) {
        divergenceCloseTimerRef.current = null;
        return;
      }
      setIsDivergenceOpen(false);
      divergenceCloseTimerRef.current = null;
    }, 520);
  }

  function openDivergenceFilePicker() {
    if (!divergenceFileInputRef.current) return;
    isDivergenceFileDialogOpenRef.current = true;
    keepDivergenceOpen();

    window.addEventListener("focus", () => {
      window.setTimeout(() => {
        isDivergenceFileDialogOpenRef.current = false;
        keepDivergenceOpen();
      }, 0);
    }, { once: true });

    divergenceFileInputRef.current.click();
  }

  function keepModelPanelOpen() {
    if (modelPanelCloseTimerRef.current !== null) {
      window.clearTimeout(modelPanelCloseTimerRef.current);
      modelPanelCloseTimerRef.current = null;
    }
    setIsEcommercePanelOpen(false);
    setIsDivergenceOpen(false);
    setIsVideoPanelOpen(false);
    setIsModelPanelOpen(true);
  }

  function scheduleModelPanelClose() {
    if (modelPanelCloseTimerRef.current !== null) {
      window.clearTimeout(modelPanelCloseTimerRef.current);
    }
    modelPanelCloseTimerRef.current = window.setTimeout(() => {
      if (document.activeElement?.closest(".model-generation-panel")) {
        modelPanelCloseTimerRef.current = null;
        return;
      }
      setIsModelPanelOpen(false);
      modelPanelCloseTimerRef.current = null;
    }, 520);
  }

  function keepVideoPanelOpen() {
    if (videoPanelCloseTimerRef.current !== null) {
      window.clearTimeout(videoPanelCloseTimerRef.current);
      videoPanelCloseTimerRef.current = null;
    }
    setIsEcommercePanelOpen(false);
    setIsDivergenceOpen(false);
    setIsModelPanelOpen(false);
    setIsVideoPanelOpen(true);
  }

  function scheduleVideoPanelClose() {
    if (videoPanelCloseTimerRef.current !== null) {
      window.clearTimeout(videoPanelCloseTimerRef.current);
    }
    videoPanelCloseTimerRef.current = window.setTimeout(() => {
      if (document.activeElement?.closest(".video-generation-panel")) {
        videoPanelCloseTimerRef.current = null;
        return;
      }
      setIsVideoPanelOpen(false);
      videoPanelCloseTimerRef.current = null;
    }, 520);
  }

  if (!result?.imageBase64) return null;

  const rawDescription = metadata?.description.trim() || result.prompt?.trim() || "";
  const isLocalEdit =
    metadata?.generationType === "local-edit" ||
    rawDescription.startsWith(LEGACY_LOCAL_EDIT_PROMPT_PREFIX) ||
    rawDescription.includes(LOCAL_EDIT_USER_PROMPT_MARKER);
  const savedDescription = isLocalEdit
    ? rawDescription.split(LOCAL_EDIT_USER_PROMPT_MARKER).at(-1)?.trim() || rawDescription
    : rawDescription;
  const hidesDescription =
    metadata?.generationType === "scene" ||
    metadata?.generationType === "multi-view" ||
    metadata?.generationType === "ecommerce-poster" ||
    metadata?.generationType === "divergence" ||
    savedDescription === LEGACY_SCENE_PROMPT ||
    savedDescription === LEGACY_MULTI_VIEW_PROMPT;
  const hasInnovationValue =
    Boolean(metadata) &&
    metadata?.generationType !== "scene" &&
    metadata?.generationType !== "multi-view" &&
    metadata?.generationType !== "ecommerce-poster" &&
    metadata?.generationType !== "divergence";
  const recordedReferenceImages = metadata?.referenceImages?.length
    ? metadata.referenceImages
    : metadata?.referenceImage
      ? [metadata.referenceImage]
      : [];
  const canCollapseDescription = savedDescription.length > 88;
  const canSelectDivergenceQuadrant =
    metadata?.generationType === "divergence" && !isEditing;
  const canZoomEcommercePoster =
    metadata?.generationType === "ecommerce-poster" && !isEditing;
  const selectedDivergenceQuadrantIndex = selectedDivergenceQuadrant
    ? DIVERGENCE_QUADRANTS.indexOf(selectedDivergenceQuadrant)
    : -1;

  function extractDivergenceQuadrant() {
    if (!selectedDivergenceQuadrant || isGeneratingVariant || !onGenerateFromPrompt) return;
    onGenerateFromPrompt(
      result!,
      `放大裁剪只保留【${selectedDivergenceQuadrant}】的方案输出给我`
    );
  }

  function initializeCanvas(image: HTMLImageElement) {
    const canvas = canvasRef.current;
    if (!canvas || !image.naturalWidth || !image.naturalHeight) return;
    if (canvas.width === image.naturalWidth && canvas.height === image.naturalHeight) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [];
    setHistoryCount(0);
    setHasMask(false);
  }

  function getCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      scale: canvas.width / rect.width
    };
  }

  function updateBrushCursor(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const cursor = brushCursorRef.current;
    if (!canvas || !cursor || event.pointerType === "touch") return;
    const rect = canvas.getBoundingClientRect();
    cursor.style.left = `${event.clientX - rect.left}px`;
    cursor.style.top = `${event.clientY - rect.top}px`;
    cursor.style.opacity = "1";
  }

  function hideBrushCursor() {
    if (brushCursorRef.current) brushCursorRef.current.style.opacity = "0";
  }

  function saveSnapshot() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    historyRef.current = [
      ...historyRef.current.slice(-11),
      { imageData: context.getImageData(0, 0, canvas.width, canvas.height), hadMask: hasMask }
    ];
    setHistoryCount(historyRef.current.length);
  }

  function drawSegment(from: { x: number; y: number }, to: { x: number; y: number; scale: number }) {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brushSize * to.scale;
    context.globalCompositeOperation = paintTool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = "rgba(113, 82, 255, 0.62)";
    context.shadowColor = paintTool === "brush" ? "rgba(118, 88, 255, 0.9)" : "transparent";
    context.shadowBlur = paintTool === "brush" ? 10 * to.scale : 0;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (isGeneratingVariant) return;
    updateBrushCursor(event);
    const point = getCanvasPoint(event);
    if (!point) return;
    saveSnapshot();
    isDrawingRef.current = true;
    lastPointRef.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawSegment(point, point);
    if (paintTool === "brush") setHasMask(true);
  }

  function continueDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    updateBrushCursor(event);
    if (!isDrawingRef.current) return;
    const point = getCanvasPoint(event);
    const lastPoint = lastPointRef.current;
    if (!point || !lastPoint) return;
    drawSegment(lastPoint, point);
    lastPointRef.current = point;
  }

  function stopDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function undoMask() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const snapshot = historyRef.current.pop();
    if (!canvas || !context || !snapshot) return;
    context.putImageData(snapshot.imageData, 0, 0);
    setHasMask(snapshot.hadMask);
    setHistoryCount(historyRef.current.length);
  }

  function clearMask() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !hasMask) return;
    saveSnapshot();
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
  }

  function createMaskDataUrl() {
    const paintCanvas = canvasRef.current;
    const paintContext = paintCanvas?.getContext("2d");
    if (!paintCanvas || !paintContext) return null;

    const paintData = paintContext.getImageData(0, 0, paintCanvas.width, paintCanvas.height);
    const selectionCanvas = document.createElement("canvas");
    selectionCanvas.width = paintCanvas.width;
    selectionCanvas.height = paintCanvas.height;
    const selectionContext = selectionCanvas.getContext("2d");
    if (!selectionContext) return null;

    const selectionData = selectionContext.createImageData(selectionCanvas.width, selectionCanvas.height);
    let selectedPixelCount = 0;
    for (let index = 0; index < paintData.data.length; index += 4) {
      const selected = paintData.data[index + 3] > 0;
      selectionData.data[index] = 255;
      selectionData.data[index + 1] = 255;
      selectionData.data[index + 2] = 255;
      selectionData.data[index + 3] = selected ? 255 : 0;
      if (selected) selectedPixelCount += 1;
    }
    if (!selectedPixelCount) return null;
    selectionContext.putImageData(selectionData, 0, 0);

    const minimumDimension = Math.min(paintCanvas.width, paintCanvas.height);
    const displayWidth = paintCanvas.getBoundingClientRect().width;
    const displayScale = displayWidth > 0 ? paintCanvas.width / displayWidth : 1;
    const sourceBrushSize = brushSize * displayScale;
    const expansionBlur = Math.max(
      18,
      Math.min(64, Math.round(Math.max(minimumDimension * 0.024, sourceBrushSize * 0.45)))
    );
    const featherBlur = Math.max(
      12,
      Math.min(30, Math.round(Math.max(minimumDimension * 0.014, sourceBrushSize * 0.22)))
    );
    const expandedCanvas = document.createElement("canvas");
    expandedCanvas.width = paintCanvas.width;
    expandedCanvas.height = paintCanvas.height;
    const expandedContext = expandedCanvas.getContext("2d");
    if (!expandedContext) return null;
    expandedContext.filter = `blur(${expansionBlur}px)`;
    expandedContext.drawImage(selectionCanvas, 0, 0);
    expandedContext.filter = "none";

    const expandedData = expandedContext.getImageData(0, 0, expandedCanvas.width, expandedCanvas.height);
    for (let index = 0; index < expandedData.data.length; index += 4) {
      const expanded = expandedData.data[index + 3] > 6;
      expandedData.data[index] = 255;
      expandedData.data[index + 1] = 255;
      expandedData.data[index + 2] = 255;
      expandedData.data[index + 3] = expanded ? 255 : 0;
    }
    expandedContext.putImageData(expandedData, 0, 0);

    const featherCanvas = document.createElement("canvas");
    featherCanvas.width = paintCanvas.width;
    featherCanvas.height = paintCanvas.height;
    const featherContext = featherCanvas.getContext("2d");
    if (!featherContext) return null;
    featherContext.filter = `blur(${featherBlur}px)`;
    featherContext.drawImage(expandedCanvas, 0, 0);
    featherContext.filter = "none";
    const featherData = featherContext.getImageData(0, 0, featherCanvas.width, featherCanvas.height);

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = paintCanvas.width;
    maskCanvas.height = paintCanvas.height;
    const maskContext = maskCanvas.getContext("2d");
    if (!maskContext) return null;
    const maskData = maskContext.createImageData(maskCanvas.width, maskCanvas.height);
    for (let index = 0; index < maskData.data.length; index += 4) {
      maskData.data[index] = 0;
      maskData.data[index + 1] = 0;
      maskData.data[index + 2] = 0;
      maskData.data[index + 3] = 255 - featherData.data[index + 3];
    }
    maskContext.putImageData(maskData, 0, 0);
    return maskCanvas.toDataURL("image/png");
  }

  async function createLocalEditGuideDataUrl() {
    const paintCanvas = canvasRef.current;
    if (!paintCanvas) return undefined;

    const sourceImage = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("局部修改区域引导图生成失败，请重试。"));
      image.src = result!.imageBase64!;
    });
    const guideCanvas = document.createElement("canvas");
    guideCanvas.width = paintCanvas.width;
    guideCanvas.height = paintCanvas.height;
    const guideContext = guideCanvas.getContext("2d");
    if (!guideContext) return undefined;
    guideContext.drawImage(sourceImage, 0, 0, guideCanvas.width, guideCanvas.height);
    guideContext.drawImage(paintCanvas, 0, 0);
    return guideCanvas.toDataURL("image/png");
  }

  async function submitLocalEdit() {
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) return;
    const maskImageBase64 = createMaskDataUrl();
    if (!maskImageBase64) return;
    const guideImageBase64 = await createLocalEditGuideDataUrl();
    onLocalEdit?.(result!, maskImageBase64, trimmedInstruction, guideImageBase64);
  }

  async function readImagePromptReferences(files: File[]) {
    if (!files.length) return;
    const remainingSlots = 3 - imagePromptReferences.length;
    if (remainingSlots <= 0) {
      setImagePromptUploadError("最多可上传 3 张参考图。");
      return;
    }

    const selectedFiles = files.slice(0, remainingSlots);
    if (selectedFiles.some((file) => !["image/png", "image/jpeg", "image/webp"].includes(file.type))) {
      setImagePromptUploadError("请上传 PNG、JPG、JPEG 或 WebP 图片。");
      return;
    }
    if (selectedFiles.some((file) => file.size > 25 * 1024 * 1024)) {
      setImagePromptUploadError("每张图片不能超过 25MB。");
      return;
    }

    try {
      const nextImages = await Promise.all(
        selectedFiles.map(async (file, index) => ({
          name: file.name || `粘贴的参考图-${imagePromptReferences.length + index + 1}.png`,
          dataUrl: await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("图片读取失败，请重试。"));
            reader.readAsDataURL(file);
          })
        }))
      );
      setImagePromptReferences((current) => [...current, ...nextImages].slice(0, 3));
      setImagePromptUploadError(files.length > remainingSlots ? "最多可上传 3 张参考图，已保留前 3 张。" : "");
    } catch (error) {
      setImagePromptUploadError(error instanceof Error ? error.message : "图片读取失败，请重试。");
    } finally {
      if (imagePromptFileInputRef.current) imagePromptFileInputRef.current.value = "";
    }
  }

  function pasteImagePromptReference(event: ReactClipboardEvent<HTMLInputElement>) {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!imageFiles.length) return;

    event.preventDefault();
    void readImagePromptReferences(imageFiles);
  }

  function submitImagePrompt() {
    const trimmedPrompt = imagePrompt.trim();
    if (!trimmedPrompt || isGeneratingVariant) return;
    onGenerateFromPrompt?.(result!, trimmedPrompt, imagePromptReferences.length ? imagePromptReferences : undefined);
  }

  async function readDivergenceReference(file?: File) {
    isDivergenceFileDialogOpenRef.current = false;
    keepDivergenceOpen();
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setDivergenceUploadError("请上传 PNG、JPG、JPEG 或 WebP 图片。");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setDivergenceUploadError("风格参考图不能超过 25MB。");
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("图片读取失败，请重试。"));
        reader.readAsDataURL(file);
      });
      setDivergenceReference({ name: file.name || "风格参考图.png", dataUrl });
      setDivergenceStyleIds([]);
      setDivergenceUploadError("");
    } catch (error) {
      setDivergenceUploadError(error instanceof Error ? error.message : "图片读取失败，请重试。");
    } finally {
      if (divergenceFileInputRef.current) divergenceFileInputRef.current.value = "";
      isDivergenceFileDialogOpenRef.current = false;
      keepDivergenceOpen();
    }
  }

  async function readModelView(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setModelViewUploadError("请上传 PNG、JPG、JPEG 或 WebP 图片。");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setModelViewUploadError("每张视图不能超过 25MB。");
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("视图读取失败，请重试。"));
        reader.readAsDataURL(file);
      });
      const viewKey = pendingModelViewRef.current;
      setModelViews((current) => ({
        ...current,
        [viewKey]: { name: file.name || `${viewKey}.png`, dataUrl }
      }));
      setModelViewUploadError("");
      keepModelPanelOpen();
    } catch (error) {
      setModelViewUploadError(error instanceof Error ? error.message : "视图读取失败，请重试。");
    } finally {
      if (modelViewFileInputRef.current) modelViewFileInputRef.current.value = "";
    }
  }

  function submitDivergence() {
    if (isGeneratingVariant || (!divergenceStyleIds.length && !divergenceReference)) return;
    onGenerateDivergence?.(result!, metadata?.productName, {
      styleIds: divergenceStyleIds,
      referenceImage: divergenceReference,
      referenceWeight: divergenceReference ? divergenceReferenceWeight : undefined
    });
  }

  async function generateDescription() {
    if (!onGenerateDesignDescription || isGeneratingDesignDescription) return;
    const requestedResultId = result!.id;
    setDesignDescriptionError("");
    try {
      const description = await onGenerateDesignDescription(result!);
      if (activeResultIdRef.current === requestedResultId) setDesignDescription(description);
    } catch (error) {
      if (activeResultIdRef.current === requestedResultId) {
        setDesignDescriptionError(error instanceof Error ? error.message : "设计说明生成失败，请稍后重试。");
      }
    }
  }

  async function copyDesignDescription() {
    if (!designDescription) return;
    try {
      await navigator.clipboard.writeText(designDescription);
      setHasCopiedDescription(true);
      window.setTimeout(() => setHasCopiedDescription(false), 1600);
    } catch {
      setDesignDescriptionError("复制失败，请检查浏览器剪贴板权限。");
    }
  }

  async function readApiPayload(response: Response) {
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      throw new Error(`3D 服务返回了无法识别的响应（HTTP ${response.status}）。`);
    }
    if (!response.ok) {
      throw new Error(typeof payload.error === "string" ? payload.error : `3D 服务请求失败（HTTP ${response.status}）。`);
    }
    return payload;
  }

  async function startModelGeneration(useMultiview = false) {
    if (!result?.imageBase64) return;
    const hasAdditionalViews = Object.values(modelViews).some(Boolean);
    if (useMultiview && !hasAdditionalViews) {
      setModelViewUploadError("请至少补充一张左、后或右视图。");
      keepModelPanelOpen();
      return;
    }

    modelRequestAbortRef.current?.abort();
    const controller = new AbortController();
    modelRequestAbortRef.current = controller;
    const requestedResultId = result.id;

    setIsDivergenceOpen(false);
    setIsModelPanelOpen(false);
    setIsEditing(false);
    setIsModelViewerOpen(true);
    setModelGenerationPhase("uploading");
    setModelProgress(0);
    setModelUrl("");
    setModelBlob(undefined);
    setModelTaskId("");
    setModelGenerationError("");

    try {
      const createResponse = await fetch("/api/tripo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: result.imageBase64,
          multiviewImages: useMultiview
            ? Object.fromEntries(
                Object.entries(modelViews)
                  .filter((entry): entry is [ModelViewKey, GenerationSourceImage] => Boolean(entry[1]))
                  .map(([key, image]) => [key, image.dataUrl])
              )
            : undefined
        }),
        signal: controller.signal
      });
      const createPayload = await readApiPayload(createResponse);
      const taskId = typeof createPayload.taskId === "string" ? createPayload.taskId : "";
      if (!taskId) throw new Error("3D 服务没有返回任务编号。");
      setModelTaskId(taskId);

      setModelGenerationPhase("generating");

      for (let attempt = 0; attempt < 150; attempt += 1) {
        if (controller.signal.aborted || activeResultIdRef.current !== requestedResultId) return;
        if (attempt > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
          if (controller.signal.aborted || activeResultIdRef.current !== requestedResultId) return;
        }

        const statusResponse = await fetch(`/api/tripo/status?taskId=${encodeURIComponent(taskId)}`, {
          signal: controller.signal,
          cache: "no-store"
        });
        const statusPayload = await readApiPayload(statusResponse);
        const taskStatus = typeof statusPayload.status === "string" ? statusPayload.status : "";
        const taskProgress = typeof statusPayload.progress === "number" ? statusPayload.progress : 0;
        setModelProgress(Math.max(0, Math.min(100, taskProgress)));

        if (taskStatus === "success") {
          const remoteModelUrl = typeof statusPayload.modelUrl === "string" ? statusPayload.modelUrl : "";
          if (!remoteModelUrl) throw new Error("3D任务已完成，但没有返回模型文件。");
          const proxiedModelUrl = `/api/tripo/model?url=${encodeURIComponent(remoteModelUrl)}`;
          const modelResponse = await fetch(proxiedModelUrl, {
            signal: controller.signal,
            cache: "no-store"
          });
          if (!modelResponse.ok) {
            const payload = await readApiPayload(modelResponse);
            throw new Error(typeof payload.error === "string" ? payload.error : "3D模型下载到本地失败。");
          }
          const downloadedModel = await modelResponse.blob();
          if (!downloadedModel.size) throw new Error("3D模型文件为空，请重新生成。");
          if (controller.signal.aborted || activeResultIdRef.current !== requestedResultId) return;
          setModelBlob(downloadedModel);
          setModelUrl("");
          setModelProgress(100);
          setModelGenerationPhase("success");
          try {
            await onModelGenerated?.(result, downloadedModel, taskId);
          } catch {
            // The model remains available in this preview even if local gallery persistence fails.
          }
          return;
        }

        if (["failed", "cancelled", "banned"].includes(taskStatus)) {
          throw new Error(
            typeof statusPayload.error === "string" && statusPayload.error
              ? statusPayload.error
              : "Tripo 未能完成当前 3D 模型。"
          );
        }
      }

      throw new Error("3D模型生成等待超时，请重新尝试。");
    } catch (error) {
      if (controller.signal.aborted) return;
      setModelGenerationPhase("error");
      setModelGenerationError(error instanceof Error ? error.message : "3D模型生成失败，请稍后重试。");
    }
  }

  return (
    <div className="image-preview-backdrop" onClick={onClose}>
      <div className={`image-preview-dialog has-image-prompt ${isEditing ? "editing" : ""}`} onClick={(event) => event.stopPropagation()}>
        <div className="image-preview-toolbar">
          <div className="image-preview-toolbar-actions">
            <button
              className={`btn-secondary image-preview-action ${isEditing ? "active" : ""}`}
              onClick={() => {
                setIsEcommercePanelOpen(false);
                setIsDivergenceOpen(false);
                setIsVideoPanelOpen(false);
                setIsEditing((current) => !current);
              }}
              disabled={isGeneratingVariant}
              title="局部修改"
            >
              <Paintbrush className="h-4 w-4" />
              <span>局部修改</span>
            </button>
            <button
              className="btn-secondary image-preview-action disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => onGenerateMultiView?.(result)}
              disabled={isGeneratingVariant || isEditing}
              title="生成多视图"
            >
              <Rotate3D className="h-4 w-4" />
              <span>{isGeneratingVariant ? "生成中" : "生成多视图"}</span>
            </button>
            <button
              className="btn-secondary image-preview-action disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => onGenerateScene?.(result)}
              disabled={isGeneratingVariant || isEditing}
              title="生成场景图"
            >
              <Mountain className="h-4 w-4" />
              <span>{isGeneratingVariant ? "生成中" : "生成场景图"}</span>
            </button>
            <button
              className={`btn-secondary image-preview-action disabled:cursor-not-allowed disabled:opacity-45 ${isEcommercePanelOpen ? "active" : ""}`}
              onClick={keepEcommercePanelOpen}
              onMouseEnter={keepEcommercePanelOpen}
              onMouseLeave={scheduleEcommercePanelClose}
              disabled={isGeneratingVariant || isEditing}
              title="生成电商长图"
              aria-expanded={isEcommercePanelOpen}
            >
              <ShoppingBag className="h-4 w-4" />
              <span>{isGeneratingVariant ? "生成中" : "生成电商长图"}</span>
            </button>
            <button
              className={`btn-secondary image-preview-action disabled:cursor-not-allowed disabled:opacity-45 ${isDivergenceOpen ? "active" : ""}`}
              onClick={keepDivergenceOpen}
              onMouseEnter={keepDivergenceOpen}
              onMouseLeave={scheduleDivergenceClose}
              disabled={isGeneratingVariant || isEditing || metadata?.generationType === "divergence"}
              title={metadata?.generationType === "divergence" ? "当前已是创意发散结果" : "创意发散"}
              aria-expanded={isDivergenceOpen}
            >
              <Sparkles className="h-4 w-4" />
              <span>{isGeneratingVariant ? "生成中" : "创意发散"}</span>
            </button>
            <button
              className={`btn-secondary image-preview-action disabled:cursor-not-allowed disabled:opacity-45 ${isVideoPanelOpen ? "active" : ""}`}
              onClick={keepVideoPanelOpen}
              onMouseEnter={keepVideoPanelOpen}
              onMouseLeave={scheduleVideoPanelClose}
              disabled={isGeneratingVariant || isEditing}
              title="生成视频"
              aria-expanded={isVideoPanelOpen}
            >
              <Clapperboard className="h-4 w-4" />
              <span>{isGeneratingVariant ? "生成中" : "生成视频"}</span>
            </button>
            <button
              className={`btn-secondary image-preview-action disabled:cursor-not-allowed disabled:opacity-45 ${isModelPanelOpen || modelGenerationPhase === "success" ? "active" : ""}`}
              onClick={keepModelPanelOpen}
              onMouseEnter={keepModelPanelOpen}
              onMouseLeave={scheduleModelPanelClose}
              disabled={isEditing}
              title="生成3D模型"
              aria-expanded={isModelPanelOpen}
            >
              {modelGenerationPhase === "uploading" || modelGenerationPhase === "generating"
                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                : <Box className="h-4 w-4" />}
              <span>
                {modelGenerationPhase === "success"
                  ? "3D模型"
                  : modelGenerationPhase === "uploading" || modelGenerationPhase === "generating"
                    ? "生成3D中"
                    : "生成3D模型"}
              </span>
            </button>
            <button
              className="btn-secondary image-preview-action"
              onClick={() => downloadDataUrl(result.imageBase64!, `${result.title}.png`)}
              title="下载"
            >
              <Download className="h-4 w-4" />
              <span>下载</span>
            </button>
            <button
              className="btn-secondary image-preview-action image-preview-delete"
              onClick={() => void onDelete?.(result)}
              disabled={isGeneratingVariant}
              title="删除图片"
            >
              <Trash2 className="h-4 w-4" />
              <span>删除</span>
            </button>
          </div>
          <button className="btn-secondary image-preview-close" onClick={onClose} title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <TripoModelViewer
          open={isModelViewerOpen}
          phase={modelGenerationPhase === "idle" ? "uploading" : modelGenerationPhase}
          progress={modelProgress}
          modelUrl={modelUrl || undefined}
          modelBlob={modelBlob}
          modelTaskId={modelTaskId || undefined}
          error={modelGenerationError || undefined}
          filename={`${result.title.trim().replace(/\s+/g, "-").toLowerCase() || "perdesign-model"}`}
          onClose={() => setIsModelViewerOpen(false)}
          onRetry={() => void startModelGeneration()}
        />

        {isEcommercePanelOpen && !isEditing ? (
          <section
            className="ecommerce-poster-panel"
            aria-label="电商长图设置"
            onMouseEnter={keepEcommercePanelOpen}
            onMouseLeave={scheduleEcommercePanelClose}
          >
            <div className="ecommerce-poster-panel-heading">
              <div>
                <strong>生成电商长图</strong>
                <span>补充希望重点呈现的卖点、场景、细节或使用方式</span>
              </div>
              <button
                type="button"
                className="divergence-panel-close"
                onClick={() => setIsEcommercePanelOpen(false)}
                title="收起"
                aria-label="收起电商长图设置"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
            <textarea
              className="ecommerce-poster-instruction"
              value={ecommerceInstruction}
              onChange={(event) => setEcommerceInstruction(event.target.value)}
              placeholder="例如：重点展示户外使用场景、旋钮操作和防滑细节，整体使用冷灰色科技风。"
              maxLength={600}
              rows={4}
              autoFocus
            />
            <div className="ecommerce-poster-panel-footer">
              <span>{ecommerceInstruction.length}/600</span>
              <button
                type="button"
                className="ecommerce-poster-submit"
                onClick={() => onGenerateEcommercePoster?.(result, ecommerceInstruction.trim())}
                disabled={isGeneratingVariant}
              >
                {isGeneratingVariant
                  ? <LoaderCircle className="h-4 w-4 animate-spin" />
                  : <SendHorizontal className="h-4 w-4" />}
                <span>{isGeneratingVariant ? "生成中" : "生成长图"}</span>
              </button>
            </div>
          </section>
        ) : null}

        {isModelPanelOpen && !isEditing ? (
          <section
            className="model-generation-panel"
            aria-label="3D模型设置"
            onMouseEnter={keepModelPanelOpen}
            onMouseLeave={scheduleModelPanelClose}
          >
            <div className="model-generation-panel-heading">
              <div>
                <strong>生成3D模型</strong>
                <span>当前方案作为正视图，可补充其他角度</span>
              </div>
              <button
                type="button"
                className="divergence-panel-close"
                onClick={() => setIsModelPanelOpen(false)}
                title="收起"
                aria-label="收起3D模型设置"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>

            <div className="model-view-front">
              <img src={result.imageBase64} alt="" aria-hidden="true" />
              <span>
                <strong>正视图</strong>
                <small>当前方案</small>
              </span>
            </div>

            <input
              ref={modelViewFileInputRef}
              className="hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => void readModelView(event.target.files?.[0])}
              tabIndex={-1}
              aria-hidden="true"
            />

            <div className="model-view-grid">
              {MODEL_VIEW_OPTIONS.map((view) => {
                const image = modelViews[view.key];
                return (
                  <div key={view.key} className={`model-view-slot ${image ? "has-image" : ""}`}>
                    <button
                      type="button"
                      className="model-view-upload"
                      onMouseEnter={() => {
                        hoveredModelViewRef.current = view.key;
                        keepModelPanelOpen();
                      }}
                      onMouseLeave={() => {
                        if (hoveredModelViewRef.current === view.key) hoveredModelViewRef.current = null;
                      }}
                      onClick={() => {
                        pendingModelViewRef.current = view.key;
                        modelViewFileInputRef.current?.click();
                      }}
                      title={`上传${view.label}`}
                    >
                      {image ? <img src={image.dataUrl} alt={view.label} /> : <Plus className="h-4 w-4" />}
                      <span>{view.label}</span>
                    </button>
                    {image ? (
                      <button
                        type="button"
                        className="model-view-remove"
                        onClick={() => {
                          setModelViews((current) => {
                            const next = { ...current };
                            delete next[view.key];
                            return next;
                          });
                        }}
                        title={`移除${view.label}`}
                        aria-label={`移除${view.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {modelViewUploadError ? <p className="model-view-error">{modelViewUploadError}</p> : null}

            <div className="model-generation-actions">
              {modelGenerationPhase === "success" && modelBlob ? (
                <button
                  type="button"
                  className="model-generation-secondary"
                  onClick={() => {
                    setIsModelPanelOpen(false);
                    setIsModelViewerOpen(true);
                  }}
                >
                  查看模型
                </button>
              ) : (
                <button
                  type="button"
                  className="model-generation-secondary"
                  onClick={() => void startModelGeneration(false)}
                  disabled={modelGenerationPhase === "uploading" || modelGenerationPhase === "generating"}
                >
                  单图生成
                </button>
              )}
              <button
                type="button"
                className="model-generation-primary"
                onClick={() => void startModelGeneration(true)}
                disabled={
                  modelGenerationPhase === "uploading" ||
                  modelGenerationPhase === "generating" ||
                  !Object.values(modelViews).some(Boolean)
                }
              >
                {modelGenerationPhase === "uploading" || modelGenerationPhase === "generating"
                  ? <LoaderCircle className="h-4 w-4 animate-spin" />
                  : <Rotate3D className="h-4 w-4" />}
                <span>多视图生成</span>
              </button>
            </div>
          </section>
        ) : null}

        {isVideoPanelOpen && !isEditing ? (
          <VideoGenerationPanel
            disabled={isGeneratingVariant}
            value={videoRequestDraft}
            onChange={setVideoRequestDraft}
            onClose={() => setIsVideoPanelOpen(false)}
            onMouseEnter={keepVideoPanelOpen}
            onMouseLeave={scheduleVideoPanelClose}
            onSubmit={(request) => onGenerateVideo?.(result, request)}
          />
        ) : null}

        {isDivergenceOpen && !isEditing ? (
          <section
            className="divergence-panel"
            aria-label="创意发散设置"
            onMouseEnter={keepDivergenceOpen}
            onMouseLeave={scheduleDivergenceClose}
          >
            <div className="divergence-panel-heading">
              <div>
                <strong>创意风格</strong>
                <span>已选 {divergenceStyleIds.length}/4，或上传风格参考图</span>
              </div>
              <button
                type="button"
                className="divergence-panel-close"
                onClick={() => setIsDivergenceOpen(false)}
                title="收起"
                aria-label="收起创意发散设置"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>

            <div className="divergence-style-grid" role="group" aria-label="创意风格多选">
              {DIVERGENCE_STYLES.map((style) => {
                const selected = divergenceStyleIds.includes(style.id);
                const disabled = !selected && divergenceStyleIds.length >= 4;
                return (
                  <button
                    key={style.id}
                    type="button"
                    className={`divergence-style-option ${selected ? "selected" : ""}`}
                    onClick={() => {
                      if (selected) {
                        setDivergenceStyleIds((current) => current.filter((styleId) => styleId !== style.id));
                      } else if (!disabled) {
                        setDivergenceStyleIds((current) => [...current, style.id]);
                      } else {
                        setDivergenceUploadError("最多选择 4 种创意风格。");
                        return;
                      }
                      setDivergenceReference(undefined);
                      setDivergenceUploadError("");
                    }}
                    aria-pressed={selected}
                    disabled={disabled}
                    title={`${style.label}：${style.description}`}
                  >
                    {style.label}
                  </button>
                );
              })}
            </div>

            <div className="divergence-or"><span>或</span></div>

            <input
              ref={divergenceFileInputRef}
              className="hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => void readDivergenceReference(event.target.files?.[0])}
              tabIndex={-1}
              aria-hidden="true"
            />

            {divergenceReference ? (
              <div className="divergence-reference">
                <img src={divergenceReference.dataUrl} alt="上传的风格参考图" />
                <button
                  type="button"
                  className="divergence-reference-copy"
                  onClick={openDivergenceFilePicker}
                >
                  <strong>{divergenceReference.name}</strong>
                  <span>风格参考图</span>
                </button>
                <button
                  type="button"
                  className="divergence-reference-remove"
                  onClick={() => setDivergenceReference(undefined)}
                  title="移除风格参考图"
                  aria-label="移除风格参考图"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="divergence-upload"
                onClick={openDivergenceFilePicker}
              >
                <UploadCloud className="h-5 w-5" />
                <span>
                  <strong>上传风格图</strong>
                  <small>PNG / JPG / WebP</small>
                </span>
              </button>
            )}

            {divergenceReference ? (
              <div className="divergence-reference-weight">
                <div className="divergence-reference-weight-heading">
                  <span>参考风格权重</span>
                  <strong>{divergenceReferenceWeight}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={divergenceReferenceWeight}
                  onChange={(event) => setDivergenceReferenceWeight(Number(event.target.value))}
                  aria-label="参考风格权重"
                />
                <div className="divergence-reference-weight-scale" aria-hidden="true">
                  <span>轻度参考</span>
                  <span>强风格跟随</span>
                </div>
              </div>
            ) : null}

            {divergenceUploadError ? <p className="divergence-upload-error">{divergenceUploadError}</p> : null}

            <button
              type="button"
              className="divergence-submit"
              onClick={submitDivergence}
              disabled={isGeneratingVariant || (!divergenceStyleIds.length && !divergenceReference) || !onGenerateDivergence}
            >
              {isGeneratingVariant ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              <span>{isGeneratingVariant ? "生成中" : "开始创意发散"}</span>
            </button>
          </section>
        ) : null}

        {isEditing ? (
          <div className="local-edit-tools" aria-label="局部修改工具栏">
            <div className="local-edit-tool-group">
              <button
                type="button"
                className={`local-edit-tool ${paintTool === "brush" ? "active" : ""}`}
                onClick={() => setPaintTool("brush")}
                title="画笔"
              >
                <Paintbrush className="h-4 w-4" />
                <span>画笔</span>
              </button>
              <button
                type="button"
                className={`local-edit-tool ${paintTool === "eraser" ? "active" : ""}`}
                onClick={() => setPaintTool("eraser")}
                title="橡皮擦"
              >
                <Eraser className="h-4 w-4" />
                <span>橡皮擦</span>
              </button>
            </div>
            <label className="local-edit-size">
              <span>画笔大小</span>
              <input
                type="range"
                min="12"
                max="120"
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
              />
              <span>{brushSize}</span>
            </label>
            <div className="local-edit-tool-group">
              <button type="button" className="local-edit-icon" onClick={undoMask} disabled={!historyCount} title="撤销">
                <RotateCcw className="h-4 w-4" />
              </button>
              <button type="button" className="local-edit-icon" onClick={clearMask} disabled={!hasMask} title="清空涂抹">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        <div className="image-preview-main">
          <div className="image-preview-canvas-wrap">
            <img
              src={result.imageBase64}
              alt={result.title}
              className={`image-preview-image ${isEditing ? "" : "image-file-draggable"} ${canZoomEcommercePoster ? "ecommerce-poster-zoomable" : ""}`}
              onClick={() => {
                if (canZoomEcommercePoster) setIsPosterZoomOpen(true);
              }}
              onLoad={(event) => initializeCanvas(event.currentTarget)}
              draggable={!isEditing}
              onDragStart={(event) => {
                if (isEditing) {
                  event.preventDefault();
                  return;
                }
                const filename = `${result.title.trim().replace(/\s+/g, "-").toLowerCase() || "perdesign-image"}.png`;
                dragObjectUrlRef.current = prepareImageFileDrag(event.dataTransfer, result.imageBase64!, filename);
              }}
              onDragEnd={() => {
                releaseImageFileDrag(dragObjectUrlRef.current);
                dragObjectUrlRef.current = null;
              }}
            />
            <canvas
              ref={canvasRef}
              className={`local-edit-canvas ${isEditing ? "active" : ""}`}
              onPointerDown={startDrawing}
              onPointerEnter={updateBrushCursor}
              onPointerMove={continueDrawing}
              onPointerUp={stopDrawing}
              onPointerCancel={(event) => {
                hideBrushCursor();
                stopDrawing(event);
              }}
              onPointerLeave={(event) => {
                hideBrushCursor();
                if (event.buttons === 0) stopDrawing(event);
              }}
            />
            {isEditing ? (
              <div
                ref={brushCursorRef}
                className={`local-edit-brush-cursor ${paintTool}`}
                style={{ width: brushSize, height: brushSize }}
                aria-hidden="true"
              />
            ) : null}
            {canSelectDivergenceQuadrant ? (
              <>
                <div className="divergence-quadrant-overlay" aria-label="选择需要放大的创意方案">
                  {DIVERGENCE_QUADRANTS.map((position) => (
                    <button
                      key={position}
                      type="button"
                      className={`divergence-quadrant-hit ${selectedDivergenceQuadrant === position ? "selected" : ""}`}
                      onClick={() => setSelectedDivergenceQuadrant(position)}
                      aria-label={`选择${position}象限方案`}
                      aria-pressed={selectedDivergenceQuadrant === position}
                      disabled={isGeneratingVariant}
                    />
                  ))}
                </div>
                {selectedDivergenceQuadrantIndex >= 0 ? (
                  <button
                    type="button"
                    className={`divergence-quadrant-extract position-${selectedDivergenceQuadrantIndex}`}
                    onClick={extractDivergenceQuadrant}
                    disabled={isGeneratingVariant || !onGenerateFromPrompt}
                    title={`放大并单独生成${selectedDivergenceQuadrant}象限方案`}
                  >
                    {isGeneratingVariant ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                    <span>{isGeneratingVariant ? "生成中" : "放大方案"}</span>
                  </button>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="image-preview-sidebar">
            <section className="image-preview-design-card" aria-label="设计说明">
              <div className="image-preview-design-heading">
                <span><FileText className="h-4 w-4" />设计说明</span>
                <div className="image-preview-design-actions">
                  {designDescription ? (
                    <button
                      type="button"
                      className="image-preview-copy-button"
                      onClick={() => void copyDesignDescription()}
                      title={hasCopiedDescription ? "已复制" : "复制设计说明"}
                      aria-label={hasCopiedDescription ? "已复制" : "复制设计说明"}
                    >
                      {hasCopiedDescription ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void generateDescription()}
                    disabled={isGeneratingDesignDescription || !onGenerateDesignDescription}
                  >
                    {isGeneratingDesignDescription ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                    {isGeneratingDesignDescription ? "生成中" : designDescription ? "重新生成" : "生成"}
                  </button>
                </div>
              </div>
              {designDescription ? (
                <div className="image-preview-design-content">{designDescription}</div>
              ) : (
                <p className={designDescriptionError ? "error" : ""}>
                  {designDescriptionError || "根据当前产品图生成可用于提案与详情页的专业设计说明。"}
                </p>
              )}
            </section>

            <aside className="image-preview-info" aria-label="生成信息">
              <div className="image-preview-info-heading">
                <span>生成信息</span>
                <strong>{result.title}</strong>
              </div>

              {metadata?.generationType === "divergence" && metadata.divergenceStyles?.length ? (
                <section className="image-preview-info-section">
                  <span className="image-preview-info-label">创意风格</span>
                  <div className="image-preview-quadrant-grid" aria-label="四象限创意风格">
                    {metadata.divergenceStyles.slice(0, 4).map((style, index) => (
                      <div className="image-preview-quadrant-item" key={`${index}-${style}`}>
                        <span>{["左上", "右上", "左下", "右下"][index]}</span>
                        <strong>{style}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {!hidesDescription ? (
                <section className="image-preview-info-section">
                  <span className="image-preview-info-label">文字描述</span>
                  <p className={`image-preview-description ${isSourceDescriptionExpanded ? "expanded" : ""}`}>
                    {savedDescription || "历史记录未保存"}
                  </p>
                  {canCollapseDescription ? (
                    <button
                      type="button"
                      className="image-preview-description-toggle"
                      onClick={() => setIsSourceDescriptionExpanded((current) => !current)}
                      title={isSourceDescriptionExpanded ? "收起文字描述" : "展开文字描述"}
                    >
                      {isSourceDescriptionExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {isSourceDescriptionExpanded ? "收起" : "展开"}
                    </button>
                  ) : null}
                </section>
              ) : null}

              <section className="image-preview-info-section">
                <div className="image-preview-info-row">
                  <span className="image-preview-info-label">创新度</span>
                  <strong>{hasInnovationValue ? `${metadata!.innovationLevel}%` : metadata ? "-" : "未记录"}</strong>
                </div>
                {hasInnovationValue ? (
                  <div className="image-preview-innovation-track">
                    <span style={{ width: `${metadata!.innovationLevel}%` }} />
                  </div>
                ) : null}
              </section>

              <section className="image-preview-info-section">
                <span className="image-preview-info-label">输入图片</span>
                <div className="image-preview-source-grid">
                  <SourceImagePreview label="草图" image={metadata?.sketchImage} />
                  <SourceImagePreview label="产品图" image={metadata?.productImage} />
                  {recordedReferenceImages.length
                    ? recordedReferenceImages.map((image, index) => (
                        <SourceImagePreview
                          key={`${image.name}-${index}`}
                          label={recordedReferenceImages.length > 1 ? `参考图 ${index + 1}` : "参考图"}
                          image={image}
                        />
                      ))
                    : <SourceImagePreview label="参考图" />}
                </div>
              </section>
            </aside>
          </div>
        </div>

        {isPosterZoomOpen && canZoomEcommercePoster ? (
          <div
            className="ecommerce-poster-zoom-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="电商长图放大预览"
            onClick={() => setIsPosterZoomOpen(false)}
          >
            <button
              type="button"
              className="btn-secondary ecommerce-poster-zoom-close"
              onClick={() => setIsPosterZoomOpen(false)}
              title="关闭放大预览"
              aria-label="关闭放大预览"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={result.imageBase64}
              alt={`${result.title} 放大预览`}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        ) : null}

        {isEditing ? (
          <div className="local-edit-composer">
            <input
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) void submitLocalEdit();
              }}
              placeholder="描述涂抹区域需要修改成什么"
              aria-label="局部修改要求"
            />
            <button
              type="button"
              className="local-edit-submit"
              onClick={() => void submitLocalEdit()}
              disabled={!hasMask || !instruction.trim() || isGeneratingVariant}
              title="生成局部修改方案"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="image-prompt-composer-wrap">
            <div className="local-edit-composer image-prompt-composer">
              <input
                ref={imagePromptFileInputRef}
                className="image-prompt-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(event) => void readImagePromptReferences(Array.from(event.target.files || []))}
                tabIndex={-1}
                aria-hidden="true"
              />
              {imagePromptReferences.length ? (
                <div
                  className="image-prompt-reference-stack"
                  style={{ width: `${38 + (imagePromptReferences.length - 1) * 11}px` }}
                  aria-label={`已上传 ${imagePromptReferences.length} 张参考图`}
                >
                  {imagePromptReferences.map((image, index) => {
                    const centerIndex = (imagePromptReferences.length - 1) / 2;
                    return (
                      <div
                        key={`${image.name}-${index}`}
                        className="image-prompt-reference-card"
                        style={{
                          left: `${2 + index * 11}px`,
                          top: `${Math.abs(index - centerIndex)}px`,
                          transform: `rotate(${(index - centerIndex) * 7}deg)`,
                          zIndex: index + 1
                        }}
                        title={image.name}
                      >
                        <img src={image.dataUrl} alt={`参考图 ${index + 1}`} />
                        <button
                          type="button"
                          className="image-prompt-reference-remove"
                          onClick={() => setImagePromptReferences((current) => current.filter((_, imageIndex) => imageIndex !== index))}
                          title={`移除参考图 ${index + 1}`}
                          aria-label={`移除参考图 ${index + 1}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {imagePromptReferences.length < 3 ? (
                <button
                  type="button"
                  className="image-prompt-upload-button"
                  onClick={() => imagePromptFileInputRef.current?.click()}
                  disabled={isGeneratingVariant}
                  title={imagePromptReferences.length ? "继续添加参考图" : "上传参考图"}
                  aria-label={imagePromptReferences.length ? "继续添加参考图" : "上传参考图"}
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
              <input
                value={imagePrompt}
                onChange={(event) => setImagePrompt(event.target.value)}
                onPaste={pasteImagePromptReference}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) submitImagePrompt();
                }}
                placeholder="描述你想基于这张图片生成什么"
                aria-label="图片生成文字描述"
              />
              <button
                type="button"
                className="local-edit-submit"
                onClick={submitImagePrompt}
                disabled={!imagePrompt.trim() || isGeneratingVariant || !onGenerateFromPrompt}
                title="发送图片与文字描述"
              >
                {isGeneratingVariant ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              </button>
            </div>
            {imagePromptUploadError ? <p className="image-prompt-upload-error">{imagePromptUploadError}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceImagePreview({ label, image }: { label: string; image?: GenerationSourceImage }) {
  return (
    <div className="image-preview-source">
      <span>{label}</span>
      {image ? (
        <>
          <img src={image.dataUrl} alt={label} />
          <small title={image.name}>{image.name}</small>
        </>
      ) : (
        <div className="image-preview-source-empty">未使用</div>
      )}
    </div>
  );
}
