"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  FileCode2,
  FileUp,
  Grid3X3,
  Lock,
  RotateCcw,
  Trash2,
  Unlock
} from "lucide-react";

type HoleShape = "circle" | "rectangle" | "polygon" | "star" | "slot" | "svg";
type LayoutMode = "grid" | "honeycomb" | "hex-tiling" | "radial" | "spiral" | "fibonacci";
type PanelShape = "rectangle" | "circle" | "polygon" | "custom";
type GradientMode = "none" | "line" | "radial" | "horizontal" | "vertical" | "diagonal" | "angle" | "wave" | "point";
type DensityMode = "none" | "center-dense" | "edge-dense" | "gradient";
type MaskMode = "only" | "exclude" | "larger" | "smaller";
type MaskFit = "contain" | "cover" | "stretch";

type VentParams = {
  holeShape: HoleShape;
  layout: LayoutMode;
  panelShape: PanelShape;
  panelWidth: number;
  panelHeight: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  holeSize: number;
  holeHeight: number;
  pitchX: number;
  pitchY: number;
  rows: number;
  columns: number;
  sides: number;
  starPoints: number;
  starInnerRatio: number;
  svgShapeScale: number;
  holeRotation: number;
  layoutRotation: number;
  gradient: GradientMode;
  gradientMin: number;
  gradientMax: number;
  gradientAngle: number;
  waveAmplitude: number;
  waveFrequency: number;
  reverseGradient: boolean;
  density: DensityMode;
  densityStrength: number;
  maskMode: MaskMode;
  maskFit: MaskFit;
  maskThreshold: number;
  maskStrength: number;
  maskInvert: boolean;
  safe: boolean;
};

type HoleItem =
  | { kind: "circle"; x: number; y: number; size: number; rotation: number }
  | { kind: "polygon"; x: number; y: number; size: number; rotation: number; points: Array<[number, number]> }
  | { kind: "compound"; x: number; y: number; size: number; rotation: number; contours: Array<Array<[number, number]>> };

type ImportedSvgShape = {
  name: string;
  contours: Array<Array<[number, number]>>;
};

type PngMask = {
  name: string;
  width: number;
  height: number;
  scores: Uint8Array;
  previewUrl: string;
  usesAlpha: boolean;
};

type NormalizedPoint = {
  x: number;
  y: number;
};

type GradientAxis = {
  start: NormalizedPoint;
  end: NormalizedPoint;
};

const MAX_HOLE_COUNT = 120_000;

const defaults: VentParams = {
  holeShape: "circle",
  layout: "grid",
  panelShape: "rectangle",
  panelWidth: 180,
  panelHeight: 100,
  marginLeft: 10,
  marginRight: 10,
  marginTop: 10,
  marginBottom: 10,
  holeSize: 4,
  holeHeight: 4,
  pitchX: 8,
  pitchY: 8,
  rows: 0,
  columns: 0,
  sides: 6,
  starPoints: 5,
  starInnerRatio: 45,
  svgShapeScale: 1,
  holeRotation: 0,
  layoutRotation: 0,
  gradient: "none",
  gradientMin: 1.5,
  gradientMax: 4,
  gradientAngle: 0,
  waveAmplitude: 30,
  waveFrequency: 2,
  reverseGradient: false,
  density: "none",
  densityStrength: 60,
  maskMode: "only",
  maskFit: "contain",
  maskThreshold: 12,
  maskStrength: 50,
  maskInvert: false,
  safe: true
};

const holeShapeOptions: Array<{ value: HoleShape; label: string }> = [
  { value: "circle", label: "圆形" },
  { value: "rectangle", label: "矩形" },
  { value: "polygon", label: "正多边形" },
  { value: "star", label: "星形" },
  { value: "slot", label: "长圆孔" },
  { value: "svg", label: "导入 SVG 线框" }
];

const layoutOptions: Array<{ value: LayoutMode; label: string }> = [
  { value: "grid", label: "网格排列" },
  { value: "honeycomb", label: "蜂窝错位" },
  { value: "hex-tiling", label: "六边形蜂窝阵列" },
  { value: "radial", label: "同心圆排列" },
  { value: "spiral", label: "螺旋排列" },
  { value: "fibonacci", label: "斐波那契排列" }
];

const gradientOptions: Array<{ value: GradientMode; label: string }> = [
  { value: "none", label: "无渐变" },
  { value: "line", label: "画布渐变线" },
  { value: "radial", label: "中心径向" },
  { value: "diagonal", label: "对角线" },
  { value: "angle", label: "角度方向" },
  { value: "wave", label: "波浪" },
  { value: "point", label: "画布点渐变" }
];

const densityOptions: Array<{ value: DensityMode; label: string }> = [
  { value: "none", label: "无密度变化" },
  { value: "center-dense", label: "中心密、边缘疏" },
  { value: "edge-dense", label: "边缘密、中心疏" },
  { value: "gradient", label: "沿渐变方向疏密" }
];

const maskModeOptions: Array<{ value: MaskMode; label: string }> = [
  { value: "only", label: "仅内容区域有孔" },
  { value: "exclude", label: "内容区域无孔" },
  { value: "larger", label: "内容区域孔变大" },
  { value: "smaller", label: "内容区域孔变小" }
];

const maskFitOptions: Array<{ value: MaskFit; label: string }> = [
  { value: "contain", label: "完整适配面板" },
  { value: "cover", label: "铺满面板" },
  { value: "stretch", label: "拉伸到面板" }
];

