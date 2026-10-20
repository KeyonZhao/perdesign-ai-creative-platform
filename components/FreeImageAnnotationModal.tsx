"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Eraser, Paintbrush, Undo2, X } from "lucide-react";

const COLORS = ["#ff3b30", "#ffcc00", "#34c759", "#00c7be", "#0a84ff", "#af52de", "#ffffff", "#111111"];

export function FreeImageAnnotationModal({
  image,
  onChange,
  onClose
}: {
  image: string;
  onChange: (nextImage: string) => void;
  onClose: () => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const historyRef = useRef<string[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(8);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [ready, setReady] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function initializeCanvas() {
    const source = imageRef.current;
    const canvas = canvasRef.current;
    if (!source || !canvas) return;
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [];
    setCanUndo(false);
    setReady(true);
  }

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
      scale: canvas.width / bounds.width
    };
  }

  function beginStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready) return;
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d")!;
    const point = pointFromEvent(event);
    historyRef.current = [...historyRef.current.slice(-29), canvas.toDataURL("image/png")];
    setCanUndo(true);
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = size * point.scale;
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = color;
  }

  function drawStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current!.getContext("2d")!;
    const point = pointFromEvent(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function endStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current?.releasePointerCapture(event.pointerId);
    publishImage();
  }

  function publishImage() {
    const source = imageRef.current;
    const annotation = canvasRef.current;
    if (!source || !annotation) return;
    const output = document.createElement("canvas");
    output.width = source.naturalWidth;
    output.height = source.naturalHeight;
    const context = output.getContext("2d")!;
    context.drawImage(source, 0, 0, output.width, output.height);
    context.drawImage(annotation, 0, 0);
    onChange(output.toDataURL("image/png"));
  }

  function undo() {
    const previous = historyRef.current.pop();
    const canvas = canvasRef.current;
    if (!previous || !canvas) return;
    const snapshot = new Image();
    snapshot.onload = () => {
      const context = canvas.getContext("2d")!;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(snapshot, 0, 0);
      setCanUndo(historyRef.current.length > 0);
      publishImage();
    };
    snapshot.src = previous;
  }

  return (
    <div className="free-annotation-backdrop" role="dialog" aria-modal="true" aria-label="图片标注编辑器" onClick={(event) => event.stopPropagation()}>
      <div className="free-annotation-modal">
        <header className="free-annotation-header">
          <strong>标注图片</strong>
          <span>标注结果会自动更新到下一条消息的附件中</span>
          <button type="button" onClick={onClose} aria-label="关闭标注"><X /></button>
        </header>
        <div className="free-annotation-stage">
          <div className="free-annotation-canvas-wrap">
            <img ref={imageRef} src={image} alt="待标注图片" onLoad={initializeCanvas} />
            <canvas
              ref={canvasRef}
              onPointerDown={beginStroke}
              onPointerMove={drawStroke}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
            />
          </div>
        </div>
        <footer className="free-annotation-toolbar">
          <div className="free-annotation-tools">
            <button type="button" className={tool === "brush" ? "active" : ""} onClick={() => setTool("brush")}><Paintbrush />画笔</button>
            <button type="button" className={tool === "eraser" ? "active" : ""} onClick={() => setTool("eraser")}><Eraser />橡皮擦</button>
            <button type="button" disabled={!canUndo} onClick={undo}><Undo2 />撤回</button>
          </div>
          <div className="free-annotation-colors" aria-label="画笔颜色">
            {COLORS.map((item) => (
              <button
                type="button"
                key={item}
                className={color === item && tool === "brush" ? "active" : ""}
                style={{ backgroundColor: item }}
                onClick={() => { setColor(item); setTool("brush"); }}
                aria-label={`选择颜色 ${item}`}
              />
            ))}
          </div>
          <label className="free-annotation-size">
            <span>粗细</span>
            <input type="range" min="2" max="32" step="1" value={size} onChange={(event) => setSize(Number(event.target.value))} />
            <b>{size}</b>
          </label>
          <button type="button" className="free-annotation-done" onClick={onClose}><Check />完成</button>
        </footer>
      </div>
    </div>
  );
}
