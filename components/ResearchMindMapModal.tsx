"use client";

import { Download, Loader2, Maximize2, Minus, Plus, RefreshCw, X } from "lucide-react";
import JSZip from "jszip";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent
} from "react";

export type MindMapRevisionRequest = {
  originalOutline: string;
  modifiedOutline: string;
  changes: string[];
};

export type MindMapTreeData = {
  id: string;
  label: string;
  detail?: string;
  tag?: string;
  children: MindMapTreeData[];
  detached?: boolean;
  position?: { x: number; y: number };
  width?: number;
  side?: "left" | "right";
};

type TreeNode = MindMapTreeData;

type LayoutNode = TreeNode & {
  depth: number;
  parentId: string | null;
  x: number;
  y: number;
};

type DropIntent = {
  targetId: string;
  mode: "before" | "after" | "child";
  side?: "left" | "right";
};

const ROOT_NODE_WIDTH = 286;
const ROOT_NODE_HEIGHT = 82;
const COLUMN_GAP = 104;
const ROW_GAP = 28;

function getNodeSize(depth: number, customWidth?: number) {
  return {
    width: customWidth == null ? Math.max(190, ROOT_NODE_WIDTH - depth * 24) : Math.max(120, Math.min(520, customWidth)),
    height: Math.max(58, ROOT_NODE_HEIGHT - depth * 7)
  };
}

function getNodeAnchorY(depth: number, height: number) {
  return depth >= 3 ? height - 8 : height / 2;
}

function getDepthX(depth: number) {
  let x = 0;
  for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
    x += getNodeSize(currentDepth).width + COLUMN_GAP;
  }
  return x;
}