export function VentEditor() {
  const [params, setParams] = useState<VentParams>(defaults);
  const [gradientPoint, setGradientPoint] = useState({ x: 0.5, y: 0.5 });
  const [gradientAxis, setGradientAxis] = useState<GradientAxis>({
    start: { x: 0.25, y: 0.5 },
    end: { x: 0.75, y: 0.5 }
  });
  const [maskPosition, setMaskPosition] = useState<NormalizedPoint>({ x: 0.5, y: 0.5 });
  const [maskScale, setMaskScale] = useState(1);
  const [maskSelected, setMaskSelected] = useState(false);
  const [maskSnapAxes, setMaskSnapAxes] = useState({ x: false, y: false });
  const [importedSvgShape, setImportedSvgShape] = useState<ImportedSvgShape | null>(null);
  const [svgImportError, setSvgImportError] = useState("");
  const [importedPanelShape, setImportedPanelShape] = useState<ImportedSvgShape | null>(null);
  const [panelSvgImportError, setPanelSvgImportError] = useState("");
  const [pngMask, setPngMask] = useState<PngMask | null>(null);
  const [pngMaskError, setPngMaskError] = useState("");
  const [marginSelected, setMarginSelected] = useState(false);
  const [holeDetailsOpen, setHoleDetailsOpen] = useState(false);
  const [openMetricLock, setOpenMetricLock] = useState<"size" | "density">("density");
  const previewRef = useRef<SVGSVGElement | null>(null);
  const marginInputRef = useRef<HTMLInputElement | null>(null);
  const marginDraggingRef = useRef(false);
  const marginDraggingSideRef = useRef<"left" | "right" | "top" | "bottom">("top");
  const maskDraggingRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPosition: NormalizedPoint;
  } | null>(null);
  const gradientAxisDraggingRef = useRef<{
    kind: "start" | "end" | "line";
    startClientX: number;
    startClientY: number;
    axis: GradientAxis;
  } | null>(null);
  const svgFileInputRef = useRef<HTMLInputElement | null>(null);
  const panelSvgFileInputRef = useRef<HTMLInputElement | null>(null);
  const pngMaskInputRef = useRef<HTMLInputElement | null>(null);

  const panelOutline = useMemo(
    () => makePanelOutline(params, importedPanelShape?.contours[0]),
    [importedPanelShape, params]
  );
  const holes = useMemo(
    () => createHoles(params, gradientPoint, gradientAxis, importedSvgShape?.contours, pngMask, maskPosition, maskScale, panelOutline),
    [gradientAxis, gradientPoint, importedSvgShape, maskPosition, maskScale, panelOutline, params, pngMask]
  );
  const holePreviewPath = useMemo(() => buildHolePreviewPath(holes), [holes]);
  const maskBounds = useMemo(
    () => (pngMask ? getPngMaskBounds(params, pngMask, maskPosition, maskScale) : null),
    [maskPosition, maskScale, params, pngMask]
  );
  const maskBaseBounds = useMemo(
    () => (pngMask ? getPngMaskBounds(params, pngMask, maskPosition, 1) : null),
    [maskPosition, params, pngMask]
  );
  const openArea = useMemo(() => holes.reduce((sum, item) => sum + itemArea(item), 0), [holes]);
  const panelArea = useMemo(() => polygonArea(panelOutline), [panelOutline]);
  const openRate = panelArea > 0 ? (openArea / panelArea) * 100 : 0;
  const maximumLeftMargin = Math.max(0, params.panelWidth - params.marginRight - 0.5);
  const maximumRightMargin = Math.max(0, params.panelWidth - params.marginLeft - 0.5);
  const maximumTopMargin = Math.max(0, params.panelHeight - params.marginBottom - 0.5);
  const maximumBottomMargin = Math.max(0, params.panelHeight - params.marginTop - 0.5);
  const holeDensity = densityLevelFromParams(params);
  const gradientAxisAngle = normalizeDegrees(Math.atan2(
    (gradientAxis.end.y - gradientAxis.start.y) * params.panelHeight,
    (gradientAxis.end.x - gradientAxis.start.x) * params.panelWidth
  ) * 180 / Math.PI);

  useEffect(() => {
    if (!marginSelected) return;
    const frame = window.requestAnimationFrame(() => {
      marginInputRef.current?.focus();
      marginInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [marginSelected]);

  function patch<K extends keyof VentParams>(key: K, value: VentParams[K]) {
    setParams((current) => ({ ...current, [key]: value }));
  }

  function updateLayout(value: LayoutMode) {
    setParams((current) => value === "hex-tiling"
      ? {
          ...current,
          layout: value,
          holeShape: "polygon",
          sides: 6,
          holeRotation: 0,
          pitchX: roundToHalf(Math.max(0.5, current.holeSize * 0.95)),
          pitchY: roundToHalf(Math.max(0.5, current.holeSize * 1.1))
        }
      : { ...current, layout: value });
  }

  function updateHoleSize(value: number) {
    setParams((current) => ({
      ...current,
      holeSize: value,
      gradientMax: value
    }));
  }

  function updateGradientMode(value: GradientMode) {
    setParams((current) => ({
      ...current,
      gradient: value,
      gradientMax: value === "none" ? current.gradientMax : current.holeSize,
      reverseGradient: value === "line" ? false : current.reverseGradient
    }));
  }

  function updateGradientMaximum(value: number) {
    setParams((current) => ({
      ...current,
      gradientMax: value,
      holeSize: value
    }));
  }

  function updateHoleDensity(value: number) {
    setParams((current) => {
      const bounds = densityPitchBounds(current);
      const spacingRatio = 1 - clamp(value, 0, 100) / 100;
      return {
        ...current,
        pitchX: roundToHalf(bounds.minimumX + (bounds.maximumX - bounds.minimumX) * spacingRatio),
        pitchY: roundToHalf(bounds.minimumY + (bounds.maximumY - bounds.minimumY) * spacingRatio)
      };
    });
  }

  function updatePanelDimension(key: "panelWidth" | "panelHeight", value: number) {
    const dimension = clamp(value, 1, 5000);
    setParams((current) => {
      const panelWidth = key === "panelWidth" ? dimension : current.panelWidth;
      const panelHeight = key === "panelHeight" ? dimension : current.panelHeight;
      const [marginLeft, marginRight] = fitMarginPair(current.marginLeft, current.marginRight, panelWidth);
      const [marginTop, marginBottom] = fitMarginPair(current.marginTop, current.marginBottom, panelHeight);
      return {
        ...current,
        [key]: dimension,
        marginLeft,
        marginRight,
        marginTop,
        marginBottom
      };
    });
  }

  function updateTargetOpenArea(targetArea: number) {
    if (!holes.length || openArea <= 0 || panelArea <= 0) return;
    const safeTarget = clamp(targetArea, panelArea * 0.0001, panelArea * 0.95);
    const scale = Math.sqrt(safeTarget / openArea);
    const maximumSize = Math.max(params.panelWidth, params.panelHeight);
    const scaled = (value: number) => Number(clamp(value * scale, 0.05, maximumSize).toFixed(3));

    if (openMetricLock === "size") {
      const pitchScale = Math.sqrt(openArea / safeTarget);
      const maximumPitch = Math.max(params.panelWidth, params.panelHeight) * 2;
      const scaledPitch = (value: number) => Number(clamp(value * pitchScale, 0.5, maximumPitch).toFixed(3));
      setParams((current) => ({
        ...current,
        pitchX: scaledPitch(current.pitchX),
        pitchY: scaledPitch(current.pitchY),
        rows: 0,
        columns: 0
      }));
      return;
    }

    setParams((current) => ({
      ...current,
      holeSize: scaled(current.holeSize),
      holeHeight: scaled(current.holeHeight),
      gradientMin: scaled(current.gradientMin),
      gradientMax: scaled(current.gradientMax)
    }));
  }

  async function importSvgShape(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setSvgImportError("");
    try {
      const contours = await parseSvgOutline(file, "孔型", true);
      setImportedSvgShape({ name: file.name, contours });
      setParams((current) => ({ ...current, holeShape: "svg" }));
    } catch (error) {
      setImportedSvgShape(null);
      setSvgImportError(error instanceof Error ? error.message : "无法读取这个 SVG 文件。");
    } finally {
      if (svgFileInputRef.current) svgFileInputRef.current.value = "";
    }
  }

  function clearSvgShape() {
    setImportedSvgShape(null);
    setSvgImportError("");
    setParams((current) => ({
      ...current,
      holeShape: current.holeShape === "svg" ? "circle" : current.holeShape
    }));
  }

  async function importPanelSvgShape(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setPanelSvgImportError("");
    try {
      const contours = await parseSvgOutline(file, "面板轮廓", false);
      setImportedPanelShape({ name: file.name, contours });
      setParams((current) => ({ ...current, panelShape: "custom" }));
    } catch (error) {
      setImportedPanelShape(null);
      setPanelSvgImportError(error instanceof Error ? error.message : "无法读取这个 SVG 面板轮廓。");
    } finally {
      if (panelSvgFileInputRef.current) panelSvgFileInputRef.current.value = "";
    }
  }

  function clearPanelSvgShape() {
    setImportedPanelShape(null);
    setPanelSvgImportError("");
    setParams((current) => ({
      ...current,
      panelShape: current.panelShape === "custom" ? "rectangle" : current.panelShape
    }));
  }

  async function importPngMask(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setPngMaskError("");
    try {
      const mask = await decodePngMask(file);
      setPngMask(mask);
      setMaskPosition({ x: 0.5, y: 0.5 });
      setMaskScale(1);
      setMaskSelected(true);
      setMaskSnapAxes({ x: false, y: false });
    } catch (error) {
      setPngMask(null);
      setMaskSelected(false);
      setMaskSnapAxes({ x: false, y: false });
      setPngMaskError(error instanceof Error ? error.message : "无法读取这张 PNG 图片。");
    } finally {
      if (pngMaskInputRef.current) pngMaskInputRef.current.value = "";
    }
  }

  function clearPngMask() {
    setPngMask(null);
    setMaskPosition({ x: 0.5, y: 0.5 });
    setMaskScale(1);
    setMaskSelected(false);
    setMaskSnapAxes({ x: false, y: false });
    setPngMaskError("");
  }

  function updateGradientPoint(event: React.PointerEvent<SVGSVGElement>) {
    if (params.gradient !== "point") return;
    const svg = previewRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setGradientPoint({
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
    });
  }

  function startGradientAxisDragging(
    event: React.PointerEvent<SVGGElement | SVGCircleElement | SVGLineElement>,
    kind: "start" | "end" | "line"
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gradientAxisDraggingRef.current = {
      kind,
      startClientX: event.clientX,
      startClientY: event.clientY,
      axis: gradientAxis
    };
  }

  function dragGradientAxis(event: React.PointerEvent<SVGGElement>) {
    const drag = gradientAxisDraggingRef.current;
    const svg = previewRef.current;
    if (!drag || !svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - drag.startClientX) / rect.width;
    const dy = (event.clientY - drag.startClientY) / rect.height;
    if (drag.kind === "start" || drag.kind === "end") {
      const moving = {
        x: drag.axis[drag.kind].x + dx,
        y: drag.axis[drag.kind].y + dy
      };
      const anchor = drag.axis[drag.kind === "start" ? "end" : "start"];
      const physicalDx = (moving.x - anchor.x) * params.panelWidth;
      const physicalDy = (moving.y - anchor.y) * params.panelHeight;
      const distance = Math.hypot(physicalDx, physicalDy);
      const rawAngle = Math.atan2(physicalDy, physicalDx);
      const snapStep = Math.PI / 4;
      const snappedAngle = Math.round(rawAngle / snapStep) * snapStep;
      const snapThreshold = 4 * Math.PI / 180;
      const angularDifference = Math.abs(Math.atan2(Math.sin(rawAngle - snappedAngle), Math.cos(rawAngle - snappedAngle)));
      const angle = angularDifference <= snapThreshold ? snappedAngle : rawAngle;
      const nextPoint = distance > 0
        ? {
            x: anchor.x + Math.cos(angle) * distance / params.panelWidth,
            y: anchor.y + Math.sin(angle) * distance / params.panelHeight
          }
        : moving;
      setGradientAxis({
        ...drag.axis,
        [drag.kind]: nextPoint
      });
      return;
    }
    setGradientAxis({
      start: { x: drag.axis.start.x + dx, y: drag.axis.start.y + dy },
      end: { x: drag.axis.end.x + dx, y: drag.axis.end.y + dy }
    });
  }

  function updateGradientAxisAngle(value: number) {
    const radians = normalizeDegrees(value) * Math.PI / 180;
    const center = {
      x: (gradientAxis.start.x + gradientAxis.end.x) / 2,
      y: (gradientAxis.start.y + gradientAxis.end.y) / 2
    };
    const length = Math.hypot(
      (gradientAxis.end.x - gradientAxis.start.x) * params.panelWidth,
      (gradientAxis.end.y - gradientAxis.start.y) * params.panelHeight
    );
    const halfX = Math.cos(radians) * length / 2 / params.panelWidth;
    const halfY = Math.sin(radians) * length / 2 / params.panelHeight;
    setGradientAxis({
      start: { x: center.x - halfX, y: center.y - halfY },
      end: { x: center.x + halfX, y: center.y + halfY }
    });
  }

  function stopGradientAxisDragging(event: React.PointerEvent<SVGGElement>) {
    if (!gradientAxisDraggingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    gradientAxisDraggingRef.current = null;
  }

  function marginFromPointer(event: React.PointerEvent<SVGGElement>, side = marginDraggingSideRef.current) {
    const svg = previewRef.current;
    if (!svg) return getMarginForSide(params, side);
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return getMarginForSide(params, side);
    const x = ((event.clientX - rect.left) / rect.width) * params.panelWidth;
    const y = ((event.clientY - rect.top) / rect.height) * params.panelHeight;
    const value = side === "left" ? x : side === "right" ? params.panelWidth - x : side === "top" ? y : params.panelHeight - y;
    const maximum = side === "left"
      ? maximumLeftMargin
      : side === "right"
        ? maximumRightMargin
        : side === "top"
          ? maximumTopMargin
          : maximumBottomMargin;
    return clamp(Math.round(value * 2) / 2, 0, maximum);
  }

  function startMarginEditing(event: React.PointerEvent<SVGGElement>) {
    event.stopPropagation();
    setMaskSelected(false);
    setMarginSelected(true);
    marginDraggingRef.current = true;
    const svg = previewRef.current;
    if (svg) {
      const rect = svg.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * params.panelWidth;
      const y = ((event.clientY - rect.top) / rect.height) * params.panelHeight;
      const distances = [
        { side: "left" as const, value: x / Math.max(1, params.panelWidth) },
        { side: "right" as const, value: (params.panelWidth - x) / Math.max(1, params.panelWidth) },
        { side: "top" as const, value: y / Math.max(1, params.panelHeight) },
        { side: "bottom" as const, value: (params.panelHeight - y) / Math.max(1, params.panelHeight) }
      ];
      marginDraggingSideRef.current = distances.sort((a, b) => a.value - b.value)[0].side;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragMargin(event: React.PointerEvent<SVGGElement>) {
    if (!marginDraggingRef.current) return;
    const side = marginDraggingSideRef.current;
    patch(marginKeyForSide(side), marginFromPointer(event, side));
  }

  function stopMarginEditing(event: React.PointerEvent<SVGGElement>) {
    if (!marginDraggingRef.current) return;
    marginDraggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function startMaskDragging(event: React.PointerEvent<SVGGElement>) {
    event.stopPropagation();
    setMarginSelected(false);
    setMaskSelected(true);
    setMaskSnapAxes({ x: false, y: false });
    maskDraggingRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: maskPosition
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragMask(event: React.PointerEvent<SVGGElement>) {
    const drag = maskDraggingRef.current;
    const svg = previewRef.current;
    if (!drag || !svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const rawX = clamp(drag.startPosition.x + (event.clientX - drag.startClientX) / rect.width, 0, 1);
    const rawY = clamp(drag.startPosition.y + (event.clientY - drag.startClientY) / rect.height, 0, 1);
    const snapDistance = 18;
    const snapX = Math.abs(rawX - 0.5) * rect.width <= snapDistance;
    const snapY = Math.abs(rawY - 0.5) * rect.height <= snapDistance;
    setMaskSnapAxes({ x: snapX, y: snapY });
    setMaskPosition({
      x: snapX ? 0.5 : rawX,
      y: snapY ? 0.5 : rawY
    });
  }

  function stopMaskDragging(event: React.PointerEvent<SVGGElement>) {
    if (!maskDraggingRef.current) return;
    maskDraggingRef.current = null;
    setMaskSnapAxes({ x: false, y: false });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function moveMaskWithKeyboard(event: React.KeyboardEvent<SVGGElement>) {
    const movement = event.shiftKey ? 0.05 : 0.01;
    const offsets: Partial<Record<string, NormalizedPoint>> = {
      ArrowLeft: { x: -movement, y: 0 },
      ArrowRight: { x: movement, y: 0 },
      ArrowUp: { x: 0, y: -movement },
      ArrowDown: { x: 0, y: movement }
    };
    const offset = offsets[event.key];
    if (!offset) {
      if (event.key === "Escape") setMaskSelected(false);
      return;
    }
    event.preventDefault();
    setMaskSelected(true);
    setMaskPosition((current) => ({
      x: clamp(current.x + offset.x, 0, 1),
      y: clamp(current.y + offset.y, 0, 1)
    }));
  }

  function zoomPngMask(event: React.WheelEvent<SVGSVGElement>) {
    if (!pngMask) return;
    const svg = previewRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    event.preventDefault();
    event.stopPropagation();

    const nextScale = clamp(maskScale * Math.exp(-event.deltaY * 0.0015), 0.15, 8);
    if (Math.abs(nextScale - maskScale) < 0.0001) return;

    const pointerX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const pointerY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const scaleRatio = nextScale / maskScale;

    setMaskScale(nextScale);
    setMaskSelected(true);
    setMaskPosition((current) => ({
      x: clamp(pointerX - (pointerX - current.x) * scaleRatio, 0, 1),
      y: clamp(pointerY - (pointerY - current.y) * scaleRatio, 0, 1)
    }));
  }

  function exportSvg() {
    const content = buildSvg(params, holes, panelOutline);
    downloadText(content, `perdesign-vent-${formatNumber(params.panelWidth)}x${formatNumber(params.panelHeight)}.svg`, "image/svg+xml");
  }

  function exportDxf() {
    const content = buildDxf(params, holes, panelOutline);
    downloadText(content, `perdesign-vent-${formatNumber(params.panelWidth)}x${formatNumber(params.panelHeight)}.dxf`, "application/dxf");
  }

  return (
    <section className="section-surface vent-editor">
      <div className="vent-workspace">
        <aside className="vent-controls" aria-label="网孔参数">
          <ControlSection title="基础">
            <SelectField
              label="孔形状"
              value={params.holeShape}
              options={holeShapeOptions}
              onChange={(value) => patch("holeShape", value as HoleShape)}
            />
            {params.holeShape === "svg" ? (
              <div className={`vent-svg-import-card ${svgImportError ? "error" : ""}`}>
                <input
                  ref={svgFileInputRef}
                  type="file"
                  accept=".svg,image/svg+xml"
                  hidden
                  onChange={(event) => void importSvgShape(event.target.files)}
                />
                <div className="vent-svg-import-actions">
                  <button type="button" className="vent-svg-import-button" onClick={() => svgFileInputRef.current?.click()}>
                    <FileUp className="h-4 w-4" />
                    <span>{importedSvgShape ? "更换 SVG 线框" : "导入 SVG 线框"}</span>
                  </button>
                  {importedSvgShape ? (
                    <button type="button" className="vent-svg-clear-button" onClick={clearSvgShape} aria-label="清除 SVG 孔型" title="清除 SVG 孔型">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="vent-svg-import-status">
                  {svgImportError ? (
                    <span>{svgImportError}</span>
                  ) : importedSvgShape ? (
                    <>
                      <strong>{importedSvgShape.name}</strong>
                      <span>已识别 {importedSvgShape.contours.length} 个子轮廓，共 {importedSvgShape.contours.reduce((sum, contour) => sum + contour.length, 0)} 个轮廓点</span>
                    </>
                  ) : (
                    <span>支持多个分离轮廓；整份 SVG 会作为一个复合孔同步缩放、旋转和阵列。</span>
                  )}
                </div>
                <NumberField
                  label="SVG 缩放"
                  value={params.svgShapeScale}
                  min={0.1}
                  max={20}
                  step={0.1}
                  onChange={(value) => patch("svgShapeScale", value)}
                />
              </div>
            ) : null}
            <SelectField
              label="排列方式"
              value={params.layout}
              options={layoutOptions}
              onChange={(value) => updateLayout(value as LayoutMode)}
            />
            <SelectField
              label="面板形状"
              value={params.panelShape}
              options={[
                { value: "rectangle", label: "矩形面板" },
                { value: "circle", label: "圆形面板" },
                { value: "polygon", label: "正多边形面板" },
                { value: "custom", label: "导入 SVG 自定义面板" }
              ]}
              onChange={(value) => patch("panelShape", value as PanelShape)}
            />
            <div className="vent-field-grid">
              <NumberField
                label="左安全边距"
                value={params.marginLeft}
                min={0}
                max={maximumLeftMargin}
                step={0.5}
                unit="mm"
                onChange={(value) => patch("marginLeft", clamp(value, 0, maximumLeftMargin))}
              />
              <NumberField
                label="右安全边距"
                value={params.marginRight}
                min={0}
                max={maximumRightMargin}
                step={0.5}
                unit="mm"
                onChange={(value) => patch("marginRight", clamp(value, 0, maximumRightMargin))}
              />
              <NumberField
                label="上安全边距"
                value={params.marginTop}
                min={0}
                max={maximumTopMargin}
                step={0.5}
                unit="mm"
                onChange={(value) => patch("marginTop", clamp(value, 0, maximumTopMargin))}
              />
              <NumberField
                label="下安全边距"
                value={params.marginBottom}
                min={0}
                max={maximumBottomMargin}
                step={0.5}
                unit="mm"
                onChange={(value) => patch("marginBottom", clamp(value, 0, maximumBottomMargin))}
              />
            </div>
            {params.panelShape === "polygon" ? (
              <NumberField label="面板边数" value={params.sides} min={3} max={16} step={1} onChange={(value) => patch("sides", Math.round(value))} />
            ) : null}
            {params.panelShape === "custom" ? (
              <div className={`vent-svg-import-card ${panelSvgImportError ? "error" : ""}`}>
                <input
                  ref={panelSvgFileInputRef}
                  type="file"
                  accept=".svg,image/svg+xml"
                  hidden
                  onChange={(event) => void importPanelSvgShape(event.target.files)}
                />
                <div className="vent-svg-import-actions">
                  <button type="button" className="vent-svg-import-button" onClick={() => panelSvgFileInputRef.current?.click()}>
                    <FileUp className="h-4 w-4" />
                    <span>{importedPanelShape ? "更换面板 SVG" : "导入面板 SVG"}</span>
                  </button>
                  {importedPanelShape ? (
                    <button type="button" className="vent-svg-clear-button" onClick={clearPanelSvgShape} aria-label="清除自定义面板" title="清除自定义面板">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="vent-svg-import-status">
                  {panelSvgImportError ? (
                    <span>{panelSvgImportError}</span>
                  ) : importedPanelShape ? (
                    <>
                      <strong>{importedPanelShape.name}</strong>
                      <span>已识别 {importedPanelShape.contours[0]?.length || 0} 个轮廓点</span>
                    </>
                  ) : (
                    <span>导入闭合 SVG 线稿作为面板外轮廓。</span>
                  )}
                </div>
              </div>
            ) : null}
          </ControlSection>

          <ControlSection title="图片蒙版">
            <div className={`vent-mask-import-card ${pngMaskError ? "error" : ""}`}>
              <input
                ref={pngMaskInputRef}
                type="file"
                accept=".png,image/png"
                hidden
                onChange={(event) => void importPngMask(event.target.files)}
              />
              <div className="vent-mask-import-main">
                {pngMask ? (
                  <div
                    className="vent-mask-thumbnail"
                    role="img"
                    aria-label={`${pngMask.name} 蒙版预览`}
                    style={{ backgroundImage: `url("${pngMask.previewUrl}")` }}
                  />
                ) : (
                  <div className="vent-mask-placeholder" aria-hidden="true">
                    <FileUp className="h-5 w-5" />
                  </div>
                )}
                <button type="button" className="vent-mask-import-button" onClick={() => pngMaskInputRef.current?.click()}>
                  <span>{pngMask ? "更换 PNG 蒙版" : "上传 PNG 蒙版"}</span>
                  <small>{pngMask ? `${pngMask.width} × ${pngMask.height}px` : "透明底、白底或纯色底均可"}</small>
                </button>
                {pngMask ? (
                  <button type="button" className="vent-mask-clear-button" onClick={clearPngMask} aria-label="清除 PNG 蒙版" title="清除 PNG 蒙版">
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <div className="vent-mask-import-status">
                {pngMaskError ? (
                  <span>{pngMaskError}</span>
                ) : pngMask ? (
                  <>
                    <strong>{pngMask.name}</strong>
                    <span>{pngMask.usesAlpha ? "已按透明区域识别内容" : "已按背景色差识别内容"}</span>
                  </>
                ) : (
                  <span>图片中的内容区域将作为孔阵列的控制蒙版。</span>
                )}
              </div>
            </div>

            {pngMask ? (
              <>
                <SelectField
                  label="作用方式"
                  value={params.maskMode}
                  options={maskModeOptions}
                  onChange={(value) => patch("maskMode", value as MaskMode)}
                />
                <SelectField
                  label="适配方式"
                  value={params.maskFit}
                  options={maskFitOptions}
                  onChange={(value) => patch("maskFit", value as MaskFit)}
                />
                {maskBounds && maskBaseBounds ? (
                  <div className="vent-field-grid">
                    <NumberField
                      label="蒙版宽度"
                      value={Number(maskBounds.width.toFixed(1))}
                      min={Number((maskBaseBounds.width * 0.15).toFixed(1))}
                      max={Number((maskBaseBounds.width * 8).toFixed(1))}
                      step={0.5}
                      unit="mm"
                      onChange={(value) => {
                        setMaskScale(clamp(value / maskBaseBounds.width, 0.15, 8));
                        setMaskSelected(true);
                      }}
                    />
                    <NumberField
                      label="蒙版高度"
                      value={Number(maskBounds.height.toFixed(1))}
                      min={Number((maskBaseBounds.height * 0.15).toFixed(1))}
                      max={Number((maskBaseBounds.height * 8).toFixed(1))}
                      step={0.5}
                      unit="mm"
                      onChange={(value) => {
                        setMaskScale(clamp(value / maskBaseBounds.height, 0.15, 8));
                        setMaskSelected(true);
                      }}
                    />
                  </div>
                ) : null}
                <RangeField
                  label="内容识别阈值"
                  value={params.maskThreshold}
                  min={1}
                  max={90}
                  suffix="%"
                  onChange={(value) => patch("maskThreshold", value)}
                />
                {params.maskMode === "larger" || params.maskMode === "smaller" ? (
                  <RangeField
                    label="孔尺寸变化"
                    value={params.maskStrength}
                    min={5}
                    max={100}
                    suffix="%"
                    onChange={(value) => patch("maskStrength", value)}
                  />
                ) : null}
                <ToggleField label="反向识别内容与背景" checked={params.maskInvert} onChange={(value) => patch("maskInvert", value)} />
                <p className="vent-control-note">可直接输入蒙版宽度或高度，另一边会按原始比例联动；也可以将鼠标放在蒙版上滚动缩放。调整阈值可收紧或扩大内容识别范围。</p>
              </>
            ) : null}
          </ControlSection>

          <section className="vent-control-section">
            <div className="vent-section-heading">
              <h2>孔参数</h2>
              <button
                type="button"
                className={`vent-detail-toggle ${holeDetailsOpen ? "open" : ""}`}
                aria-expanded={holeDetailsOpen}
                aria-controls="vent-hole-detail-fields"
                onClick={() => setHoleDetailsOpen((current) => !current)}
              >
                <span>{holeDetailsOpen ? "收起细节" : "展开细节"}</span>
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <div className="vent-control-content">
              <NumberField
                label={params.holeShape === "slot" ? "长圆孔长度" : "孔尺寸"}
                value={params.holeSize}
                min={0.1}
                step={0.5}
                unit="mm"
                disabled={params.gradient !== "none"}
                headerAction={
                  <ParameterLockButton
                    label="孔尺寸"
                    locked={openMetricLock === "size"}
                    onClick={() => setOpenMetricLock("size")}
                  />
                }
                onChange={updateHoleSize}
              />
              <div className="vent-density-quick">
                <div className="vent-density-heading">
                  <b>孔密度</b>
                  <span>
                    <strong>{holeDensity}%</strong>
                    <ParameterLockButton
                      label="孔密度"
                      locked={openMetricLock === "density"}
                      onClick={() => setOpenMetricLock("density")}
                    />
                  </span>
                </div>
                <input
                  type="range"
                  value={holeDensity}
                  min={0}
                  max={100}
                  step={1}
                  aria-label="孔密度"
                  onChange={(event) => updateHoleDensity(Number(event.target.value))}
                />
                <small>
                  <span>疏朗</span>
                  <span>紧密</span>
                </small>
              </div>
              {holeDetailsOpen ? (
                <div id="vent-hole-detail-fields" className="vent-hole-detail-fields">
                  <div className="vent-field-grid">
                    {params.holeShape === "rectangle" || params.holeShape === "slot" ? (
                      <NumberField label="孔高度" value={params.holeHeight} min={0.1} step={0.5} unit="mm" onChange={(value) => patch("holeHeight", value)} />
                    ) : null}
                    {params.holeShape === "polygon" ? (
                      <NumberField label="孔边数" value={params.sides} min={3} max={16} step={1} onChange={(value) => patch("sides", Math.round(value))} />
                    ) : null}
                    {params.holeShape === "star" ? (
                      <>
                        <NumberField label="星角数量" value={params.starPoints} min={3} max={16} step={1} onChange={(value) => patch("starPoints", Math.round(value))} />
                        <NumberField label="内径比例" value={params.starInnerRatio} min={5} max={95} step={5} unit="%" onChange={(value) => patch("starInnerRatio", value)} />
                      </>
                    ) : null}
                    <NumberField label="横向间距" value={params.pitchX} min={0.5} step={0.5} unit="mm" onChange={(value) => patch("pitchX", value)} />
                    <NumberField label="纵向间距" value={params.pitchY} min={0.5} step={0.5} unit="mm" onChange={(value) => patch("pitchY", value)} />
                    <NumberField label="行数" value={params.rows} min={0} max={200} step={1} hint="0 = 自动" onChange={(value) => patch("rows", Math.round(value))} />
                    <NumberField label="列数" value={params.columns} min={0} max={200} step={1} hint="0 = 自动" onChange={(value) => patch("columns", Math.round(value))} />
                    <NumberField label="孔旋转" value={params.holeRotation} step={5} unit="°" onChange={(value) => patch("holeRotation", value)} />
                    <NumberField label="阵列旋转" value={params.layoutRotation} step={5} unit="°" onChange={(value) => patch("layoutRotation", value)} />
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <ControlSection title="渐变">
            <SelectField
              label="尺寸渐变路径"
              value={params.gradient}
              options={gradientOptions}
              onChange={(value) => updateGradientMode(value as GradientMode)}
            />
            {params.gradient !== "none" ? (
              <>
                <div className="vent-field-grid">
                  <NumberField
                    label={params.gradient === "line" ? "起点尺寸" : "最小尺寸"}
                    value={params.gradient === "line" ? params.gradientMax : params.gradientMin}
                    min={0.1}
                    step={0.5}
                    unit="mm"
                    onChange={params.gradient === "line" ? updateGradientMaximum : (value) => patch("gradientMin", value)}
                  />
                  <NumberField
                    label={params.gradient === "line" ? "终点尺寸" : "最大尺寸"}
                    value={params.gradient === "line" ? params.gradientMin : params.gradientMax}
                    min={0.1}
                    step={0.5}
                    unit="mm"
                    onChange={params.gradient === "line" ? (value) => patch("gradientMin", value) : updateGradientMaximum}
                  />
                  {params.gradient === "line" ? (
                    <NumberField label="渐变线角度" value={gradientAxisAngle} step={1} unit="°" onChange={updateGradientAxisAngle} />
                  ) : null}
                  {params.gradient === "angle" ? (
                    <NumberField label="渐变角度" value={params.gradientAngle} step={5} unit="°" onChange={(value) => patch("gradientAngle", value)} />
                  ) : null}
                  {params.gradient === "wave" ? (
                    <>
                      <NumberField label="波浪幅度" value={params.waveAmplitude} min={0} step={1} unit="mm" onChange={(value) => patch("waveAmplitude", value)} />
                      <NumberField label="波浪频率" value={params.waveFrequency} min={0.1} step={0.5} onChange={(value) => patch("waveFrequency", value)} />
                    </>
                  ) : null}
                </div>
                {params.gradient !== "line" ? (
                  <ToggleField label="反向渐变" checked={params.reverseGradient} onChange={(value) => patch("reverseGradient", value)} />
                ) : null}
                {params.gradient === "line" ? <p className="vent-control-note">拖动渐变线可整体移动；拖动端点可旋转并改变范围，接近 0°、45°、90° 等关键角度时会自动吸附。渐变线允许超出面板。</p> : null}
                {params.gradient === "point" ? <p className="vent-control-note">点击右侧画布可移动渐变中心。</p> : null}
              </>
            ) : null}
          </ControlSection>

          <ControlSection title="密度变化">
            <SelectField
              label="密度变化"
              hideLabel
              value={params.density}
              options={densityOptions}
              onChange={(value) => patch("density", value as DensityMode)}
            />
            {params.density !== "none" ? (
              <RangeField
                label="密度强度"
                value={params.densityStrength}
                min={0}
                max={95}
                suffix="%"
                onChange={(value) => patch("densityStrength", value)}
              />
            ) : null}
          </ControlSection>

          <button
            type="button"
            className="vent-reset-button"
            onClick={() => {
              setParams(defaults);
              setMaskPosition({ x: 0.5, y: 0.5 });
              setMaskScale(1);
              setMaskSelected(false);
              setMaskSnapAxes({ x: false, y: false });
              setHoleDetailsOpen(false);
              setOpenMetricLock("density");
            }}
          >
            <RotateCcw className="h-4 w-4" />
            恢复默认参数
          </button>
        </aside>

        <div className="vent-preview-pane">
          <div className="vent-preview-topbar">
            <div className="vent-preview-title-area">
              <div className="vent-preview-title">
                <Grid3X3 className="h-4 w-4" />
                <span>实时预览</span>
              </div>
            </div>
            <div className="vent-preview-toolbar">
              <div className="vent-metrics">
                <span><strong>{holes.length}</strong> 个孔</span>
                <MetricNumberInput
                  label="开孔率"
                  value={openRate}
                  suffix="%"
                  maximum={95}
                  warning={openRate > 60}
                  onCommit={(value) => updateTargetOpenArea(panelArea * clamp(value, 0.01, 95) / 100)}
                />
                <MetricNumberInput
                  label="开孔面积"
                  value={openArea}
                  suffix="mm²"
                  maximum={panelArea * 0.95}
                  onCommit={updateTargetOpenArea}
                />
              </div>
              <div className="vent-header-actions">
                <button type="button" className="btn-secondary vent-action-button" onClick={exportDxf}>
                  <FileCode2 className="h-4 w-4" />
                  <span>导出 DXF</span>
                </button>
                <button type="button" className="btn-secondary vent-action-button" onClick={exportSvg}>
                  <Download className="h-4 w-4" />
                  <span>导出 SVG</span>
                </button>
              </div>
            </div>
          </div>

          <div className="vent-canvas-stage">
            <div
              className="vent-canvas-frame"
              style={{
                aspectRatio: `${params.panelWidth} / ${params.panelHeight}`,
                "--vent-panel-ratio": params.panelWidth / params.panelHeight
              } as React.CSSProperties}
            >
              <svg
                ref={previewRef}
                className={`vent-canvas-svg ${params.gradient === "point" ? "point-editing" : ""}`}
                viewBox={`0 0 ${params.panelWidth} ${params.panelHeight}`}
                role="img"
                aria-label="网孔实时预览"
                onWheel={zoomPngMask}
                onPointerDown={(event) => {
                  setMarginSelected(false);
                  setMaskSelected(false);
                  updateGradientPoint(event);
                }}
              >
                <defs>
                  <linearGradient
                    id="vent-gradient-axis-stroke"
                    gradientUnits="userSpaceOnUse"
                    x1={gradientAxis.start.x * params.panelWidth}
                    y1={gradientAxis.start.y * params.panelHeight}
                    x2={gradientAxis.end.x * params.panelWidth}
                    y2={gradientAxis.end.y * params.panelHeight}
                  >
                    <stop offset="0%" stopColor="#d8d1ff" />
                    <stop offset="100%" stopColor="#654cff" />
                  </linearGradient>
                </defs>
                <polygon points={pointsAttribute(panelOutline)} fill="none" stroke="#74747c" strokeWidth={0.45} />
                {pngMask && maskBounds ? (
                  <g
                    className={`vent-mask-positioner ${maskSelected ? "selected" : ""}`}
                    role="button"
                    aria-label="图片蒙版，拖动可移动，滚轮可缩放"
                    tabIndex={0}
                    onPointerDown={startMaskDragging}
                    onPointerMove={dragMask}
                    onPointerUp={stopMaskDragging}
                    onPointerCancel={stopMaskDragging}
                    onKeyDown={moveMaskWithKeyboard}
                  >
                    <title>拖动移动图片蒙版，使用鼠标滚轮缩放</title>
                    <rect
                      className="vent-mask-drag-surface"
                      x={maskBounds.x}
                      y={maskBounds.y}
                      width={maskBounds.width}
                      height={maskBounds.height}
                      rx={Math.min(params.panelWidth, params.panelHeight) * 0.008}
                    />
                    <g
                      className="vent-mask-center-handle"
                      transform={`translate(${maskBounds.centerX} ${maskBounds.centerY})`}
                    >
                      <circle r={Math.min(params.panelWidth, params.panelHeight) * 0.018} />
                      <path
                        d={`M ${-Math.min(params.panelWidth, params.panelHeight) * 0.01} 0 H ${Math.min(params.panelWidth, params.panelHeight) * 0.01} M 0 ${-Math.min(params.panelWidth, params.panelHeight) * 0.01} V ${Math.min(params.panelWidth, params.panelHeight) * 0.01}`}
                      />
                    </g>
                  </g>
                ) : null}
                <g
                  className={`vent-safety-outline ${marginSelected ? "selected" : ""}`}
                  role="button"
                  aria-label={`左 ${formatNumber(params.marginLeft)}、右 ${formatNumber(params.marginRight)}、上 ${formatNumber(params.marginTop)}、下 ${formatNumber(params.marginBottom)} 毫米，点击编辑`}
                  tabIndex={0}
                  onPointerDown={startMarginEditing}
                  onPointerMove={dragMargin}
                  onPointerUp={stopMarginEditing}
                  onPointerCancel={stopMarginEditing}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setMarginSelected(true);
                    }
                    if (event.key === "Escape") setMarginSelected(false);
                  }}
                >
                  <polygon
                    className="vent-safety-hit-area"
                    points={pointsAttribute(makeSafetyOutline(params, panelOutline))}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={4}
                  />
                  <polygon
                    className="vent-safety-line"
                    points={pointsAttribute(makeSafetyOutline(params, panelOutline))}
                    fill="none"
                    stroke="#55555d"
                    strokeWidth={0.2}
                    strokeDasharray="1.2 1.2"
                  />
                </g>
                <path d={holePreviewPath} fill="#8b8b93" pointerEvents="none" />
                {params.gradient === "line" ? (
                  <g
                    className="vent-gradient-axis"
                    role="group"
                    aria-label="尺寸渐变线，拖动线可移动，拖动两端可旋转和调整范围"
                    onPointerMove={dragGradientAxis}
                    onPointerUp={stopGradientAxisDragging}
                    onPointerCancel={stopGradientAxisDragging}
                  >
                    <line
                      className="vent-gradient-axis-hit"
                      x1={gradientAxis.start.x * params.panelWidth}
                      y1={gradientAxis.start.y * params.panelHeight}
                      x2={gradientAxis.end.x * params.panelWidth}
                      y2={gradientAxis.end.y * params.panelHeight}
                      onPointerDown={(event) => startGradientAxisDragging(event, "line")}
                    />
                    <line
                      className="vent-gradient-axis-line"
                      x1={gradientAxis.start.x * params.panelWidth}
                      y1={gradientAxis.start.y * params.panelHeight}
                      x2={gradientAxis.end.x * params.panelWidth}
                      y2={gradientAxis.end.y * params.panelHeight}
                    />
                    <circle
                      className="vent-gradient-axis-point start"
                      cx={gradientAxis.start.x * params.panelWidth}
                      cy={gradientAxis.start.y * params.panelHeight}
                      r={Math.min(params.panelWidth, params.panelHeight) * 0.022}
                      onPointerDown={(event) => startGradientAxisDragging(event, "start")}
                    />
                    <circle
                      className="vent-gradient-axis-point end"
                      cx={gradientAxis.end.x * params.panelWidth}
                      cy={gradientAxis.end.y * params.panelHeight}
                      r={Math.min(params.panelWidth, params.panelHeight) * 0.022}
                      onPointerDown={(event) => startGradientAxisDragging(event, "end")}
                    />
                  </g>
                ) : null}
                {pngMask && (maskSnapAxes.x || maskSnapAxes.y) ? (
                  <g className="vent-mask-snap-guides" aria-hidden="true">
                    {maskSnapAxes.x ? (
                      <line
                        className="vertical"
                        x1={params.panelWidth / 2}
                        y1={0}
                        x2={params.panelWidth / 2}
                        y2={params.panelHeight}
                      />
                    ) : null}
                    {maskSnapAxes.y ? (
                      <line
                        className="horizontal"
                        x1={0}
                        y1={params.panelHeight / 2}
                        x2={params.panelWidth}
                        y2={params.panelHeight / 2}
                      />
                    ) : null}
                    <circle cx={params.panelWidth / 2} cy={params.panelHeight / 2} r={Math.min(params.panelWidth, params.panelHeight) * 0.01} />
                  </g>
                ) : null}
                {params.gradient === "point" ? (
                  <g className="vent-gradient-handle" transform={`translate(${gradientPoint.x * params.panelWidth} ${gradientPoint.y * params.panelHeight})`}>
                    <circle r={2.3} fill="none" stroke="#5b43ff" strokeWidth={0.65} />
                    <circle r={0.7} fill="#5b43ff" />
                  </g>
                ) : null}
              </svg>
              <EdgeDimensionInput
                className="width"
                label="板宽"
                value={params.panelWidth}
                onCommit={(value) => updatePanelDimension("panelWidth", value)}
              />
              <EdgeDimensionInput
                className="height"
                label="板高"
                value={params.panelHeight}
                onCommit={(value) => updatePanelDimension("panelHeight", value)}
              />
              {marginSelected ? (
                <label
                  className="vent-safety-inline-editor"
                  style={{
                    top: `${clamp((params.marginTop / params.panelHeight) * 100, 4, 94)}%`
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <input
                    ref={marginInputRef}
                    type="number"
                    value={params.marginLeft}
                    min={0}
                    max={maximumLeftMargin}
                    step={0.5}
                    aria-label="左安全边距"
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) patch("marginLeft", clamp(value, 0, maximumLeftMargin));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                      if (event.key === "Escape") {
                        setMarginSelected(false);
                        previewRef.current?.focus();
                      }
                    }}
                  />
                  <span>左</span>
                  <input
                    type="number"
                    value={params.marginRight}
                    min={0}
                    max={maximumRightMargin}
                    step={0.5}
                    aria-label="右安全边距"
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) patch("marginRight", clamp(value, 0, maximumRightMargin));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") {
                        setMarginSelected(false);
                        previewRef.current?.focus();
                      }
                    }}
                  />
                  <span>右</span>
                  <input
                    type="number"
                    value={params.marginTop}
                    min={0}
                    max={maximumTopMargin}
                    step={0.5}
                    aria-label="上安全边距"
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) patch("marginTop", clamp(value, 0, maximumTopMargin));
                    }}
                  />
                  <span>上</span>
                  <input
                    type="number"
                    value={params.marginBottom}
                    min={0}
                    max={maximumBottomMargin}
                    step={0.5}
                    aria-label="下安全边距"
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) patch("marginBottom", clamp(value, 0, maximumBottomMargin));
                    }}
                  />
                  <span>下 mm</span>
                </label>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ControlSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="vent-control-section">
      <h2>{title}</h2>
      <div className="vent-control-content">{children}</div>
    </section>
  );
}

function SelectField({
  label,
  hideLabel = false,
  value,
  options,
  onChange
}: {
  label: string;
  hideLabel?: boolean;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="vent-select-field">
      {!hideLabel ? <span>{label}</span> : null}
      <div
        className={`vent-custom-select ${open ? "open" : ""}`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <button
          type="button"
          className="vent-select-trigger"
          aria-label={`${label}：${selectedOption?.label ?? ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{selectedOption?.label}</span>
          <ChevronDown className="h-4 w-4" />
        </button>
        {open ? (
          <div className="vent-select-menu" role="listbox" aria-label={label}>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`vent-select-option ${selected ? "selected" : ""}`}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {selected ? <Check className="h-4 w-4" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.5,
  unit,
  hint,
  disabled = false,
  headerAction,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
  disabled?: boolean;
  headerAction?: React.ReactNode;
  onChange: (value: number) => void;
}) {
  return (
    <div className={`vent-number-field ${disabled ? "disabled" : ""}`} aria-disabled={disabled}>
      <div className="vent-field-label">
        <span>{label}{hint ? <small>{hint}</small> : null}</span>
        {headerAction}
      </div>
      <span className="vent-number-input">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-label={`${label}${unit ? ` ${unit}` : ""}`}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(clamp(next, min ?? -99999, max ?? 99999));
          }}
        />
        {unit ? <em>{unit}</em> : null}
      </span>
    </div>
  );
}

function ParameterLockButton({
  label,
  locked,
  onClick
}: {
  label: string;
  locked: boolean;
  onClick: () => void;
}) {
  const title = locked
    ? `${label}已锁定，调整开孔率或开孔面积时保持不变`
    : `锁定${label}`;
  return (
    <button
      type="button"
      className={`vent-parameter-lock ${locked ? "active" : ""}`}
      aria-label={title}
      aria-pressed={locked}
      title={title}
      onClick={onClick}
    >
      {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
    </button>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="vent-toggle-field">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="vent-range-field">
      <span><b>{label}</b><strong>{formatNumber(value)}{suffix}</strong></span>
      <input type="range" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function EditableNumber({
  value,
  minimum,
  maximum,
  decimals = 1,
  ariaLabel,
  onCommit
}: {
  value: number;
  minimum: number;
  maximum: number;
  decimals?: number;
  ariaLabel: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(formatEditableNumber(value, decimals));

  useEffect(() => {
    setDraft(formatEditableNumber(value, decimals));
  }, [decimals, value]);

  function commit() {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatEditableNumber(value, decimals));
      return;
    }
    onCommit(clamp(parsed, minimum, maximum));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(formatEditableNumber(value, decimals));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function MetricNumberInput({
  label,
  value,
  suffix,
  maximum,
  warning = false,
  onCommit
}: {
  label: string;
  value: number;
  suffix: string;
  maximum: number;
  warning?: boolean;
  onCommit: (value: number) => void;
}) {
  return (
    <label className={`vent-metric-editor ${warning ? "warning" : ""}`}>
      <EditableNumber
        value={value}
        minimum={0.01}
        maximum={Math.max(0.01, maximum)}
        decimals={1}
        ariaLabel={label}
        onCommit={onCommit}
      />
      <b>{suffix}</b>
      <small>{label}</small>
    </label>
  );
}

function EdgeDimensionInput({
  className,
  label,
  value,
  onCommit
}: {
  className: "width" | "height";
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  return (
    <label className={`vent-edge-dimension ${className}`}>
      <small>{label}</small>
      <EditableNumber
        value={value}
        minimum={1}
        maximum={5000}
        decimals={1}
        ariaLabel={label}
        onCommit={onCommit}
      />
      <em>mm</em>
    </label>
  );
}

function formatEditableNumber(value: number, decimals: number) {
  if (!Number.isFinite(value)) return "";
  return Number(value.toFixed(decimals)).toString();
}

async function decodePngMask(file: File): Promise<PngMask> {
  if (file.type && file.type !== "image/png") {
    throw new Error("请上传 PNG 格式的图片。");
  }

  const bitmap = await createImageBitmap(file);
  const maximumDimension = 640;
  const scale = Math.min(1, maximumDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("浏览器无法读取这张 PNG 图片。");
  }
  context.clearRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const pixels = context.getImageData(0, 0, width, height).data;
  let transparentPixels = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 250) transparentPixels += 1;
  }
  const usesAlpha = transparentPixels / Math.max(1, width * height) > 0.001;
  const background = estimatePngBackground(pixels, width, height);
  const scores = new Uint8Array(width * height);

  for (let index = 0; index < scores.length; index += 1) {
    const pixelIndex = index * 4;
    if (usesAlpha) {
      scores[index] = pixels[pixelIndex + 3];
      continue;
    }
    const red = pixels[pixelIndex];
    const green = pixels[pixelIndex + 1];
    const blue = pixels[pixelIndex + 2];
    const distance = Math.hypot(red - background[0], green - background[1], blue - background[2]);
    scores[index] = Math.round(clamp(distance / 441.7, 0, 1) * 255);
  }

  return {
    name: file.name,
    width,
    height,
    scores,
    previewUrl: canvas.toDataURL("image/png"),
    usesAlpha
  };
}

function estimatePngBackground(pixels: Uint8ClampedArray, width: number, height: number) {
  const sampleRadius = Math.max(1, Math.min(8, Math.floor(Math.min(width, height) * 0.04)));
  const samples: Array<[number, number, number]> = [];
  const corners = [
    [0, 0],
    [Math.max(0, width - sampleRadius), 0],
    [0, Math.max(0, height - sampleRadius)],
    [Math.max(0, width - sampleRadius), Math.max(0, height - sampleRadius)]
  ];

  corners.forEach(([startX, startY]) => {
    for (let y = startY; y < Math.min(height, startY + sampleRadius); y += 1) {
      for (let x = startX; x < Math.min(width, startX + sampleRadius); x += 1) {
        const index = (y * width + x) * 4;
        samples.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
      }
    }
  });

  const total = samples.reduce(
    (sum, [red, green, blue]) => [sum[0] + red, sum[1] + green, sum[2] + blue] as [number, number, number],
    [0, 0, 0] as [number, number, number]
  );
  const count = Math.max(1, samples.length);
  return [total[0] / count, total[1] / count, total[2] / count] as [number, number, number];
}

async function parseSvgOutline(file: File, label = "孔型", allowCompound = false) {
  const source = await file.text();
  const svgDocument = new DOMParser().parseFromString(source, "image/svg+xml");
  if (svgDocument.querySelector("parsererror")) {
    throw new Error("SVG 文件格式无效，请检查后重新导入。");
  }

  const sourceSvg = svgDocument.documentElement;
  if (sourceSvg.localName.toLowerCase() !== "svg") {
    throw new Error("文件中没有识别到 SVG 根节点。");
  }

  const sandbox = document.createElement("div");
  sandbox.style.position = "fixed";
  sandbox.style.left = "-100000px";
  sandbox.style.top = "0";
  sandbox.style.width = "1000px";
  sandbox.style.height = "1000px";
  sandbox.style.opacity = "0";
  sandbox.style.pointerEvents = "none";

  const mountedSvg = document.importNode(sourceSvg, true) as unknown as SVGSVGElement;
  const viewBox = mountedSvg.viewBox.baseVal;
  const viewportWidth = viewBox?.width > 0 ? viewBox.width : readSvgLength(mountedSvg.getAttribute("width"), 1000);
  const viewportHeight = viewBox?.height > 0 ? viewBox.height : readSvgLength(mountedSvg.getAttribute("height"), 1000);
  mountedSvg.setAttribute("width", String(viewportWidth));
  mountedSvg.setAttribute("height", String(viewportHeight));
  mountedSvg.setAttribute("preserveAspectRatio", "none");
  mountedSvg.style.overflow = "visible";
  expandSvgUseElements(mountedSvg);
  sandbox.appendChild(mountedSvg);
  document.body.appendChild(sandbox);

  try {
    const candidates: Array<{ points: Array<[number, number]>; frameLike: boolean }> = [];
    const geometryElements = Array.from(
      mountedSvg.querySelectorAll<SVGGeometryElement>("path, polygon, polyline, rect, circle, ellipse")
    );

    for (const element of geometryElements) {
      if (element.closest("defs, clipPath, mask, pattern, marker, symbol")) continue;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;

      try {
        const length = element.getTotalLength();
        const matrix = element.getCTM();
        if (!matrix || !Number.isFinite(length) || length <= 0) continue;
        const sampleCount = Math.round(clamp(Math.ceil(length / 2), 48, 360));
        const sampled = Array.from({ length: sampleCount }, (_, index) => {
          const point = element.getPointAtLength(length * index / sampleCount);
          return applySvgMatrix(point.x, point.y, matrix);
        });
        const contours = splitSampledContours(sampled);

        contours.forEach((points) => {
          if (points.length < 3 || outlineBoundsArea(points) <= 1e-8) return;
          candidates.push({
            points,
            frameLike: isSvgCanvasFrame(points, mountedSvg, viewportWidth, viewportHeight)
          });
        });
      } catch {
        // Skip malformed or browser-unsupported geometry while preserving valid contours.
      }
    }

    if (!candidates.length) {
      throw new Error(`没有识别到有效${label}，请转换为闭合路径后重新导入。`);
    }

    const usableCandidates = candidates.some((candidate) => !candidate.frameLike)
      ? candidates.filter((candidate) => !candidate.frameLike)
      : candidates;
    const outlines = allowCompound
      ? usableCandidates.map((candidate) => candidate.points)
      : [usableCandidates.reduce((largest, current) =>
          outlineSelectionScore(current.points) > outlineSelectionScore(largest.points) ? current : largest
        ).points];
    const normalized = normalizeImportedContours(outlines);
    if (!normalized.length || normalized.some((contour) => contour.length < 3)) {
      throw new Error(`识别到的 SVG 轮廓点不足，无法作为${label}。`);
    }
    return normalized;
  } finally {
    sandbox.remove();
  }
}

function readSvgLength(value: string | null, fallback: number) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function expandSvgUseElements(svg: SVGSVGElement) {
  Array.from(svg.querySelectorAll<SVGUseElement>("use")).forEach((useElement) => {
    const href = useElement.getAttribute("href") ?? useElement.getAttribute("xlink:href");
    if (!href?.startsWith("#")) return;
    const target = svg.querySelector(`#${cssEscape(href.slice(1))}`);
    if (!target) return;

    const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const x = readSvgLengthAllowZero(useElement.getAttribute("x"));
    const y = readSvgLengthAllowZero(useElement.getAttribute("y"));
    const transform = useElement.getAttribute("transform") ?? "";
    wrapper.setAttribute("transform", `translate(${x} ${y}) ${transform}`.trim());
    ["fill", "stroke", "stroke-width", "fill-rule", "clip-rule", "opacity"].forEach((attribute) => {
      const value = useElement.getAttribute(attribute);
      if (value !== null) wrapper.setAttribute(attribute, value);
    });

    if (target.localName.toLowerCase() === "symbol") {
      Array.from(target.children).forEach((child) => wrapper.appendChild(child.cloneNode(true)));
    } else {
      wrapper.appendChild(target.cloneNode(true));
    }
    useElement.replaceWith(wrapper);
  });
}

function cssEscape(value: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/([^\w-])/g, "\\$1");
}

function readSvgLengthAllowZero(value: string | null) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function applySvgMatrix(x: number, y: number, matrix: DOMMatrix) {
  return [
    matrix.a * x + matrix.c * y + matrix.e,
    matrix.b * x + matrix.d * y + matrix.f
  ] as [number, number];
}

function splitSampledContours(points: Array<[number, number]>) {
  if (points.length < 4) return [points];
  const distances = points.slice(1).map(([x, y], index) =>
    Math.hypot(x - points[index][0], y - points[index][1])
  );
  const sorted = distances.filter((distance) => distance > 0).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const threshold = Math.max(median * 8, Math.sqrt(outlineBoundsArea(points)) * 0.08);
  const contours: Array<Array<[number, number]>> = [[]];

  points.forEach((point, index) => {
    if (index > 0 && distances[index - 1] > threshold && contours[contours.length - 1].length >= 3) {
      contours.push([]);
    }
    contours[contours.length - 1].push(point);
  });
  return contours.filter((contour) => contour.length >= 3);
}

function isSvgCanvasFrame(
  points: Array<[number, number]>,
  svg: SVGSVGElement,
  viewportWidth: number,
  viewportHeight: number
) {
  if (points.length < 4) return false;
  const bounds = outlineBounds(points);
  const rootMatrix = svg.getCTM();
  const topLeft = rootMatrix ? applySvgMatrix(0, 0, rootMatrix) : [0, 0] as [number, number];
  const bottomRight = rootMatrix
    ? applySvgMatrix(viewportWidth, viewportHeight, rootMatrix)
    : [viewportWidth, viewportHeight] as [number, number];
  const width = Math.abs(bottomRight[0] - topLeft[0]);
  const height = Math.abs(bottomRight[1] - topLeft[1]);
  if (!width || !height) return false;
  return (
    Math.abs(bounds.width - width) / width < 0.015 &&
    Math.abs(bounds.height - height) / height < 0.015
  );
}

function outlineSelectionScore(points: Array<[number, number]>) {
  const area = Math.abs(polygonArea(points));
  const boundsArea = outlineBoundsArea(points);
  return area > 0 ? area : boundsArea * 0.1;
}

function outlineBoundsArea(points: Array<[number, number]>) {
  const bounds = outlineBounds(points);
  return bounds.width * bounds.height;
}

function outlineBounds(points: Array<[number, number]>) {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumY = Math.min(...ys);
  const maximumY = Math.max(...ys);
  return {
    x: minimumX,
    y: minimumY,
    width: maximumX - minimumX,
    height: maximumY - minimumY
  };
}

function cleanImportedContour(points: Array<[number, number]>) {
  const finite = points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const deduplicated = finite.filter(([x, y], index) => {
    if (index === 0) return true;
    const [previousX, previousY] = finite[index - 1];
    return Math.hypot(x - previousX, y - previousY) > 1e-7;
  });
  if (deduplicated.length > 2) {
    const [firstX, firstY] = deduplicated[0];
    const [lastX, lastY] = deduplicated[deduplicated.length - 1];
    if (Math.hypot(firstX - lastX, firstY - lastY) < 1e-7) deduplicated.pop();
  }
  return deduplicated.length >= 3 ? restoreSampledContourCorners(deduplicated) : [];
}

function restoreSampledContourCorners(points: Array<[number, number]>) {
  if (points.length < 4) return points;
  const bounds = outlineBounds(points);
  const diagonal = Math.hypot(bounds.width, bounds.height);
  const tolerance = Math.max(1e-7, diagonal * 1e-5);
  const sourceSteps = points.map((point, index) => pointDistance(point, points[(index + 1) % points.length])).filter((value) => value > tolerance);
  const sortedSteps = [...sourceSteps].sort((a, b) => a - b);
  const samplingStep = sortedSteps[Math.floor(sortedSteps.length / 2)] || 0;
  let result = removeClosedContourCollinearPoints(points, tolerance);

  // Uniform getPointAtLength sampling often places one point immediately
  // before and after a sharp SVG vertex. The DXF then contains a tiny false
  // bevel. Rebuild only sampling-sized bevels by intersecting their two long
  // neighbouring straight segments.
  for (let pass = 0; pass < 8 && result.length >= 4; pass += 1) {
    let repaired = false;
    for (let index = 0; index < result.length; index += 1) {
      const previous = result[(index - 1 + result.length) % result.length];
      const first = result[index];
      const secondIndex = (index + 1) % result.length;
      const second = result[secondIndex];
      const next = result[(index + 2) % result.length];
      const previousLength = pointDistance(previous, first);
      const bevelLength = pointDistance(first, second);
      const nextLength = pointDistance(second, next);
      if (
        !samplingStep ||
        bevelLength > samplingStep * 2.25 ||
        bevelLength > Math.min(previousLength, nextLength) * 0.28
      ) continue;
      const firstTurn = normalizedCross(previous, first, second);
      const secondTurn = normalizedCross(first, second, next);
      if (firstTurn < 0.08 || secondTurn < 0.08) continue;
      const intersection = infiniteLineIntersection(previous, first, second, next);
      if (!intersection) continue;
      if (
        pointDistance(intersection, first) > bevelLength * 2.5 ||
        pointDistance(intersection, second) > bevelLength * 2.5
      ) continue;

      if (secondIndex === 0) {
        result = [intersection, ...result.slice(1, -1)];
      } else {
        result.splice(index, 2, intersection);
      }
      repaired = true;
      break;
    }
    if (!repaired) break;
    result = removeClosedContourCollinearPoints(result, tolerance);
  }
  return result;
}

function removeClosedContourCollinearPoints(points: Array<[number, number]>, tolerance: number) {
  let result = [...points];
  for (let pass = 0; pass < 6 && result.length > 3; pass += 1) {
    const filtered = result.filter((point, index) => {
      const previous = result[(index - 1 + result.length) % result.length];
      const next = result[(index + 1) % result.length];
      const span = pointDistance(previous, next);
      if (span <= tolerance) return false;
      const distance = Math.abs(
        (next[0] - previous[0]) * (previous[1] - point[1]) -
        (previous[0] - point[0]) * (next[1] - previous[1])
      ) / span;
      const forward = (point[0] - previous[0]) * (next[0] - point[0]) + (point[1] - previous[1]) * (next[1] - point[1]);
      return distance > tolerance || forward < 0;
    });
    if (filtered.length === result.length || filtered.length < 3) break;
    result = filtered;
  }
  return result;
}

function pointDistance(first: [number, number], second: [number, number]) {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

function normalizedCross(first: [number, number], vertex: [number, number], last: [number, number]) {
  const incomingX = vertex[0] - first[0];
  const incomingY = vertex[1] - first[1];
  const outgoingX = last[0] - vertex[0];
  const outgoingY = last[1] - vertex[1];
  const denominator = Math.hypot(incomingX, incomingY) * Math.hypot(outgoingX, outgoingY);
  return denominator ? Math.abs(incomingX * outgoingY - incomingY * outgoingX) / denominator : 0;
}

function infiniteLineIntersection(
  firstStart: [number, number],
  firstEnd: [number, number],
  secondStart: [number, number],
  secondEnd: [number, number]
) {
  const firstX = firstEnd[0] - firstStart[0];
  const firstY = firstEnd[1] - firstStart[1];
  const secondX = secondEnd[0] - secondStart[0];
  const secondY = secondEnd[1] - secondStart[1];
  const denominator = firstX * secondY - firstY * secondX;
  if (Math.abs(denominator) < 1e-10) return null;
  const offsetX = secondStart[0] - firstStart[0];
  const offsetY = secondStart[1] - firstStart[1];
  const factor = (offsetX * secondY - offsetY * secondX) / denominator;
  return [firstStart[0] + factor * firstX, firstStart[1] + factor * firstY] as [number, number];
}

function normalizeImportedContours(contours: Array<Array<[number, number]>>) {
  const cleaned = contours.map(cleanImportedContour).filter((contour) => contour.length >= 3);
  const allPoints = cleaned.flat();
  if (!allPoints.length) return [];
  const xs = allPoints.map(([x]) => x);
  const ys = allPoints.map(([, y]) => y);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumY = Math.min(...ys);
  const maximumY = Math.max(...ys);
  const width = maximumX - minimumX;
  const height = maximumY - minimumY;
  const scale = Math.max(width, height);
  if (scale <= 0) return [];
  const centerX = (minimumX + maximumX) / 2;
  const centerY = (minimumY + maximumY) / 2;
  return cleaned.map((contour) => contour.map(([x, y]) => [
    (x - centerX) / scale,
    (y - centerY) / scale
  ] as [number, number]));
}

function createHoles(
  params: VentParams,
  point: { x: number; y: number },
  gradientAxis: GradientAxis,
  svgContours?: Array<Array<[number, number]>>,
  pngMask?: PngMask | null,
  maskPosition: NormalizedPoint = { x: 0.5, y: 0.5 },
  maskScale = 1,
  panelOutline = makePanelOutline(params)
) {
  if (params.holeShape === "svg" && !svgContours?.length) return [];
  const candidates = createLayoutCandidates(params);
  const result: HoleItem[] = [];
  const boundaryOutline = params.safe ? makeSafetyOutline(params, panelOutline) : panelOutline;

  candidates.slice(0, MAX_HOLE_COUNT).forEach((candidate) => {
    const rotated = rotateAroundCenter(candidate.x, candidate.y, params, degrees(params.layoutRotation));
    const gradient = gradientValue(rotated.x, rotated.y, params, point, gradientAxis);
    if (!densityKeep(rotated.x, rotated.y, candidate.row, candidate.column, gradient, params)) return;
    const insideMask = pngMask ? pointInsidePngMask(rotated.x, rotated.y, params, pngMask, maskPosition, maskScale) : false;
    if (pngMask && params.maskMode === "only" && !insideMask) return;
    if (pngMask && params.maskMode === "exclude" && insideMask) return;

    const minimum = Math.min(params.gradientMin, params.gradientMax);
    const maximum = Math.max(params.gradientMin, params.gradientMax);
    let size = params.gradient === "none" ? params.holeSize : minimum + (maximum - minimum) * gradient;
    if (pngMask && insideMask && params.maskMode === "larger") {
      size *= 1 + params.maskStrength / 100 * 1.5;
    }
    if (pngMask && insideMask && params.maskMode === "smaller") {
      size *= Math.max(0.1, 1 - params.maskStrength / 100 * 0.9);
    }
    const item = makeHoleItem(rotated.x, rotated.y, size, params, candidate.rotation + degrees(params.layoutRotation), svgContours);
    if (!itemInsideOutline(item, boundaryOutline)) return;
    result.push(item);
  });

  return result;
}

function getPngMaskBounds(params: VentParams, mask: PngMask, position: NormalizedPoint, maskScale = 1) {
  const panelWidth = Math.max(1, params.panelWidth);
  const panelHeight = Math.max(1, params.panelHeight);
  let width = panelWidth;
  let height = panelHeight;

  if (params.maskFit !== "stretch") {
    const scale = params.maskFit === "contain"
      ? Math.min(panelWidth / mask.width, panelHeight / mask.height)
      : Math.max(panelWidth / mask.width, panelHeight / mask.height);
    width = mask.width * scale;
    height = mask.height * scale;
  }

  const safeScale = clamp(maskScale, 0.15, 8);
  width *= safeScale;
  height *= safeScale;

  const centerX = clamp(position.x, 0, 1) * panelWidth;
  const centerY = clamp(position.y, 0, 1) * panelHeight;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    centerX,
    centerY
  };
}

function pointInsidePngMask(
  x: number,
  y: number,
  params: VentParams,
  mask: PngMask,
  position: NormalizedPoint,
  maskScale = 1
) {
  const bounds = getPngMaskBounds(params, mask, position, maskScale);
  const normalizedX = (x - bounds.x) / Math.max(1e-6, bounds.width);
  const normalizedY = (y - bounds.y) / Math.max(1e-6, bounds.height);
  let inside = false;
  if (normalizedX >= 0 && normalizedX <= 1 && normalizedY >= 0 && normalizedY <= 1) {
    const pixelX = clamp(Math.round(normalizedX * (mask.width - 1)), 0, mask.width - 1);
    const pixelY = clamp(Math.round(normalizedY * (mask.height - 1)), 0, mask.height - 1);
    const score = mask.scores[pixelY * mask.width + pixelX] / 255;
    inside = score >= params.maskThreshold / 100;
  }
  return params.maskInvert ? !inside : inside;
}

function createLayoutCandidates(params: VentParams) {
  const width = params.panelWidth;
  const height = params.panelHeight;
  const marginLeft = Math.min(params.marginLeft, width - 0.5);
  const marginRight = Math.min(params.marginRight, width - marginLeft - 0.5);
  const marginTop = Math.min(params.marginTop, height - 0.5);
  const marginBottom = Math.min(params.marginBottom, height - marginTop - 0.5);
  const usableWidth = Math.max(1, width - marginLeft - marginRight);
  const usableHeight = Math.max(1, height - marginTop - marginBottom);
  const safeCenterX = marginLeft + usableWidth / 2;
  const safeCenterY = marginTop + usableHeight / 2;
  const pitchX = Math.max(0.5, params.pitchX);
  const pitchY = Math.max(0.5, params.pitchY);
  const out: Array<{ x: number; y: number; row: number; column: number; rotation: number }> = [];

  if (params.layout === "radial") {
    const maxRadius = Math.max(0, Math.min(usableWidth, usableHeight) / 2);
    const rings = params.rows || Math.max(1, Math.floor(maxRadius / pitchY));
    for (let ring = 0; ring <= rings; ring += 1) {
      const radius = ring * maxRadius / Math.max(1, rings);
      const count = ring === 0 ? 1 : params.columns || Math.max(6, Math.floor(2 * Math.PI * radius / pitchX));
      for (let index = 0; index < count; index += 1) {
        const angle = count === 1 ? 0 : 2 * Math.PI * index / count;
        out.push({
          x: safeCenterX + Math.cos(angle) * radius,
          y: safeCenterY + Math.sin(angle) * radius,
          row: ring,
          column: index,
          rotation: angle
        });
      }
    }
    return out;
  }

  if (params.layout === "spiral" || params.layout === "fibonacci") {
    const maxRadius = Math.max(0, Math.min(usableWidth, usableHeight) / 2);
    const automaticCount = Math.max(30, Math.floor(width * height / Math.max(1, pitchX * pitchY) * 0.78));
    const count = Math.min(MAX_HOLE_COUNT, params.rows && params.columns ? params.rows * params.columns : automaticCount);
    const goldenAngle = degrees(137.5);
    for (let index = 0; index < count; index += 1) {
      const progress = (index + 0.5) / Math.max(1, count);
      const angle = params.layout === "spiral" ? Math.PI * 12 * progress : goldenAngle * index;
      const radius = maxRadius * Math.sqrt(progress);
      out.push({
        x: safeCenterX + Math.cos(angle) * radius,
        y: safeCenterY + Math.sin(angle) * radius,
        row: index,
        column: 0,
        rotation: angle
      });
    }
    return out;
  }

  const actualPitchY = params.layout === "honeycomb" ? pitchX * Math.sqrt(3) / 2 : pitchY;
  const maximumHoleSize = params.gradient === "none"
    ? params.holeSize
    : Math.max(params.gradientMin, params.gradientMax);
  const scaledHoleSize = maximumHoleSize * (params.holeShape === "svg" ? params.svgShapeScale : 1);
  const halfHoleWidth = Math.max(0.05, scaledHoleSize / 2);
  const halfHoleHeight = params.holeShape === "rectangle"
    ? Math.max(0.05, params.holeHeight / 2)
    : params.holeShape === "slot"
      ? Math.max(0.05, Math.min(params.holeHeight, maximumHoleSize) / 2)
      : halfHoleWidth;
  const boundaryClearance = 0.01;
  const centerWidth = Math.max(0, usableWidth - (halfHoleWidth + boundaryClearance) * 2);
  const centerHeight = Math.max(0, usableHeight - (halfHoleHeight + boundaryClearance) * 2);
  const columns = params.columns || Math.max(1, Math.floor(centerWidth / pitchX) + 1);
  const rows = params.rows || Math.max(1, Math.floor(centerHeight / actualPitchY) + 1);
  const startX = marginLeft + (usableWidth - (columns - 1) * pitchX) / 2;
  const startY = marginTop + (usableHeight - (rows - 1) * actualPitchY) / 2;

  for (let row = 0; row < rows; row += 1) {
    const shift = params.layout === "honeycomb" && row % 2 ? pitchX / 2 : 0;
    for (let column = 0; column < columns; column += 1) {
      if (out.length >= MAX_HOLE_COUNT) return out;
      out.push({
        x: startX + column * pitchX + shift,
        y: startY + row * actualPitchY + (params.layout === "hex-tiling" && column % 2 ? actualPitchY / 2 : 0),
        row,
        column,
        rotation: 0
      });
    }
  }
  return out;
}

function makeHoleItem(
  x: number,
  y: number,
  size: number,
  params: VentParams,
  layoutRotation: number,
  svgContours?: Array<Array<[number, number]>>
): HoleItem {
  const rotation = degrees(params.holeRotation) + layoutRotation;
  if (params.holeShape === "circle") return { kind: "circle", x, y, size, rotation };

  let points: Array<[number, number]>;
  if (params.holeShape === "rectangle") {
    points = rectanglePoints(x, y, size, params.holeHeight, rotation);
  } else if (params.holeShape === "polygon") {
    points = regularPolygon(x, y, size / 2, params.sides, rotation);
  } else if (params.holeShape === "star") {
    points = starPoints(x, y, size / 2, size / 2 * params.starInnerRatio / 100, params.starPoints, rotation);
  } else if (params.holeShape === "svg") {
    return {
      kind: "compound",
      x,
      y,
      size,
      rotation,
      contours: transformImportedContours(svgContours ?? [], x, y, size * params.svgShapeScale, rotation)
    };
  } else {
    points = slotPoints(x, y, size, Math.min(params.holeHeight, size), rotation, 12);
  }
  return { kind: "polygon", x, y, size, rotation, points };
}

function transformImportedContours(
  contours: Array<Array<[number, number]>>,
  cx: number,
  cy: number,
  scale: number,
  rotation: number
) {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return contours.map((points) => points.map(([x, y]) => [
    cx + x * scale * cosine - y * scale * sine,
    cy + x * scale * sine + y * scale * cosine
  ] as [number, number]));
}

function gradientValue(
  x: number,
  y: number,
  params: VentParams,
  point: { x: number; y: number },
  gradientAxis: GradientAxis
) {
  if (params.gradient === "none") return 1;
  const width = params.panelWidth;
  const height = params.panelHeight;
  let value = 1;

  if (params.gradient === "line") {
    const startX = gradientAxis.start.x * width;
    const startY = gradientAxis.start.y * height;
    const endX = gradientAxis.end.x * width;
    const endY = gradientAxis.end.y * height;
    const axisX = endX - startX;
    const axisY = endY - startY;
    const lengthSquared = axisX * axisX + axisY * axisY;
    const progress = lengthSquared
      ? clamp(((x - startX) * axisX + (y - startY) * axisY) / lengthSquared, 0, 1)
      : 0;
    return 1 - progress;
  } else if (params.gradient === "radial") {
    const distance = Math.hypot(x - width / 2, y - height / 2);
    value = 1 - clamp(distance / Math.hypot(width / 2, height / 2) * 1.4, 0, 1);
  } else if (params.gradient === "horizontal") {
    value = clamp(x / width, 0, 1);
  } else if (params.gradient === "vertical") {
    value = clamp(y / height, 0, 1);
  } else if (params.gradient === "diagonal") {
    value = clamp((x / width + y / height) / 2, 0, 1);
  } else if (params.gradient === "angle") {
    const angle = degrees(params.gradientAngle);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const projection = (x - width / 2) * ux + (y - height / 2) * uy;
    const maximum = Math.abs(width / 2 * ux) + Math.abs(height / 2 * uy);
    value = maximum ? clamp((projection / maximum + 1) / 2, 0, 1) : 0.5;
  } else if (params.gradient === "wave") {
    const center = height / 2 + Math.sin(x / width * params.waveFrequency * 2 * Math.PI) * params.waveAmplitude;
    value = 1 - clamp(Math.abs(y - center) / Math.max(1, height / 2), 0, 1);
  } else if (params.gradient === "point") {
    const centerX = point.x * width;
    const centerY = point.y * height;
    const radius = Math.max(width, height) * 0.58;
    value = 1 - clamp(Math.hypot(x - centerX, y - centerY) / radius, 0, 1);
  }

  return params.reverseGradient ? 1 - value : value;
}

function densityKeep(x: number, y: number, row: number, column: number, gradient: number, params: VentParams) {
  if (params.density === "none") return true;
  const strength = clamp(params.densityStrength / 100, 0, 0.95);
  const centerDistance = clamp(
    Math.hypot(x - params.panelWidth / 2, y - params.panelHeight / 2) /
      Math.hypot(params.panelWidth / 2, params.panelHeight / 2),
    0,
    1
  );
  let keepProbability = 1;
  if (params.density === "center-dense") keepProbability = 1 - strength * centerDistance;
  if (params.density === "edge-dense") keepProbability = 1 - strength * (1 - centerDistance);
  if (params.density === "gradient") keepProbability = 1 - strength * (1 - gradient);
  return stableNoise(row, column) <= keepProbability;
}

function makePanelOutline(params: VentParams, customPoints?: Array<[number, number]>) {
  const width = params.panelWidth;
  const height = params.panelHeight;
  if (params.panelShape === "custom" && customPoints?.length) {
    return fitImportedPanelOutline(customPoints, width, height);
  }
  if (params.panelShape === "circle") {
    return regularPolygon(width / 2, height / 2, Math.min(width, height) / 2, 72, -Math.PI / 2);
  }
  if (params.panelShape === "polygon") {
    return regularPolygon(width / 2, height / 2, Math.min(width, height) / 2, params.sides, -Math.PI / 2);
  }
  return [[0, 0], [width, 0], [width, height], [0, height]] as Array<[number, number]>;
}

function fitImportedPanelOutline(points: Array<[number, number]>, width: number, height: number) {
  const bounds = outlineBounds(points);
  const scale = Math.min(
    width / Math.max(bounds.width, 1e-6),
    height / Math.max(bounds.height, 1e-6)
  );
  const sourceCenterX = bounds.x + bounds.width / 2;
  const sourceCenterY = bounds.y + bounds.height / 2;
  return points.map(([x, y]) => [
    width / 2 + (x - sourceCenterX) * scale,
    height / 2 + (y - sourceCenterY) * scale
  ] as [number, number]);
}

function makeSafetyOutline(params: VentParams, panelOutline = makePanelOutline(params)) {
  const width = params.panelWidth;
  const height = params.panelHeight;
  const marginLeft = Math.min(params.marginLeft, width - 0.1);
  const marginRight = Math.min(params.marginRight, width - marginLeft - 0.1);
  const marginTop = Math.min(params.marginTop, height - 0.1);
  const marginBottom = Math.min(params.marginBottom, height - marginTop - 0.1);
  if (params.panelShape !== "rectangle" && panelOutline.length) {
    const centerX = width / 2 + (marginLeft - marginRight) / 2;
    const centerY = height / 2 + (marginTop - marginBottom) / 2;
    const scaleX = Math.max(0.01, 1 - (marginLeft + marginRight) / Math.max(0.1, width));
    const scaleY = Math.max(0.01, 1 - (marginTop + marginBottom) / Math.max(0.1, height));
    return panelOutline.map(([x, y]) => [
      centerX + (x - width / 2) * scaleX,
      centerY + (y - height / 2) * scaleY
    ] as [number, number]);
  }
  return [
    [marginLeft, marginTop],
    [width - marginRight, marginTop],
    [width - marginRight, height - marginBottom],
    [marginLeft, height - marginBottom]
  ] as Array<[number, number]>;
}

function itemInsideOutline(item: HoleItem, outline: Array<[number, number]>) {
  const testPoints = item.kind === "circle"
    ? [
        [item.x, item.y],
        [item.x + item.size / 2, item.y],
        [item.x - item.size / 2, item.y],
        [item.x, item.y + item.size / 2],
        [item.x, item.y - item.size / 2]
      ] as Array<[number, number]>
    : item.kind === "compound" ? item.contours.flat() : item.points;
  return testPoints.every(([x, y]) => pointInPolygon(x, y, outline));
}

function pointInPolygon(x: number, y: number, points: Array<[number, number]>) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [currentX, currentY] = points[index];
    const [previousX, previousY] = points[previous];
    if ((currentY > y) !== (previousY > y)) {
      const intersectX = (previousX - currentX) * (y - currentY) / (previousY - currentY || 1e-9) + currentX;
      if (x < intersectX) inside = !inside;
    }
  }
  return inside;
}

function regularPolygon(cx: number, cy: number, radius: number, sides: number, rotation: number) {
  return Array.from({ length: Math.max(3, sides) }, (_, index) => {
    const angle = rotation + index * Math.PI * 2 / Math.max(3, sides);
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius] as [number, number];
  });
}

function starPoints(cx: number, cy: number, outer: number, inner: number, count: number, rotation: number) {
  return Array.from({ length: Math.max(3, count) * 2 }, (_, index) => {
    const radius = index % 2 ? inner : outer;
    const angle = rotation - Math.PI / 2 + index * Math.PI / Math.max(3, count);
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius] as [number, number];
  });
}

function rectanglePoints(cx: number, cy: number, width: number, height: number, rotation: number) {
  return rotatePoints([
    [cx - width / 2, cy - height / 2],
    [cx + width / 2, cy - height / 2],
    [cx + width / 2, cy + height / 2],
    [cx - width / 2, cy + height / 2]
  ], cx, cy, rotation);
}

function slotPoints(cx: number, cy: number, width: number, height: number, rotation: number, segments: number) {
  const radius = height / 2;
  const halfStraight = Math.max(0, width / 2 - radius);
  const points: Array<[number, number]> = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / segments;
    points.push([cx + halfStraight + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  for (let index = 0; index <= segments; index += 1) {
    const angle = Math.PI / 2 + index * Math.PI / segments;
    points.push([cx - halfStraight + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return rotatePoints(points, cx, cy, rotation);
}

function rotatePoints(points: Array<[number, number]>, cx: number, cy: number, rotation: number) {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return points.map(([x, y]) => [
    cx + (x - cx) * cosine - (y - cy) * sine,
    cy + (x - cx) * sine + (y - cy) * cosine
  ] as [number, number]);
}

function rotateAroundCenter(x: number, y: number, params: VentParams, rotation: number) {
  const cx = params.panelWidth / 2;
  const cy = params.panelHeight / 2;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: cx + (x - cx) * cosine - (y - cy) * sine,
    y: cy + (x - cx) * sine + (y - cy) * cosine
  };
}

function itemArea(item: HoleItem) {
  if (item.kind === "circle") return Math.PI * Math.pow(item.size / 2, 2);
  if (item.kind === "compound") return item.contours.reduce((sum, contour) => sum + polygonArea(contour), 0);
  return polygonArea(item.points);
}

function polygonArea(points: Array<[number, number]>) {
  return Math.abs(points.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    return sum + x * nextY - nextX * y;
  }, 0)) / 2;
}

function stableNoise(row: number, column: number) {
  const value = Math.sin((row + 1) * 12.9898 + (column + 1) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function buildHolePreviewPath(holes: HoleItem[]) {
  return holes.map((item) => {
    if (item.kind === "circle") {
      const radius = item.size / 2;
      return [
        `M${pathNumber(item.x - radius)} ${pathNumber(item.y)}`,
        `a${pathNumber(radius)} ${pathNumber(radius)} 0 1 0 ${pathNumber(radius * 2)} 0`,
        `a${pathNumber(radius)} ${pathNumber(radius)} 0 1 0 ${pathNumber(-radius * 2)} 0`
      ].join(" ");
    }
    const contours = item.kind === "compound" ? item.contours : [item.points];
    return contours
      .filter((contour) => contour.length)
      .map((contour) => `M${contour.map(([x, y]) => `${pathNumber(x)} ${pathNumber(y)}`).join(" L")} Z`)
      .join(" ");
  }).join(" ");
}

function pathNumber(value: number) {
  return Number(value.toFixed(3));
}

function buildSvg(params: VentParams, holes: HoleItem[], outline: Array<[number, number]>) {
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${params.panelWidth}mm" height="${params.panelHeight}mm" viewBox="0 0 ${params.panelWidth} ${params.panelHeight}">`,
    `<polygon points="${pointsAttribute(outline)}" fill="none" stroke="black" stroke-width="0.2"/>`,
    '<g fill="black" stroke="none">'
  ];
  holes.forEach((item) => {
    if (item.kind === "circle") {
      lines.push(`<circle cx="${item.x.toFixed(4)}" cy="${item.y.toFixed(4)}" r="${(item.size / 2).toFixed(4)}"/>`);
    } else if (item.kind === "compound") {
      item.contours.forEach((contour) => lines.push(`<polygon points="${pointsAttribute(contour, 4)}"/>`));
    } else {
      lines.push(`<polygon points="${pointsAttribute(item.points, 4)}"/>`);
    }
  });
  lines.push("</g>", "</svg>");
  return lines.join("\n");
}

function buildDxf(params: VentParams, holes: HoleItem[], outline: Array<[number, number]>) {
  const lines = ["0", "SECTION", "2", "ENTITIES"];
  appendPolyline(lines, outline, "PANEL");
  holes.forEach((item) => {
    if (item.kind === "circle") {
      lines.push("0", "CIRCLE", "8", "HOLES", "10", item.x.toFixed(4), "20", (-item.y).toFixed(4), "30", "0", "40", (item.size / 2).toFixed(4));
    } else if (item.kind === "compound") {
      item.contours.forEach((contour) => appendPolyline(lines, contour, "HOLES"));
    } else {
      appendPolyline(lines, item.points, "HOLES");
    }
  });
  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n");
}

function appendPolyline(lines: string[], points: Array<[number, number]>, layer: string) {
  lines.push("0", "LWPOLYLINE", "8", layer, "90", String(points.length), "70", "1");
  points.forEach(([x, y]) => lines.push("10", x.toFixed(4), "20", (-y).toFixed(4)));
}

function pointsAttribute(points: Array<[number, number]>, precision = 3) {
  return points.map(([x, y]) => `${x.toFixed(precision)},${y.toFixed(precision)}`).join(" ");
}

function downloadText(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function degrees(value: number) {
  return value * Math.PI / 180;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function fitMarginPair(first: number, second: number, dimension: number): [number, number] {
  const maximumTotal = Math.max(0, dimension - 0.5);
  const total = first + second;
  if (total <= maximumTotal) return [first, second];
  if (total <= 0) return [0, 0];
  const scale = maximumTotal / total;
  return [Math.round(first * scale * 2) / 2, Math.round(second * scale * 2) / 2];
}

function marginKeyForSide(side: "left" | "right" | "top" | "bottom") {
  return `margin${side[0].toUpperCase()}${side.slice(1)}` as
    "marginLeft" | "marginRight" | "marginTop" | "marginBottom";
}

function getMarginForSide(params: VentParams, side: "left" | "right" | "top" | "bottom") {
  return params[marginKeyForSide(side)];
}

function densityPitchBounds(_params: VentParams) {
  return {
    minimumX: 0.5,
    minimumY: 0.5,
    maximumX: 15.5,
    maximumY: 15.5
  };
}

function densityLevelFromParams(params: VentParams) {
  const bounds = densityPitchBounds(params);
  const horizontal = 1 - (params.pitchX - bounds.minimumX) / Math.max(0.5, bounds.maximumX - bounds.minimumX);
  const vertical = 1 - (params.pitchY - bounds.minimumY) / Math.max(0.5, bounds.maximumY - bounds.minimumY);
  return Math.round(clamp((horizontal + vertical) * 50, 0, 100));
}

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
