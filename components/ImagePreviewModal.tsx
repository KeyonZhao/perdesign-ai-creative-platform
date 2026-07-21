"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Download, Eraser, FileText, LoaderCircle, Mountain, Paintbrush, Rotate3D, RotateCcw, SendHorizontal, Trash2, X } from "lucide-react";
import type { GenerationMetadata, GenerationResult, GenerationSourceImage } from "@/lib/types";
import { downloadDataUrl, prepareImageFileDrag, releaseImageFileDrag } from "@/lib/image";

type ImagePreviewModalProps = {
  isGeneratingVariant?: boolean;
  isGeneratingDesignDescription?: boolean;
  onGenerateMultiView?: (result: GenerationResult) => void;
  onGenerateScene?: (result: GenerationResult) => void;
  onGenerateDesignDescription?: (result: GenerationResult) => Promise<string>;
  onLocalEdit?: (result: GenerationResult, maskImageBase64: string, instruction: string) => void;
  startEditing?: boolean;
  metadata?: GenerationMetadata | null;
  result: GenerationResult | null;
  onClose: () => void;
};

type PaintTool = "brush" | "eraser";
type MaskSnapshot = { imageData: ImageData; hadMask: boolean };
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
  onGenerateDesignDescription,
  onLocalEdit,
  startEditing = false,
  metadata,
  isGeneratingVariant = false,
  isGeneratingDesignDescription = false
}: ImagePreviewModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<MaskSnapshot[]>([]);
  const dragObjectUrlRef = useRef<string | null>(null);
  const activeResultIdRef = useRef(result?.id);
  const [isEditing, setIsEditing] = useState(false);
  const [paintTool, setPaintTool] = useState<PaintTool>("brush");
  const [brushSize, setBrushSize] = useState(42);
  const [instruction, setInstruction] = useState("");
  const [hasMask, setHasMask] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [designDescription, setDesignDescription] = useState(result?.designDescription || "");
  const [designDescriptionError, setDesignDescriptionError] = useState("");
  const [hasCopiedDescription, setHasCopiedDescription] = useState(false);
  const [isSourceDescriptionExpanded, setIsSourceDescriptionExpanded] = useState(false);

  activeResultIdRef.current = result?.id;

  useEffect(() => {
    setIsEditing(startEditing);
    setPaintTool("brush");
    setInstruction("");
    setHasMask(false);
    historyRef.current = [];
    setHistoryCount(0);
    setDesignDescription(result?.designDescription || "");
    setDesignDescriptionError("");
    setHasCopiedDescription(false);
    setIsSourceDescriptionExpanded(false);
  }, [result?.designDescription, result?.id, startEditing]);

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
    savedDescription === LEGACY_SCENE_PROMPT ||
    savedDescription === LEGACY_MULTI_VIEW_PROMPT;
  const canCollapseDescription = savedDescription.length > 88;

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
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = paintCanvas.width;
    maskCanvas.height = paintCanvas.height;
    const maskContext = maskCanvas.getContext("2d");
    if (!maskContext) return null;

    const maskData = maskContext.createImageData(maskCanvas.width, maskCanvas.height);
    let selectedPixelCount = 0;
    for (let index = 0; index < paintData.data.length; index += 4) {
      const selected = paintData.data[index + 3] > 0;
      maskData.data[index] = 0;
      maskData.data[index + 1] = 0;
      maskData.data[index + 2] = 0;
      maskData.data[index + 3] = selected ? 0 : 255;
      if (selected) selectedPixelCount += 1;
    }
    if (!selectedPixelCount) return null;
    maskContext.putImageData(maskData, 0, 0);
    return maskCanvas.toDataURL("image/png");
  }

  function submitLocalEdit() {
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) return;
    const maskImageBase64 = createMaskDataUrl();
    if (!maskImageBase64) return;
    onLocalEdit?.(result!, maskImageBase64, trimmedInstruction);
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

  return (
    <div className="image-preview-backdrop" onClick={onClose}>
      <div className={`image-preview-dialog ${isEditing ? "editing" : ""}`} onClick={(event) => event.stopPropagation()}>
        <div className="image-preview-toolbar">
          <div className="image-preview-toolbar-actions">
            <button
              className={`btn-secondary image-preview-action ${isEditing ? "active" : ""}`}
              onClick={() => setIsEditing((current) => !current)}
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
              className="btn-secondary image-preview-action"
              onClick={() => downloadDataUrl(result.imageBase64!, `${result.title}.png`)}
              title="下载"
            >
              <Download className="h-4 w-4" />
              <span>下载</span>
            </button>
          </div>
          <button className="btn-secondary image-preview-close" onClick={onClose} title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

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
              className={`image-preview-image ${isEditing ? "" : "image-file-draggable"}`}
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
              onPointerMove={continueDrawing}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              onPointerLeave={(event) => {
                if (event.buttons === 0) stopDrawing(event);
              }}
            />
          </div>

          <div className="image-preview-sidebar">
            <aside className="image-preview-info" aria-label="生成信息">
              <div className="image-preview-info-heading">
                <span>生成信息</span>
                <strong>{result.title}</strong>
              </div>

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
                  <strong>{metadata ? `${metadata.innovationLevel}%` : "未记录"}</strong>
                </div>
                {metadata ? (
                  <div className="image-preview-innovation-track">
                    <span style={{ width: `${metadata.innovationLevel}%` }} />
                  </div>
                ) : null}
              </section>

              <section className="image-preview-info-section">
                <span className="image-preview-info-label">输入图片</span>
                <div className="image-preview-source-grid">
                  <SourceImagePreview label="产品图" image={metadata?.productImage} />
                  <SourceImagePreview label="参考图" image={metadata?.referenceImage} />
                </div>
              </section>
            </aside>

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
          </div>
        </div>

        {isEditing ? (
          <div className="local-edit-composer">
            <input
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) submitLocalEdit();
              }}
              placeholder="描述涂抹区域需要修改成什么"
              aria-label="局部修改要求"
            />
            <button
              type="button"
              className="local-edit-submit"
              onClick={submitLocalEdit}
              disabled={!hasMask || !instruction.trim() || isGeneratingVariant}
              title="生成局部修改方案"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </div>
        ) : null}
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