export function ResearchMindMapModal({
  content,
  initialTree,
  embedded = false,
  canRevise = true,
  title = "策划案思维导图",
  centerInitialView = false,
  onTreeChange,
  onClose,
  onRequestRevision
}: {
  content: string;
  initialTree?: MindMapTreeData | null;
  embedded?: boolean;
  canRevise?: boolean;
  title?: string;
  centerInitialView?: boolean;
  onTreeChange?: (tree: MindMapTreeData) => void;
  onClose: () => void;
  onRequestRevision: (request: MindMapRevisionRequest) => Promise<void>;
}) {
  const originalTree = useMemo(
    () => initialTree ? cloneTree(initialTree) : buildMindMapTree(content),
    [content, initialTree]
  );
  const originalTreeRef = useRef<TreeNode>(cloneTree(originalTree));
  const [tree, setTree] = useState<TreeNode>(() => cloneTree(originalTree));
  const baseMap = useMemo(() => layoutTree(tree), [tree]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasDragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const nodeDragRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const nodeResizeRef = useRef<{ id: string; startX: number; startWidth: number; direction: 1 | -1 } | null>(null);
  const nextNodeIdRef = useRef(1);
  const undoHistoryRef = useRef<TreeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [scale, setScale] = useState(0.88);
  const [pan, setPan] = useState({ x: 56, y: 48 });
  const [isApplying, setIsApplying] = useState(false);
  const onTreeChangeRef = useRef(onTreeChange);
  onTreeChangeRef.current = onTreeChange;

  useEffect(() => {
    onTreeChangeRef.current?.(cloneTree(tree));
  }, [tree]);

  const previewTree = useMemo(() => {
    if (!draggingId || !dropIntent) return tree;
    const draft = cloneTree(tree);
    moveNodeInTree(draft, draggingId, dropIntent);
    return draft;
  }, [draggingId, dropIntent, tree]);
  const map = useMemo(() => layoutTree(previewTree), [previewTree]);
  const changes = useMemo(() => compareTrees(originalTreeRef.current, tree), [tree]);

  useEffect(() => {
    if (!centerInitialView) return;
    const frame = window.requestAnimationFrame(() => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const nextScale = Math.max(0.38, Math.min(1.15, (rect.width - 120) / map.width, (rect.height - 120) / map.height));
      setScale(nextScale);
      setPan({
        x: Math.max(44, (rect.width - map.width * nextScale) / 2),
        y: Math.max(44, (rect.height - map.height * nextScale) / 2)
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [centerInitialView, map.height, map.width]);

  const setZoom = (nextScale: number) => setScale(Math.max(0.38, Math.min(1.8, nextScale)));

  function mutateTree(mutator: (draft: TreeNode) => void) {
    setTree((current) => {
      const draft = cloneTree(current);
      mutator(draft);
      if (JSON.stringify(draft) === JSON.stringify(current)) return current;
      undoHistoryRef.current.push(cloneTree(current));
      if (undoHistoryRef.current.length > 80) undoHistoryRef.current.shift();
      return draft;
    });
  }

  function undoTreeChange() {
    const previous = undoHistoryRef.current.pop();
    if (!previous) return;
    setTree(previous);
    setSelectedId(null);
    setEditingId(null);
    setDropIntent(null);
    setDraggingId(null);
  }

  function makeNode(label = "新节点") {
    return { id: `added-${Date.now()}-${nextNodeIdRef.current++}`, label, children: [] };
  }

  function addBlankCanvasNode(x: number, y: number) {
    const node = { ...makeNode(""), detached: true, position: { x, y } };
    mutateTree((draft) => {
      draft.children.push(node);
    });
    setSelectedId(node.id);
    setEditingId(node.id);
  }

  function addChild(parentId: string | null = selectedId) {
    if (!parentId) return;
    const node = makeNode();
    mutateTree((draft) => {
      findNode(draft, parentId)?.children.push(node);
    });
    setSelectedId(node.id);
    setEditingId(node.id);
  }

  function addSibling(nodeId: string | null = selectedId) {
    if (!nodeId) return;
    if (nodeId === tree.id) return addChild(tree.id);
    const node = makeNode();
    mutateTree((draft) => {
      const parent = findParent(draft, nodeId);
      if (!parent) return;
      const index = parent.children.findIndex((child) => child.id === nodeId);
      parent.children.splice(index + 1, 0, node);
    });
    setSelectedId(node.id);
    setEditingId(node.id);
  }

  function deleteNode(nodeId: string | null = selectedId) {
    if (!nodeId) return;
    if (nodeId === tree.id) return;
    const parentId = map.nodes.find((node) => node.id === nodeId)?.parentId || tree.id;
    mutateTree((draft) => {
      const parent = findParent(draft, nodeId);
      if (parent) parent.children = parent.children.filter((child) => child.id !== nodeId);
    });
    setSelectedId(parentId);
  }

  function moveNode(nodeId: string, intent: DropIntent) {
    const { targetId, mode } = intent;
    if (nodeId === tree.id || nodeId === targetId) return;
    const movingNode = findNode(tree, nodeId);
    if (!movingNode || findNode(movingNode, targetId)) return;
    mutateTree((draft) => moveNodeInTree(draft, nodeId, intent));
  }

  function detachNode(nodeId: string, position: { x: number; y: number }) {
    if (nodeId === tree.id) return;
    mutateTree((draft) => detachNodeInTree(draft, nodeId, position));
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        if (!target?.matches("input, textarea, [contenteditable='true']")) {
          event.preventDefault();
          undoTreeChange();
        }
        return;
      }
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (!selectedId) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteNode();
      } else if (event.key === "Tab") {
        event.preventDefault();
        addChild();
      } else if (event.key === "Enter") {
        event.preventDefault();
        addSibling();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function fitView() {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const nextScale = Math.max(0.38, Math.min(1.15, (rect.width - 120) / map.width, (rect.height - 120) / map.height));
    setScale(nextScale);
    setPan({
      x: Math.max(44, (rect.width - map.width * nextScale) / 2),
      y: Math.max(44, (rect.height - map.height * nextScale) / 2)
    });
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const resize = nodeResizeRef.current;
    if (resize) {
      const width = Math.max(120, Math.min(520, resize.startWidth + ((event.clientX - resize.startX) / scale) * resize.direction));
      setTree((current) => {
        const draft = cloneTree(current);
        const target = findNode(draft, resize.id);
        if (target) target.width = Math.round(width);
        return draft;
      });
      return;
    }
    const nodeDrag = nodeDragRef.current;
    if (nodeDrag) {
      const offset = {
        x: (event.clientX - nodeDrag.x) / scale,
        y: (event.clientY - nodeDrag.y) / scale
      };
      setDragOffset(offset);
      if (nodeDrag.id === tree.id) {
        setDropIntent(null);
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const localX = (event.clientX - rect.left - pan.x) / scale;
      const localY = (event.clientY - rect.top - pan.y) / scale;
      setDropIntent((current) => inferDropIntent({
        tree,
        map: baseMap,
        draggedId: nodeDrag.id,
        x: localX,
        y: localY,
        current
      }));
      return;
    }
    const drag = canvasDragRef.current;
    if (!drag) return;
    setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
  }

  function finishPointerInteraction() {
    if (nodeResizeRef.current) {
      nodeResizeRef.current = null;
      return;
    }
    const nodeDrag = nodeDragRef.current;
    if (nodeDrag?.id === tree.id && Math.hypot(dragOffset.x, dragOffset.y) > 2) {
      const sourceNode = baseMap.nodes.find((node) => node.id === tree.id);
      if (sourceNode) {
        mutateTree((draft) => {
          draft.position = {
            x: Math.max(0, sourceNode.x + dragOffset.x),
            y: Math.max(0, sourceNode.y + dragOffset.y)
          };
        });
      }
    } else if (nodeDrag && dropIntent) {
      moveNode(nodeDrag.id, dropIntent);
    } else if (nodeDrag && Math.hypot(dragOffset.x, dragOffset.y) > 110) {
      const sourceNode = baseMap.nodes.find((node) => node.id === nodeDrag.id);
      if (sourceNode) {
        detachNode(nodeDrag.id, {
          x: Math.max(0, sourceNode.x + dragOffset.x),
          y: Math.max(0, sourceNode.y + dragOffset.y)
        });
      }
    }
    nodeDragRef.current = null;
    canvasDragRef.current = null;
    setDragOffset({ x: 0, y: 0 });
    setDropIntent(null);
    setDraggingId(null);
  }

  async function applyRevision() {
    if (!changes.length) return;
    setIsApplying(true);
    try {
      await onRequestRevision({
        originalOutline: serializeTree(originalTreeRef.current),
        modifiedOutline: serializeTree(tree),
        changes
      });
      originalTreeRef.current = cloneTree(tree);
    } finally {
      setIsApplying(false);
    }
  }

  async function exportPng() {
    const padding = 44;
    const exportWidth = Math.ceil(map.width + padding * 2);
    const exportHeight = Math.ceil(map.height + padding * 2);
    const blob = new Blob([renderExportSvg(map, exportWidth, exportHeight, padding)], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = exportWidth * 2;
      canvas.height = exportHeight * 2;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(2, 2);
      context.fillStyle = "#121214";
      context.fillRect(0, 0, exportWidth, exportHeight);
      context.drawImage(image, 0, 0, exportWidth, exportHeight);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const url = URL.createObjectURL(pngBlob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "产品策划思维导图.png";
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
  }

  async function exportXMind() {
    const zip = new JSZip();
    const sheetId = `sheet-${Date.now()}`;
    let topicIndex = 0;
    const toTopic = (node: TreeNode): Record<string, unknown> => {
      const topic: Record<string, unknown> = {
        id: `topic-${topicIndex++}`,
        class: "topic",
        title: node.label || "未命名节点"
      };
      if (node.detail) topic.notes = { plain: { content: node.detail } };
      if (node.tag) topic.labels = [node.tag];
      if (node.children.length) {
        topic.children = { attached: node.children.map(toTopic) };
      }
      return topic;
    };
    const rootTopic = toTopic(tree);
    rootTopic.structureClass = "org.xmind.ui.logic.right";
    const content = [{
      id: sheetId,
      class: "sheet",
      title: title || tree.label || "思维导图",
      rootTopic
    }];
    zip.file("content.json", JSON.stringify(content));
    zip.file("metadata.json", JSON.stringify({
      creator: { name: "Perdesign AI", version: "1.0.4" },
      activeSheetId: sheetId
    }));
    zip.file("manifest.json", JSON.stringify({
      "file-entries": {
        "content.json": {},
        "metadata.json": {}
      }
    }));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const url = URL.createObjectURL(new Blob([blob], { type: "application/vnd.xmind.workbook" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeXMindFilename(title || tree.label || "思维导图")}.xmind`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div
      className={`research-mindmap-backdrop ${embedded ? "embedded" : ""}`}
      role={embedded ? "region" : "dialog"}
      aria-modal={embedded ? undefined : true}
      aria-label="策划案思维导图"
    >
      <div className="research-mindmap-modal">
        <header className="research-mindmap-header">
          <div>
            <strong>{title}</strong>
            <span>双击编辑 · 选中后拖拽端点调节宽度 · 拖拽调整层级与顺序 · Ctrl/⌘ + Z 撤销 · Tab 添加子节点 · Enter 添加同级 · Del 删除</span>
          </div>
          <div className="research-mindmap-actions">
            <button type="button" onClick={() => setZoom(scale - 0.12)} title="缩小"><Minus className="h-4 w-4" /></button>
            <span>{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => setZoom(scale + 0.12)} title="放大"><Plus className="h-4 w-4" /></button>
            <button type="button" onClick={fitView} title="适配视图"><Maximize2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => void exportPng()} title="导出 PNG"><Download className="h-4 w-4" /></button>
            <button type="button" onClick={() => void exportXMind()} title="导出 XMind" aria-label="导出 XMind">
              <span className="research-mindmap-xmind-label">XM</span>
            </button>
            {canRevise ? (
              <button
                type="button"
                className="research-mindmap-revise"
                onClick={() => void applyRevision()}
                disabled={!changes.length || isApplying}
                title="根据导图修改策划案"
              >
                {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span>{isApplying ? "修改中" : `修改策划案${changes.length ? ` (${changes.length})` : ""}`}</span>
              </button>
            ) : null}
            {!embedded ? <button type="button" onClick={onClose} title="关闭"><X className="h-4 w-4" /></button> : null}
          </div>
        </header>

        <div className="research-mindmap-stage">
          <svg
            ref={svgRef}
            className="research-mindmap-svg"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              setSelectedId(null);
              setEditingId(null);
              event.currentTarget.setPointerCapture(event.pointerId);
              canvasDragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerInteraction}
            onPointerCancel={finishPointerInteraction}
            onDoubleClick={(event) => {
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              addBlankCanvasNode(
                Math.max(0, (event.clientX - rect.left - pan.x) / scale - getNodeSize(1).width / 2),
                Math.max(0, (event.clientY - rect.top - pan.y) / scale - getNodeSize(1).height / 2)
              );
            }}
            onWheel={(event: WheelEvent<SVGSVGElement>) => {
              event.preventDefault();
              setZoom(scale * (event.deltaY > 0 ? 0.9 : 1.1));
            }}
          >
            <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
              {map.edges.map((edge) => {
                const draggedId = draggingId;
                const internalDraggedEdge = draggedId && (edge.parentId === draggedId || isDescendant(tree, draggedId, edge.parentId));
                const detachedRootEdge = draggedId && edge.childId === draggedId && !internalDraggedEdge;
                const isPreviewConnection = Boolean(detachedRootEdge && dropIntent);
                return (
                  <path
                    key={edge.id}
                    d={edge.path}
                    fill="none"
                    stroke={isPreviewConnection ? "rgba(168,156,255,.48)" : "rgba(168,156,255,.28)"}
                    strokeWidth={isPreviewConnection ? 1.8 : 1.5}
                    strokeDasharray={isPreviewConnection ? "6 6" : undefined}
                    opacity={detachedRootEdge && !isPreviewConnection ? 0 : 1}
                    transform={internalDraggedEdge ? `translate(${dragOffset.x} ${dragOffset.y})` : undefined}
                  />
                );
              })}
              {draggingId && dropIntent ? (() => {
                const placeholder = map.nodes.find((node) => node.id === draggingId);
                if (!placeholder) return null;
                const size = getNodeSize(placeholder.depth, placeholder.width);
                return (
                  <rect
                    x={placeholder.x}
                    y={placeholder.y}
                    width={size.width}
                    height={size.height}
                    rx={Math.max(10, 15 - placeholder.depth)}
                    fill="rgba(139,121,255,.045)"
                    stroke="rgba(168,156,255,.38)"
                    strokeWidth="1.5"
                    strokeDasharray="6 6"
                    pointerEvents="none"
                  />
                );
              })() : null}
              {map.nodes.map((previewNode) => {
                const isDraggedSubtree = Boolean(
                  draggingId && (previewNode.id === draggingId || isDescendant(tree, draggingId, previewNode.id))
                );
                const node = isDraggedSubtree
                  ? baseMap.nodes.find((candidate) => candidate.id === previewNode.id) || previewNode
                  : previewNode;
                return (
                <NodeView
                  key={node.id}
                  node={node}
                  selected={selectedId === node.id}
                  editing={editingId === node.id}
                  dropMode={dropIntent?.targetId === node.id ? dropIntent.mode : null}
                  animatePosition={!isDraggedSubtree}
                  offset={
                    nodeDragRef.current &&
                    (nodeDragRef.current.id === node.id || isDescendant(tree, nodeDragRef.current.id, node.id))
                      ? dragOffset
                      : { x: 0, y: 0 }
                  }
                  onSelect={() => setSelectedId(node.id)}
                  onEdit={() => {
                    setSelectedId(node.id);
                    setEditingId(node.id);
                  }}
                  onLabelChange={(label) => {
                    mutateTree((draft) => {
                      const target = findNode(draft, node.id);
                      if (target) target.label = label;
                    });
                  }}
                  onFinishEditing={() => setEditingId(null)}
                  onAdd={() => addChild(node.id)}
                  onResizeStart={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    undoHistoryRef.current.push(cloneTree(tree));
                    nodeResizeRef.current = {
                      id: node.id,
                      startX: event.clientX,
                      startWidth: getNodeSize(node.depth, node.width).width,
                      direction: node.side === "left" ? -1 : 1
                    };
                  }}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setSelectedId(node.id);
                    nodeDragRef.current = { id: node.id, x: event.clientX, y: event.clientY };
                    setDraggingId(node.id);
                  }}
                />
                );
              })}
            </g>
          </svg>

        </div>
      </div>
    </div>
  );
}

function NodeView({
  node,
  selected,
  editing,
  dropMode,
  animatePosition,
  offset,
  onSelect,
  onEdit,
  onLabelChange,
  onFinishEditing,
  onAdd,
  onResizeStart,
  onDragStart
}: {
  node: LayoutNode;
  selected: boolean;
  editing: boolean;
  dropMode: DropIntent["mode"] | null;
  animatePosition: boolean;
  offset: { x: number; y: number };
  onSelect: () => void;
  onEdit: () => void;
  onLabelChange: (label: string) => void;
  onFinishEditing: () => void;
  onAdd: () => void;
  onResizeStart: (event: ReactPointerEvent<SVGGElement>) => void;
  onDragStart: (event: ReactPointerEvent<SVGGElement>) => void;
}) {
  const size = getNodeSize(node.depth, node.width);
  const isLineNode = node.depth >= 3;
  const lineY = size.height - 8;
  const textX = node.side === "left" ? size.width - 8 : 8;
  const lines = wrapLabel(node.label || "未命名节点", Math.max(8, Math.floor((size.width - 24) / 12)), 3);
  return (
    <g
      style={{
        transform: `translate(${node.x + offset.x}px, ${node.y + offset.y}px)`,
        transition: animatePosition ? "transform 150ms cubic-bezier(.22,.8,.3,1)" : "none"
      }}
      onPointerDown={onDragStart}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onEdit();
      }}
      className={`research-mindmap-node ${isLineNode ? "is-line-node" : ""} ${node.side === "left" ? "is-left-branch" : ""}`}
    >
      {isLineNode ? (
        <>
          <rect width={size.width} height={size.height} fill="transparent" />
          <line
            x1="0"
            y1={lineY}
            x2={size.width}
            y2={lineY}
            stroke={dropMode === "child" ? "rgba(168,156,255,.58)" : selected ? "#8f7bff" : "rgba(168,156,255,.34)"}
            strokeWidth={dropMode === "child" || selected ? 2 : 1.35}
          />
        </>
      ) : (
        <rect
          width={size.width}
          height={size.height}
          rx={node.depth === 0 ? 18 : 14}
          fill={node.depth === 0 ? "#6652e8" : node.depth === 1 ? "#302b45" : "#25242c"}
          stroke={dropMode === "child" ? "rgba(168,156,255,.55)" : selected ? "#8f7bff" : "rgba(255,255,255,.11)"}
          strokeWidth={dropMode === "child" || selected ? 2 : 1}
        />
      )}
      {editing ? (
        <foreignObject x="0" y="0" width={size.width} height={size.height}>
          <input
            className="research-mindmap-inline-input"
            value={node.label}
            autoFocus
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onChange={(event) => onLabelChange(event.target.value)}
            onBlur={onFinishEditing}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.currentTarget.blur();
              }
            }}
          />
        </foreignObject>
      ) : (
        <text
          x={isLineNode ? textX : size.width / 2}
          y={isLineNode ? lineY - 12 - ((lines.length - 1) * 17) : size.height / 2 - ((lines.length - 1) * 9)}
          textAnchor={isLineNode ? (node.side === "left" ? "end" : "start") : "middle"}
          dominantBaseline="middle"
          fill="#f7f7f8"
          fontFamily="ui-sans-serif,system-ui,sans-serif"
          fontSize={node.depth === 0 ? 14 : node.depth === 1 ? 12.5 : 11.5}
          fontWeight={node.depth === 0 ? 700 : node.depth === 1 ? 600 : 500}
          pointerEvents="none"
        >
          {lines.map((line, index) => <tspan key={`${line}-${index}`} x={isLineNode ? textX : size.width / 2} dy={index ? 17 : 0}>{line}</tspan>)}
        </text>
      )}
      {selected ? (
        <g
          transform={`translate(${node.side === "left" ? 0 : size.width} ${isLineNode ? lineY : size.height / 2})`}
          className="research-mindmap-node-resize"
          onPointerDown={onResizeStart}
          onClick={(event) => event.stopPropagation()}
        >
          <circle r="8" fill="#17171b" stroke="#8f7bff" strokeWidth="1.5" />
          <path d="M -2.5 -3 V 3 M 2.5 -3 V 3" stroke="#cfc7ff" strokeWidth="1.2" />
        </g>
      ) : null}
      {selected ? (
        <g
          transform={`translate(${node.side === "left" ? -13 : size.width + 13} ${getNodeAnchorY(node.depth, size.height)})`}
          className="research-mindmap-node-add"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onAdd();
          }}
        >
          <circle r="11" fill="#302b48" stroke="rgba(183,170,255,.62)" />
          <path d="M -4 0 H 4 M 0 -4 V 4" stroke="#e8e4ff" strokeWidth="1.5" />
        </g>
      ) : null}
    </g>
  );
}

function buildMindMapTree(content: string) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstHeading = lines.find((line) => /^#{1,3}\s+/.test(line));
  const root: TreeNode = { id: "root", label: cleanLine(firstHeading || lines[0] || "产品策划案").slice(0, 72), children: [] };
  const baseHeadingLevel = firstHeading?.match(/^(#{1,3})/)?.[1].length || 1;
  const stack: TreeNode[] = [root];
  const detailCounts = new Map<string, number>();
  const seenLabels = new Set<string>([root.label]);
  let index = 0;
  for (const rawLine of lines) {
    if (rawLine === firstHeading) continue;
    const heading = rawLine.match(/^(#{1,4})\s+(.+)/);
    const bullet = rawLine.match(/^(?:[-*•]|\d+[.)、])\s+(.+)/);
    const emphasized = rawLine.match(/^\*\*([^*]+)\*\*[：:]\s*(.+)$/);

    if (heading) {
      const desiredDepth = Math.max(1, Math.min(4, heading[1].length - baseHeadingLevel + 1));
      const label = cleanLine(heading[2]);
      if (label.length < 2 || seenLabels.has(label)) continue;
      while (stack.length > desiredDepth) stack.pop();
      const parent = stack[stack.length - 1] || root;
      const node: TreeNode = { id: `node-${index++}`, label: label.slice(0, 160), children: [] };
      parent.children.push(node);
      stack.push(node);
      seenLabels.add(label);
    } else if (bullet) {
      const label = cleanLine(bullet[1]);
      if (label.length < 2 || seenLabels.has(label)) continue;
      const parent = stack[stack.length - 1] || root;
      parent.children.push({ id: `node-${index++}`, label: label.slice(0, 180), children: [] });
      seenLabels.add(label);
    } else {
      const parent = stack[stack.length - 1] || root;
      const currentCount = detailCounts.get(parent.id) || 0;
      const clean = cleanLine(emphasized ? `${emphasized[1]}：${emphasized[2]}` : rawLine);
      const isUsefulDetail =
        emphasized ||
        /^(?:结论|核心观点|机会判断|策略建议|关键发现|产品机会|用户价值|行业变化|竞争机会)[：:]/.test(clean) ||
        /(?:因此|这意味着|核心问题|核心机会|需要从|转向|升级为|价值空白)/.test(clean);
      if (
        isUsefulDetail &&
        currentCount < 4 &&
        clean.length >= 8 &&
        clean.length <= 220 &&
        !seenLabels.has(clean)
      ) {
        parent.children.push({ id: `node-${index++}`, label: clean.slice(0, 200), children: [] });
        detailCounts.set(parent.id, currentCount + 1);
        seenLabels.add(clean);
      }
    }
    if (index >= 96) break;
  }
  if (!root.children.length) {
    lines.slice(1, 12).forEach((line) => root.children.push({ id: `node-${index++}`, label: cleanLine(line).slice(0, 120), children: [] }));
  }
  return root;
}

function layoutTree(root: TreeNode) {
  const detachedRoots = root.children.filter((child) => child.detached);
  const attachedChildren = root.children.filter((child) => !child.detached);
  const rightChildren = attachedChildren.filter((child) => child.side !== "left");
  const leftChildren = attachedChildren.filter((child) => child.side === "left");
  const right = layoutTreeComponent({ ...root, children: rightChildren });
  const leftRaw = layoutTreeComponent({ ...root, children: leftChildren });
  const rootWidth = getNodeSize(0, root.width).width;
  const left = {
    ...leftRaw,
    nodes: leftRaw.nodes.map((node) => {
      const width = getNodeSize(node.depth, node.width).width;
      return { ...node, x: rootWidth - node.x - width, ...(node.id === root.id ? {} : { side: "left" as const }) };
    }),
    edges: leftRaw.edges.map((edge) => ({ ...edge, id: `left-${edge.id}`, path: mirrorEdgePath(edge.path, rootWidth) }))
  };
  const rightRoot = right.nodes.find((node) => node.id === root.id)!;
  const leftRoot = left.nodes.find((node) => node.id === root.id)!;
  const rootY = Math.max(rightRoot.y, leftRoot.y);
  const rightDy = rootY - rightRoot.y;
  const leftDy = rootY - leftRoot.y;
  const combinedNodes = [
    ...right.nodes.map((node) => ({ ...node, y: node.y + rightDy })),
    ...left.nodes.filter((node) => node.id !== root.id).map((node) => ({ ...node, y: node.y + leftDy }))
  ];
  const combinedEdges = [
    ...right.edges.map((edge) => ({ ...edge, path: translateEdgePath(edge.path, 0, rightDy) })),
    ...left.edges.map((edge) => ({ ...edge, path: translateEdgePath(edge.path, 0, leftDy) }))
  ];
  const minX = Math.min(0, ...combinedNodes.map((node) => node.x));
  const mainShiftX = -minX;
  const main = {
    nodes: combinedNodes.map((node) => ({ ...node, x: node.x + mainShiftX })),
    edges: combinedEdges.map((edge) => ({ ...edge, path: translateEdgePath(edge.path, mainShiftX, 0) })),
    width: 0,
    height: Math.max(right.height + rightDy, left.height + leftDy)
  };
  const mainRootNode = main.nodes.find((node) => node.id === root.id);
  const mainDx = root.position && mainRootNode ? root.position.x - mainRootNode.x : 0;
  const mainDy = root.position && mainRootNode ? root.position.y - mainRootNode.y : 0;
  const nodes = main.nodes.map((node) => ({ ...node, x: node.x + mainDx, y: node.y + mainDy }));
  const edges = main.edges.map((edge) => ({ ...edge, path: translateEdgePath(edge.path, mainDx, mainDy) }));

  detachedRoots.forEach((detachedRoot) => {
    const component = layoutTreeComponent({ ...detachedRoot, detached: false }, 1);
    const componentRoot = component.nodes.find((node) => node.id === detachedRoot.id);
    if (!componentRoot) return;
    const position = detachedRoot.position || { x: 48, y: main.height + 72 };
    const dx = position.x - componentRoot.x;
    const dy = position.y - componentRoot.y;
    component.nodes.forEach((node) => nodes.push({
      ...node,
      x: node.x + dx,
      y: node.y + dy,
      parentId: node.id === detachedRoot.id ? null : node.parentId
    }));
    component.edges.forEach((edge) => edges.push({
      ...edge,
      id: `detached-${edge.id}`,
      path: translateEdgePath(edge.path, dx, dy)
    }));
  });

  return {
    nodes,
    edges,
    width: Math.max(...nodes.map((node) => node.x + getNodeSize(node.depth, node.width).width), ROOT_NODE_WIDTH) + 28,
    height: Math.max(...nodes.map((node) => node.y + getNodeSize(node.depth).height), ROOT_NODE_HEIGHT) + 28
  };
}

function mirrorEdgePath(path: string, axisX: number) {
  const values = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (!values || values.length !== 8) return path;
  return `M ${axisX - values[0]} ${values[1]} C ${axisX - values[2]} ${values[3]}, ${axisX - values[4]} ${values[5]}, ${axisX - values[6]} ${values[7]}`;
}

function layoutTreeComponent(root: TreeNode, startDepth = 0) {
  const nodes: LayoutNode[] = [];
  let nextY = 0;
  const columnWidths = new Map<number, number>();
  const collectWidths = (node: TreeNode, depth: number) => {
    columnWidths.set(depth, Math.max(columnWidths.get(depth) || 0, getNodeSize(depth, node.width).width));
    node.children.forEach((child) => collectWidths(child, depth + 1));
  };
  collectWidths(root, startDepth);
  const depthX = (depth: number) => {
    let x = 0;
    for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
      x += (columnWidths.get(currentDepth) || getNodeSize(currentDepth).width) + COLUMN_GAP;
    }
    return x;
  };
  const position = (node: TreeNode, depth: number, parentId: string | null): LayoutNode => {
    const size = getNodeSize(depth, node.width);
    const children = node.children.map((child) => position(child, depth + 1, node.id));
    const y = children.length
      ? (
          children[0].y +
          getNodeSize(children[0].depth).height / 2 +
          children[children.length - 1].y +
          getNodeSize(children[children.length - 1].depth).height / 2
        ) / 2 - size.height / 2
      : (() => {
          const value = nextY;
          nextY += size.height + ROW_GAP;
          return value;
        })();
    const layoutNode: LayoutNode = { ...node, children: node.children, depth, parentId, x: depthX(depth), y };
    nodes.push(layoutNode);
    return layoutNode;
  };
  position(root, startDepth, null);
  nodes.sort((a, b) => a.depth - b.depth);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = nodes.flatMap((parent) => parent.children.map((childRef) => {
    const child = byId.get(childRef.id)!;
    const parentSize = getNodeSize(parent.depth, parent.width);
    const childSize = getNodeSize(child.depth, child.width);
    const startX = parent.x + parentSize.width;
    const startY = parent.y + getNodeAnchorY(parent.depth, parentSize.height);
    const endX = child.x;
    const endY = child.y + getNodeAnchorY(child.depth, childSize.height);
    const bend = startX + (endX - startX) * 0.5;
    return {
      id: `${parent.id}-${child.id}`,
      parentId: parent.id,
      childId: child.id,
      path: `M ${startX} ${startY} C ${bend} ${startY}, ${bend} ${endY}, ${endX} ${endY}`
    };
  }));
  return {
    nodes,
    edges,
    width: Math.max(...nodes.map((node) => node.x + getNodeSize(node.depth, node.width).width)) + 28,
    height: Math.max(ROOT_NODE_HEIGHT, nextY - ROW_GAP)
  };
}

function translateEdgePath(path: string, dx: number, dy: number) {
  const values = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (!values || values.length !== 8) return path;
  return `M ${values[0] + dx} ${values[1] + dy} C ${values[2] + dx} ${values[3] + dy}, ${values[4] + dx} ${values[5] + dy}, ${values[6] + dx} ${values[7] + dy}`;
}

function inferDropIntent({
  tree,
  map,
  draggedId,
  x,
  y,
  current
}: {
  tree: TreeNode;
  map: ReturnType<typeof layoutTree>;
  draggedId: string;
  x: number;
  y: number;
  current: DropIntent | null;
}): DropIntent | null {
  const candidates = map.nodes
    .filter((node) => node.id !== draggedId && !isDescendant(tree, draggedId, node.id))
    .map((node) => {
      const size = getNodeSize(node.depth, node.width);
      const rootTarget = node.id === tree.id;
      const left = node.x - (rootTarget ? 220 : 88);
      const right = node.x + size.width + (rootTarget ? 220 : 112);
      const top = node.y - (rootTarget ? 220 : 52);
      const bottom = node.y + size.height + (rootTarget ? 220 : 52);
      if (x < left || x > right || y < top || y > bottom) return null;
      const dx = x < node.x ? node.x - x : x > node.x + size.width ? x - node.x - size.width : 0;
      const dy = y < node.y ? node.y - y : y > node.y + size.height ? y - node.y - size.height : 0;
      const score = dx * 0.7 + dy + Math.abs(y - (node.y + size.height / 2)) * 0.08;
      return { node, size, score };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => a.score - b.score);

  const candidate = candidates[0];
  if (!candidate) return null;
  const { node, size } = candidate;
  if (node.id === tree.id) {
    return {
      targetId: node.id,
      mode: "child",
      side: x < node.x + size.width / 2 ? "left" : "right"
    };
  }

  const inChildZone = node.side === "left"
    ? x <= node.x + size.width * 0.28
    : x >= node.x + size.width * 0.72;
  if (inChildZone) return { targetId: node.id, mode: "child" };

  const centerY = node.y + getNodeAnchorY(node.depth, size.height);
  if (
    current?.targetId === node.id &&
    (current.mode === "before" || current.mode === "after") &&
    Math.abs(y - centerY) < 14
  ) {
    return current;
  }
  return { targetId: node.id, mode: y < centerY ? "before" : "after" };
}

function compareTrees(original: TreeNode, modified: TreeNode) {
  const originalIndex = indexTree(original);
  const modifiedIndex = indexTree(modified);
  const ignoredDetachedIds = collectDetachedNodeIds(modified);
  const changes: string[] = [];
  modifiedIndex.forEach((entry, id) => {
    const before = originalIndex.get(id);
    if (!before) changes.push(`新增“${entry.node.label}”，位于“${entry.parentLabel || "根节点"}”下`);
    else {
      if (before.node.label !== entry.node.label) changes.push(`将“${before.node.label}”修改为“${entry.node.label}”`);
      if (before.parentId !== entry.parentId) changes.push(`将“${entry.node.label}”移动到“${entry.parentLabel || "根节点"}”下`);
      else if (before.siblingIndex !== entry.siblingIndex) {
        changes.push(`调整“${entry.node.label}”在“${entry.parentLabel || "根节点"}”下的排列位置`);
      }
    }
  });
  originalIndex.forEach((entry, id) => {
    if (!modifiedIndex.has(id) && !ignoredDetachedIds.has(id)) {
      changes.push(`删除“${entry.node.label}”及其下属内容`);
    }
  });
  return changes;
}

function indexTree(root: TreeNode) {
  const index = new Map<string, {
    node: TreeNode;
    parentId: string | null;
    parentLabel: string | null;
    siblingIndex: number;
  }>();
  const visit = (node: TreeNode, parent: TreeNode | null, siblingIndex: number) => {
    if (node.detached) return;
    const effectiveParent = parent;
    index.set(node.id, {
      node,
      parentId: effectiveParent?.id || null,
      parentLabel: effectiveParent?.label || null,
      siblingIndex
    });
    node.children.forEach((child, childIndex) => visit(child, node, childIndex));
  };
  visit(root, null, 0);
  return index;
}

function serializeTree(root: TreeNode) {
  const lines: string[] = [];
  const visit = (node: TreeNode, depth: number) => {
    lines.push(`${"  ".repeat(depth)}- ${node.label}`);
    node.children.filter((child) => !child.detached).forEach((child) => visit(child, depth + 1));
  };
  visit({ ...root, children: root.children.filter((child) => !child.detached) }, 0);
  return lines.join("\n");
}

function collectDetachedNodeIds(root: TreeNode) {
  const ids = new Set<string>();
  const collect = (node: TreeNode) => {
    ids.add(node.id);
    node.children.forEach(collect);
  };
  root.children.filter((child) => child.detached).forEach(collect);
  return ids;
}

function moveNodeInTree(root: TreeNode, nodeId: string, intent: DropIntent) {
  const { targetId, mode, side } = intent;
  if (nodeId === root.id || nodeId === targetId) return;
  const movingNode = findNode(root, nodeId);
  if (!movingNode || findNode(movingNode, targetId)) return;
  const sourceParent = findParent(root, nodeId);
  const target = findNode(root, targetId);
  if (!sourceParent || !target) return;
  const sourceIndex = sourceParent.children.findIndex((child) => child.id === nodeId);
  const [removed] = sourceParent.children.splice(sourceIndex, 1);
  if (!removed) return;
  delete removed.detached;
  delete removed.position;

  if (mode === "child" || target.id === root.id) {
    if (target.id === root.id) removed.side = side || "right";
    else delete removed.side;
    target.children.push(removed);
    return;
  }
  const targetParent = findParent(root, targetId);
  if (!targetParent) {
    sourceParent.children.splice(Math.max(0, sourceIndex), 0, removed);
    return;
  }
  const targetIndex = targetParent.children.findIndex((child) => child.id === targetId);
  if (targetParent.id === root.id) removed.side = target.side || "right";
  else delete removed.side;
  targetParent.children.splice(targetIndex + (mode === "after" ? 1 : 0), 0, removed);
}

function detachNodeInTree(root: TreeNode, nodeId: string, position: { x: number; y: number }) {
  const sourceParent = findParent(root, nodeId);
  if (!sourceParent) return;
  const sourceIndex = sourceParent.children.findIndex((child) => child.id === nodeId);
  const [removed] = sourceParent.children.splice(sourceIndex, 1);
  if (!removed) return;
  removed.detached = true;
  removed.position = position;
  root.children.push(removed);
}

function findNode(root: TreeNode, id: string): TreeNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function findParent(root: TreeNode, childId: string): TreeNode | null {
  if (root.children.some((child) => child.id === childId)) return root;
  for (const child of root.children) {
    const found = findParent(child, childId);
    if (found) return found;
  }
  return null;
}

function isDescendant(root: TreeNode, ancestorId: string, candidateId: string) {
  const ancestor = findNode(root, ancestorId);
  return Boolean(ancestor && ancestor.id !== candidateId && findNode(ancestor, candidateId));
}

function cloneTree<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cleanLine(line: string) {
  return line.replace(/^#{1,6}\s*/, "").replace(/^(?:[-*•]|\d+[.)、])\s*/, "").replace(/\*\*/g, "").replace(/`/g, "").trim();
}

function wrapLabel(label: string, maxCharacters: number, maxLines = 3) {
  const result: string[] = [];
  let remaining = label;
  while (remaining && result.length < maxLines) {
    result.push(remaining.slice(0, maxCharacters));
    remaining = remaining.slice(maxCharacters);
  }
  if (remaining && result.length) {
    result[result.length - 1] = `${result[result.length - 1].slice(0, -1)}…`;
  }
  return result.length ? result : [""];
}

function sanitizeXMindFilename(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim();
  return (cleaned || "思维导图").slice(0, 60);
}

function renderExportSvg(map: ReturnType<typeof layoutTree>, width: number, height: number, padding: number) {
  const edges = map.edges.map((edge) => `<path d="${edge.path}" fill="none" stroke="#5f577e" stroke-width="1.5"/>`).join("");
  const nodes = map.nodes.map((node) => {
    const size = getNodeSize(node.depth, node.width);
    const lines = wrapLabel(node.label, Math.max(8, Math.floor((size.width - 24) / 12)), 3);
    const text = lines.map((line, index) => `<tspan x="${size.width / 2}" dy="${index ? 17 : 0}">${escapeXml(line)}</tspan>`).join("");
    if (node.depth >= 3) {
      const lineY = size.height - 8;
      return `<g transform="translate(${node.x} ${node.y})"><line x1="0" y1="${lineY}" x2="${size.width}" y2="${lineY}" stroke="#756a9f" stroke-width="1.35"/><text x="${size.width / 2}" y="${lineY - 12 - ((lines.length - 1) * 17)}" text-anchor="middle" dominant-baseline="middle" fill="#f4f4f5" font-family="Arial,sans-serif" font-size="12" font-weight="500">${text}</text></g>`;
    }
    const fill = node.depth === 0 ? "#6652e8" : node.depth === 1 ? "#302b45" : "#25242c";
    return `<g transform="translate(${node.x} ${node.y})"><rect width="${size.width}" height="${size.height}" rx="14" fill="${fill}" stroke="#45434b"/><text x="${size.width / 2}" y="${size.height / 2 - ((lines.length - 1) * 9)}" text-anchor="middle" dominant-baseline="middle" fill="#f4f4f5" font-family="Arial,sans-serif" font-size="12" font-weight="600">${text}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#121214"/><g transform="translate(${padding} ${padding})">${edges}${nodes}</g></svg>`;
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[character] || character);
}
