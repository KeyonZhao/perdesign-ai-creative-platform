"use client";

import { Bold, Download, Loader2, Maximize2, Minus, Plus, RefreshCw, X } from "lucide-react";
import JSZip from "jszip";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
  detachedDepth?: number;
  position?: { x: number; y: number };
  width?: number;
  side?: "left" | "right";
  fontSize?: number;
  fontColor?: string;
  fontWeight?: 400 | 500 | 600 | 700 | 800 | 900;
  mergeSourceIds?: string[];
  extraTargetIds?: string[];
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

type SelectedConnection =
  | { kind: "tree"; parentId: string; childId: string }
  | { kind: "merge"; sourceId: string; targetId: string }
  | { kind: "extra"; sourceId: string; targetId: string };

const ROOT_NODE_WIDTH = 286;
const ROOT_NODE_HEIGHT = 82;
const COLUMN_GAP = 104;
const ROW_GAP = 28;
const MIND_MAP_TEXT_COLORS = [
  { label: "默认", value: "#f7f7f8" },
  { label: "红", value: "#ef4444" },
  { label: "黄", value: "#facc15" },
  { label: "蓝", value: "#3b82f6" },
  { label: "绿", value: "#22c55e" },
  { label: "青", value: "#06b6d4" },
  { label: "橙", value: "#f97316" },
  { label: "紫", value: "#a855f7" }
] as const;

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
  const baseMap = useMemo(() => positionMergeNodes(layoutTree(tree)), [tree]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasDragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const selectionDragRef = useRef<{ x: number; y: number; additive: boolean } | null>(null);
  const nodeDragRef = useRef<{ id: string; ids: string[]; x: number; y: number } | null>(null);
  const nodeResizeRef = useRef<{ id: string; startX: number; startWidth: number; direction: 1 | -1 } | null>(null);
  const connectionDragRef = useRef<{ sourceId: string; startX: number; startY: number } | null>(null);
  const nextNodeIdRef = useRef(1);
  const undoHistoryRef = useRef<TreeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<SelectedConnection | null>(null);
  const [isGroupHandleHovered, setIsGroupHandleHovered] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [connectionPreview, setConnectionPreview] = useState<{ x: number; y: number; targetId: string | null } | null>(null);
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

  const map = baseMap;
  const groupHandle = useMemo(() => {
    if (selectedIds.length < 2) return null;
    const parentIds = selectedIds.map((id) => findParent(tree, id)?.id || null);
    if (!parentIds[0] || parentIds.some((id) => id !== parentIds[0])) return null;
    const nodes = selectedIds.map((id) => map.nodes.find((node) => node.id === id)).filter((node): node is LayoutNode => Boolean(node));
    if (nodes.length < 2) return null;
    const centers = nodes.map((node) => node.y + getNodeSize(node.depth, node.width).height / 2);
    return {
      x: Math.max(...nodes.map((node) => node.x + getNodeSize(node.depth, node.width).width)) + 58,
      y: (Math.min(...centers) + Math.max(...centers)) / 2,
      nodes
    };
  }, [map.nodes, selectedIds, tree]);
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
    setSelectedIds([]);
    setEditingId(null);
    setDropIntent(null);
    setDraggingId(null);
  }

  function selectNode(nodeId: string, additive = false) {
    setSelectedConnection(null);
    setSelectedId(nodeId);
    setSelectedIds((current) => additive
      ? current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId]
      : [nodeId]);
  }

  function updateSelectedTypography(patch: Pick<TreeNode, "fontSize" | "fontColor" | "fontWeight">) {
    if (!selectedIds.length) return;
    mutateTree((draft) => selectedIds.forEach((id) => Object.assign(findNode(draft, id) || {}, patch)));
  }

  function groupSelectedNodes() {
    if (selectedIds.length < 2) return;
    const parentIds = selectedIds.map((id) => findParent(tree, id)?.id || null);
    if (!parentIds[0] || parentIds.some((id) => id !== parentIds[0])) return;
    const group = makeNode("合集节点");
    group.mergeSourceIds = [...selectedIds];
    mutateTree((draft) => {
      // A collection is a downstream convergence node: selected nodes stay in
      // place and collectively point to the new node on their next level.
      const firstSelected = findNode(draft, selectedIds[0]);
      if (!firstSelected) return;
      firstSelected.children.push(group);
    });
    setSelectedId(group.id);
    setSelectedIds([group.id]);
    setIsGroupHandleHovered(false);
    setEditingId(group.id);
  }

  function makeNode(label = "新节点"): TreeNode {
    return { id: `added-${Date.now()}-${nextNodeIdRef.current++}`, label, children: [], fontWeight: 400 };
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

  function selectConnection(connection: SelectedConnection) {
    setSelectedConnection(connection);
    setSelectedId(null);
    setSelectedIds([]);
    setEditingId(null);
  }

  function deleteSelectedConnection() {
    if (!selectedConnection) return;
    const connection = selectedConnection;
    if (connection.kind === "tree") {
      const child = baseMap.nodes.find((node) => node.id === connection.childId);
      if (!child) return;
      mutateTree((draft) => detachNodeInTree(draft, connection.childId, { x: child.x, y: child.y }, child.depth));
    } else if (connection.kind === "merge") {
      const targetLayout = baseMap.nodes.find((node) => node.id === connection.targetId);
      mutateTree((draft) => {
        const target = findNode(draft, connection.targetId);
        if (!target) return;
        target.mergeSourceIds = (target.mergeSourceIds || []).filter((id) => id !== connection.sourceId);
        if (!target.mergeSourceIds.length) {
          delete target.mergeSourceIds;
          if (targetLayout) detachNodeInTree(draft, target.id, { x: targetLayout.x, y: targetLayout.y }, targetLayout.depth);
        }
      });
    } else {
      mutateTree((draft) => {
        const source = findNode(draft, connection.sourceId);
        if (!source) return;
        source.extraTargetIds = (source.extraTargetIds || []).filter((id) => id !== connection.targetId);
        if (!source.extraTargetIds.length) delete source.extraTargetIds;
      });
    }
    setSelectedConnection(null);
  }

  function moveNode(nodeId: string, intent: DropIntent) {
    const { targetId, mode } = intent;
    if (nodeId === tree.id || nodeId === targetId) return;
    const movingNode = findNode(tree, nodeId);
    if (!movingNode || findNode(movingNode, targetId)) return;
    mutateTree((draft) => moveNodeInTree(draft, nodeId, intent));
  }

  function detachNode(nodeId: string, position: { x: number; y: number }, depth: number) {
    if (nodeId === tree.id) return;
    mutateTree((draft) => detachNodeInTree(draft, nodeId, position, depth));
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
      if (selectedConnection && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        deleteSelectedConnection();
        return;
      }
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
    const connectionDrag = connectionDragRef.current;
    if (connectionDrag) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left - pan.x) / scale;
      const y = (event.clientY - rect.top - pan.y) / scale;
      const target = findConnectionTarget(baseMap.nodes, connectionDrag.sourceId, x, y);
      setConnectionPreview({ x, y, targetId: target?.id || null });
      return;
    }
    const selection = selectionDragRef.current;
    if (selection) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left - pan.x) / scale;
      const y = (event.clientY - rect.top - pan.y) / scale;
      setSelectionRect({ x: Math.min(selection.x, x), y: Math.min(selection.y, y), width: Math.abs(x - selection.x), height: Math.abs(y - selection.y) });
      return;
    }
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
      if (nodeDrag.ids.length > 1) {
        setDropIntent(null);
        return;
      }
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
    if (connectionDragRef.current) {
      const connectionDrag = connectionDragRef.current;
      const moved = connectionPreview
        ? Math.hypot(connectionPreview.x - connectionDrag.startX, connectionPreview.y - connectionDrag.startY)
        : 0;
      if (moved < 10) addChild(connectionDrag.sourceId);
      else if (connectionPreview?.targetId) {
        const targetId = connectionPreview.targetId;
        mutateTree((draft) => {
          const source = findNode(draft, connectionDrag.sourceId);
          if (!source || source.id === targetId) return;
          const target = findNode(draft, targetId);
          if (!target) return;
          const sourceParent = findParent(draft, source.id);
          const targetParent = findParent(draft, target.id);
          const alreadyTreeConnected = sourceParent?.id === target.id || targetParent?.id === source.id;
          const alreadyMerged = Boolean(source.mergeSourceIds?.includes(target.id) || target.mergeSourceIds?.includes(source.id));
          const alreadyExtraConnected = Boolean(source.extraTargetIds?.includes(target.id) || target.extraTargetIds?.includes(source.id));
          if (alreadyTreeConnected || alreadyMerged || alreadyExtraConnected) return;
          source.extraTargetIds = [...new Set([...(source.extraTargetIds || []), targetId])];
        });
      }
      connectionDragRef.current = null;
      setConnectionPreview(null);
      return;
    }
    if (selectionDragRef.current) {
      if (selectionRect) {
        const hits = map.nodes.filter((node) => {
          const size = getNodeSize(node.depth, node.width);
          return node.x < selectionRect.x + selectionRect.width && node.x + size.width > selectionRect.x && node.y < selectionRect.y + selectionRect.height && node.y + size.height > selectionRect.y;
        }).map((node) => node.id);
        setSelectedIds((current) => selectionDragRef.current?.additive ? [...new Set([...current, ...hits])] : hits);
        setSelectedId(hits.at(-1) || null);
      }
      selectionDragRef.current = null;
      setSelectionRect(null);
      return;
    }
    if (nodeResizeRef.current) {
      nodeResizeRef.current = null;
      return;
    }
    const nodeDrag = nodeDragRef.current;
    if (nodeDrag && nodeDrag.ids.length > 1 && Math.hypot(dragOffset.x, dragOffset.y) > 2) {
      mutateTree((draft) => {
        nodeDrag.ids.forEach((nodeId) => {
          const sourceNode = baseMap.nodes.find((node) => node.id === nodeId);
          if (!sourceNode || nodeId === draft.id) return;
          const target = findNode(draft, nodeId);
          if (!target) return;
          target.position = {
            x: sourceNode.x + dragOffset.x,
            y: sourceNode.y + dragOffset.y
          };
        });
      });
    } else if (nodeDrag?.id === tree.id && Math.hypot(dragOffset.x, dragOffset.y) > 2) {
      const sourceNode = baseMap.nodes.find((node) => node.id === tree.id);
      if (sourceNode) {
        mutateTree((draft) => {
          draft.position = {
            x: sourceNode.x + dragOffset.x,
            y: sourceNode.y + dragOffset.y
          };
        });
      }
    } else if (nodeDrag && dropIntent) {
      moveNode(nodeDrag.id, dropIntent);
    } else if (nodeDrag && findNode(tree, nodeDrag.id)?.detached && Math.hypot(dragOffset.x, dragOffset.y) > 2) {
      const sourceNode = baseMap.nodes.find((node) => node.id === nodeDrag.id);
      if (sourceNode) {
        detachNode(nodeDrag.id, {
          x: sourceNode.x + dragOffset.x,
          y: sourceNode.y + dragOffset.y
        }, sourceNode.depth);
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
      creator: { name: "Perdesign AI", version: "1.0.5" },
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

  const activeDragIds = nodeDragRef.current?.ids || (draggingId ? [draggingId] : []);
  const isInDraggedSelection = (nodeId: string) => activeDragIds.includes(nodeId);
  const isInDraggedBranch = (nodeId: string) => activeDragIds.some((rootId) => {
    const dragRoot = findNode(tree, rootId);
    return Boolean(dragRoot && findNode(dragRoot, nodeId));
  });
  const groupHandleIsDragging = Boolean(groupHandle && groupHandle.nodes.every((node) => isInDraggedSelection(node.id)));
  const liveGroupHandle = groupHandle ? {
    ...groupHandle,
    x: groupHandle.x + (groupHandleIsDragging ? dragOffset.x : 0),
    y: groupHandle.y + (groupHandleIsDragging ? dragOffset.y : 0)
  } : null;

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
            {selectedIds.length ? (
              <div className="research-mindmap-type-tools" aria-label="节点字体工具">
                <button
                  type="button"
                  className={selectedIds.every((id) => findNode(tree, id)?.fontWeight === 900) ? "active" : ""}
                  onClick={() => updateSelectedTypography({ fontWeight: selectedIds.every((id) => findNode(tree, id)?.fontWeight === 900) ? 400 : 900 })}
                  title="切换加粗"
                ><Bold className="h-4 w-4" /></button>
                <select
                  aria-label="字号"
                  value={findNode(tree, selectedId || "")?.fontSize || 12}
                  onChange={(event) => updateSelectedTypography({ fontSize: Number(event.target.value) })}
                >
                  {[10, 11, 12, 14, 16, 18, 20, 24].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                <div className="research-mindmap-color-swatches" aria-label="字体颜色">
                  {MIND_MAP_TEXT_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      className={(findNode(tree, selectedId || "")?.fontColor || "#f7f7f8") === color.value ? "selected" : ""}
                      style={{ "--swatch-color": color.value } as CSSProperties}
                      onClick={() => updateSelectedTypography({ fontColor: color.value })}
                      title={color.label}
                      aria-label={`${color.label}色字体`}
                    />
                  ))}
                </div>
                <small>{selectedIds.length} 个节点</small>
              </div>
            ) : null}
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
              if (event.target !== event.currentTarget) return;
              if (event.button === 1 || event.button === 2) {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                canvasDragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
                return;
              }
              if (event.button !== 0) return;
              if (!event.shiftKey) {
                setSelectedId(null);
                setSelectedIds([]);
                setSelectedConnection(null);
              }
              setEditingId(null);
              event.currentTarget.setPointerCapture(event.pointerId);
              const rect = event.currentTarget.getBoundingClientRect();
              selectionDragRef.current = {
                x: (event.clientX - rect.left - pan.x) / scale,
                y: (event.clientY - rect.top - pan.y) / scale,
                additive: event.shiftKey
              };
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerInteraction}
            onPointerCancel={finishPointerInteraction}
            onContextMenu={(event) => event.preventDefault()}
            onDoubleClick={(event) => {
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              addBlankCanvasNode(
                (event.clientX - rect.left - pan.x) / scale - getNodeSize(1).width / 2,
                (event.clientY - rect.top - pan.y) / scale - getNodeSize(1).height / 2
              );
            }}
            onWheel={(event: WheelEvent<SVGSVGElement>) => {
              event.preventDefault();
              if (event.altKey || event.ctrlKey || event.metaKey) {
                setZoom(scale * (event.deltaY > 0 ? 0.9 : 1.1));
                return;
              }
              setPan((current) => ({
                ...current,
                y: current.y - event.deltaY
              }));
            }}
          >
            <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
              {map.edges.map((edge) => {
                if (map.nodes.find((node) => node.id === edge.childId)?.mergeSourceIds?.length) return null;
                const parentDragged = isInDraggedSelection(edge.parentId);
                const childDragged = isInDraggedSelection(edge.childId);
                const parentNode = (parentDragged ? baseMap : map).nodes.find((node) => node.id === edge.parentId);
                const childNode = (childDragged ? baseMap : map).nodes.find((node) => node.id === edge.childId);
                if (!parentNode || !childNode) return null;
                const livePath = buildLiveConnectionPath(
                  parentNode,
                  childNode,
                  parentDragged ? dragOffset : { x: 0, y: 0 },
                  childDragged ? dragOffset : { x: 0, y: 0 }
                );
                const connection: SelectedConnection = { kind: "tree", parentId: edge.parentId, childId: edge.childId };
                const isSelected = selectedConnection?.kind === "tree" && selectedConnection.parentId === edge.parentId && selectedConnection.childId === edge.childId;
                return (
                  <g key={edge.id} onClick={(event) => { event.stopPropagation(); selectConnection(connection); }} className="research-mindmap-connection">
                    <path d={livePath} fill="none" stroke="transparent" strokeWidth="14" />
                    <path d={livePath} fill="none" stroke={isSelected ? "rgba(213,205,255,.95)" : "rgba(168,156,255,.28)"} strokeWidth={isSelected ? 3 : 1.5} pointerEvents="none" />
                  </g>
                );
              })}
              {map.nodes.flatMap((target) => {
                if (!target.mergeSourceIds?.length) return [];
                const targetDragged = isInDraggedSelection(target.id);
                const liveTarget = (targetDragged ? baseMap : map).nodes.find((node) => node.id === target.id) || target;
                const targetOffset = targetDragged ? dragOffset : { x: 0, y: 0 };
                return target.mergeSourceIds.map((sourceId) => {
                  const sourceDragged = isInDraggedSelection(sourceId);
                  const source = (sourceDragged ? baseMap : map).nodes.find((candidate) => candidate.id === sourceId);
                  if (!source) return null;
                  const livePath = buildLiveConnectionPath(source, liveTarget, sourceDragged ? dragOffset : { x: 0, y: 0 }, targetOffset);
                  const isSelected = selectedConnection?.kind === "merge" && selectedConnection.sourceId === sourceId && selectedConnection.targetId === target.id;
                  return (
                    <g key={`merge-${sourceId}-${target.id}`} onClick={(event) => { event.stopPropagation(); selectConnection({ kind: "merge", sourceId, targetId: target.id }); }} className="research-mindmap-connection">
                      <path d={livePath} fill="none" stroke="transparent" strokeWidth="14" />
                      <path d={livePath} fill="none" stroke={isSelected ? "rgba(213,205,255,.95)" : "rgba(168,156,255,.34)"} strokeWidth={isSelected ? 3 : 1.5} pointerEvents="none" />
                    </g>
                  );
                });
              })}
              {map.nodes.flatMap((sourcePreview) => (sourcePreview.extraTargetIds || []).map((targetId) => {
                const sourceDragged = isInDraggedSelection(sourcePreview.id);
                const targetDragged = isInDraggedSelection(targetId);
                const source = (sourceDragged ? baseMap : map).nodes.find((node) => node.id === sourcePreview.id) || sourcePreview;
                const target = (targetDragged ? baseMap : map).nodes.find((node) => node.id === targetId);
                if (!target) return null;
                const livePath = buildLiveConnectionPath(
                  source,
                  target,
                  sourceDragged ? dragOffset : { x: 0, y: 0 },
                  targetDragged ? dragOffset : { x: 0, y: 0 }
                );
                const isSelected = selectedConnection?.kind === "extra" && selectedConnection.sourceId === source.id && selectedConnection.targetId === targetId;
                return (
                  <g key={`extra-${source.id}-${targetId}`} onClick={(event) => { event.stopPropagation(); selectConnection({ kind: "extra", sourceId: source.id, targetId }); }} className="research-mindmap-connection">
                    <path d={livePath} fill="none" stroke="transparent" strokeWidth="14" />
                    <path d={livePath} fill="none" stroke={isSelected ? "rgba(213,205,255,.95)" : "rgba(168,156,255,.34)"} strokeWidth={isSelected ? 3 : 1.5} pointerEvents="none" />
                  </g>
                );
              }))}
              {connectionDragRef.current && connectionPreview ? (() => {
                const source = baseMap.nodes.find((node) => node.id === connectionDragRef.current?.sourceId);
                if (!source) return null;
                const sourceSize = getNodeSize(source.depth, source.width);
                const startX = source.side === "left" ? source.x : source.x + sourceSize.width;
                const startY = source.y + getNodeAnchorY(source.depth, sourceSize.height);
                const target = connectionPreview.targetId ? baseMap.nodes.find((node) => node.id === connectionPreview.targetId) : null;
                const endX = target ? (target.side === "left" ? target.x + getNodeSize(target.depth, target.width).width : target.x) : connectionPreview.x;
                const endY = target ? target.y + getNodeAnchorY(target.depth, getNodeSize(target.depth, target.width).height) : connectionPreview.y;
                const bend = (startX + endX) / 2;
                return <path d={`M ${startX} ${startY} C ${bend} ${startY}, ${bend} ${endY}, ${endX} ${endY}`} fill="none" stroke="rgba(138,194,255,.8)" strokeWidth="2" strokeDasharray="6 5" pointerEvents="none" />;
              })() : null}
              {draggingId && dropIntent ? (() => {
                const target = baseMap.nodes.find((node) => node.id === dropIntent.targetId);
                if (!target) return null;
                const targetSize = getNodeSize(target.depth, target.width);
                const targetTreeNode = findNode(tree, target.id);
                const intendedParentTree = dropIntent.mode === "child" ? targetTreeNode : findParent(tree, target.id);
                const intendedParent = intendedParentTree
                  ? baseMap.nodes.find((node) => node.id === intendedParentTree.id)
                  : null;
                if (!intendedParent) return null;
                const parentSize = getNodeSize(intendedParent.depth, intendedParent.width);
                const goesLeft = dropIntent.mode === "child"
                  ? dropIntent.side === "left" || target.side === "left"
                  : target.side === "left";
                const anchorX = dropIntent.mode === "child"
                  ? target.x + (goesLeft ? -34 : targetSize.width + 34)
                  : target.x + (goesLeft ? targetSize.width + 30 : -30);
                let anchorY = target.y + getNodeAnchorY(target.depth, targetSize.height);
                if (dropIntent.mode === "before" || dropIntent.mode === "after") {
                  const siblings = intendedParentTree?.children || [];
                  const targetIndex = siblings.findIndex((node) => node.id === target.id);
                  const adjacentId = dropIntent.mode === "before"
                    ? siblings[targetIndex - 1]?.id
                    : siblings[targetIndex + 1]?.id;
                  const adjacent = adjacentId ? baseMap.nodes.find((node) => node.id === adjacentId) : null;
                  if (dropIntent.mode === "before") {
                    anchorY = adjacent
                      ? (adjacent.y + getNodeSize(adjacent.depth, adjacent.width).height + target.y) / 2
                      : target.y - ROW_GAP / 2;
                  } else {
                    anchorY = adjacent
                      ? (target.y + targetSize.height + adjacent.y) / 2
                      : target.y + targetSize.height + ROW_GAP / 2;
                  }
                }
                const startX = intendedParent.x + (goesLeft ? 0 : parentSize.width);
                const startY = intendedParent.y + getNodeAnchorY(intendedParent.depth, parentSize.height);
                const siblingBranchX = target.x + (goesLeft ? targetSize.width : 0);
                const bendTargetX = dropIntent.mode === "child" ? anchorX : siblingBranchX;
                const bend = startX + (bendTargetX - startX) * 0.5;
                const previewPath = `M ${startX} ${startY} C ${bend} ${startY}, ${bend} ${anchorY}, ${anchorX} ${anchorY}`;
                return (
                  <g pointerEvents="none">
                    <path
                      d={previewPath}
                      fill="none"
                      stroke="rgba(166,142,255,.72)"
                      strokeWidth="2"
                      strokeDasharray="5 5"
                    />
                    <circle cx={anchorX} cy={anchorY} r="12" fill="rgba(139,121,255,.12)" />
                    <circle cx={anchorX} cy={anchorY} r="6.5" fill="#8b79ff" stroke="rgba(229,223,255,.95)" strokeWidth="1.5" />
                  </g>
                );
              })() : null}
              {liveGroupHandle && isGroupHandleHovered ? liveGroupHandle.nodes.map((node) => {
                const size = getNodeSize(node.depth, node.width);
                const nodeIsDragging = isInDraggedSelection(node.id);
                const startX = node.x + size.width + (nodeIsDragging ? dragOffset.x : 0);
                const startY = node.y + getNodeAnchorY(node.depth, size.height) + (nodeIsDragging ? dragOffset.y : 0);
                const endX = liveGroupHandle.x - 18;
                const bend = startX + (endX - startX) * 0.55;
                return (
                  <path
                    key={`group-preview-${node.id}`}
                    d={`M ${startX} ${startY} C ${bend} ${startY}, ${bend} ${liveGroupHandle.y}, ${endX} ${liveGroupHandle.y}`}
                    fill="none"
                    stroke="rgba(164,143,255,.48)"
                    strokeWidth="1.7"
                    strokeDasharray="6 6"
                    pointerEvents="none"
                  />
                );
              }) : null}
              {selectionRect ? <rect {...selectionRect} fill="rgba(139,121,255,.09)" stroke="rgba(154,139,255,.7)" strokeWidth="1.5" strokeDasharray="6 5" pointerEvents="none" /> : null}
              {map.nodes.map((previewNode) => {
                const isDraggedSubtree = isInDraggedSelection(previewNode.id);
                const node = isDraggedSubtree
                  ? baseMap.nodes.find((candidate) => candidate.id === previewNode.id) || previewNode
                  : previewNode;
                return (
                <NodeView
                  key={node.id}
                  node={node}
                  selected={selectedIds.includes(node.id)}
                  showAddHandle={selectedIds.length === 1}
                  showResizeHandles={selectedIds.length < 2}
                  editing={editingId === node.id}
                  dropMode={dropIntent?.targetId === node.id ? dropIntent.mode : null}
                  animatePosition={!isDraggedSubtree}
                  dimmed={Boolean(nodeDragRef.current && isInDraggedBranch(node.id))}
                  offset={
                    nodeDragRef.current && isInDraggedSelection(node.id)
                      ? dragOffset
                      : { x: 0, y: 0 }
                  }
                  onSelect={(additive) => {
                    if (!additive && selectedIds.length > 1 && selectedIds.includes(node.id)) {
                      setSelectedId(node.id);
                      return;
                    }
                    selectNode(node.id, additive);
                  }}
                  onEdit={() => {
                    selectNode(node.id);
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
                  onConnectionStart={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const size = getNodeSize(node.depth, node.width);
                    const startX = node.side === "left" ? node.x : node.x + size.width;
                    const startY = node.y + getNodeAnchorY(node.depth, size.height);
                    connectionDragRef.current = { sourceId: node.id, startX, startY };
                    setConnectionPreview({ x: startX, y: startY, targetId: null });
                  }}
                  onResizeStart={(event, direction) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    selectNode(node.id);
                    undoHistoryRef.current.push(cloneTree(tree));
                    nodeResizeRef.current = {
                      id: node.id,
                      startX: event.clientX,
                      startWidth: getNodeSize(node.depth, node.width).width,
                      direction
                    };
                  }}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const keepMultiSelection = selectedIds.length > 1 && selectedIds.includes(node.id) && !event.shiftKey;
                    const dragIds = keepMultiSelection ? [...new Set(selectedIds)] : [node.id];
                    if (!keepMultiSelection) selectNode(node.id, event.shiftKey);
                    const primaryId = dragIds[0] || node.id;
                    nodeDragRef.current = { id: primaryId, ids: dragIds, x: event.clientX, y: event.clientY };
                    setDraggingId(primaryId);
                  }}
                />
                );
              })}
              {liveGroupHandle ? (
                <g
                  transform={`translate(${liveGroupHandle.x} ${liveGroupHandle.y})`}
                  className="research-mindmap-group-add"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    groupSelectedNodes();
                  }}
                  onMouseEnter={() => setIsGroupHandleHovered(true)}
                  onMouseLeave={() => setIsGroupHandleHovered(false)}
                >
                  <circle r="17" fill="#302b48" stroke="rgba(190,177,255,.82)" strokeWidth="1.6" />
                  <circle r="12" fill="rgba(139,121,255,.12)" />
                  <path d="M -5.5 0 H 5.5 M 0 -5.5 V 5.5" stroke="#f0edff" strokeWidth="1.9" strokeLinecap="round" />
                  <title>创建合集节点</title>
                </g>
              ) : null}
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
  showAddHandle,
  showResizeHandles,
  editing,
  dropMode,
  animatePosition,
  dimmed,
  offset,
  onSelect,
  onEdit,
  onLabelChange,
  onFinishEditing,
  onAdd,
  onConnectionStart,
  onResizeStart,
  onDragStart
}: {
  node: LayoutNode;
  selected: boolean;
  showAddHandle: boolean;
  showResizeHandles: boolean;
  editing: boolean;
  dropMode: DropIntent["mode"] | null;
  animatePosition: boolean;
  dimmed: boolean;
  offset: { x: number; y: number };
  onSelect: (additive: boolean) => void;
  onEdit: () => void;
  onLabelChange: (label: string) => void;
  onFinishEditing: () => void;
  onAdd: () => void;
  onConnectionStart: (event: ReactPointerEvent<SVGGElement>) => void;
  onResizeStart: (event: ReactPointerEvent<SVGRectElement>, direction: 1 | -1) => void;
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
        opacity: dimmed ? 0.42 : 1,
        transition: `${animatePosition ? "transform 150ms cubic-bezier(.22,.8,.3,1), " : ""}opacity 120ms ease`
      }}
      onPointerDown={onDragStart}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(event.shiftKey);
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
            style={{
              color: node.fontColor || "#f7f7f8",
              fontSize: `${node.fontSize || (node.depth === 0 ? 14 : node.depth === 1 ? 12.5 : 11.5)}px`,
              fontWeight: node.fontWeight || (node.depth === 0 ? 700 : node.depth === 1 ? 600 : 500)
            }}
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
          fill={node.fontColor || "#f7f7f8"}
          fontFamily="ui-sans-serif,system-ui,sans-serif"
          fontSize={node.fontSize || (node.depth === 0 ? 14 : node.depth === 1 ? 12.5 : 11.5)}
          fontWeight={node.fontWeight || (node.depth === 0 ? 700 : node.depth === 1 ? 600 : 500)}
          pointerEvents="none"
        >
          {lines.map((line, index) => <tspan key={`${line}-${index}`} x={isLineNode ? textX : size.width / 2} dy={index ? 17 : 0}>{line}</tspan>)}
        </text>
      )}
      {showResizeHandles ? (
        <>
          <rect
            x="-7"
            y="0"
            width="14"
            height={size.height}
            fill="transparent"
            className="research-mindmap-node-resize-edge"
            onPointerDown={(event) => onResizeStart(event, -1)}
            onClick={(event) => event.stopPropagation()}
          />
          <rect
            x={size.width - 7}
            y="0"
            width="14"
            height={size.height}
            fill="transparent"
            className="research-mindmap-node-resize-edge"
            onPointerDown={(event) => onResizeStart(event, 1)}
            onClick={(event) => event.stopPropagation()}
          />
        </>
      ) : null}
      {selected && showAddHandle ? (
        <g
          transform={`translate(${node.side === "left" ? -20 : size.width + 20} ${getNodeAnchorY(node.depth, size.height)})`}
          className="research-mindmap-node-add"
          onPointerDown={onConnectionStart}
          onClick={(event) => event.stopPropagation()}
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
    const mergeSourceDepths = (detachedRoot.mergeSourceIds || [])
      .map((sourceId) => main.nodes.find((node) => node.id === sourceId)?.depth)
      .filter((depth): depth is number => depth != null);
    const preservedDepth = detachedRoot.detachedDepth
      ?? (mergeSourceDepths.length ? Math.max(...mergeSourceDepths) + 1 : 1);
    const component = layoutTreeComponent({ ...detachedRoot, detached: false }, preservedDepth);
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

function positionMergeNodes<T extends ReturnType<typeof layoutTree>>(map: T): T {
  const nodes = map.nodes.map((node) => ({ ...node }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, LayoutNode[]>();
  nodes.forEach((node) => {
    if (!node.parentId) return;
    childrenByParent.set(node.parentId, [...(childrenByParent.get(node.parentId) || []), node]);
  });

  const shiftSubtree = (nodeId: string, dy: number) => {
    const node = byId.get(nodeId);
    if (!node) return;
    node.y += dy;
    (childrenByParent.get(nodeId) || []).forEach((child) => shiftSubtree(child.id, dy));
  };

  nodes.forEach((node) => {
    if (!node.mergeSourceIds?.length || node.detached || node.position) return;
    const sources = node.mergeSourceIds.map((id) => byId.get(id)).filter((source): source is LayoutNode => Boolean(source));
    if (!sources.length) return;
    const centers = sources.map((source) => source.y + getNodeSize(source.depth, source.width).height / 2);
    const targetHeight = getNodeSize(node.depth, node.width).height;
    const targetY = centers.reduce((sum, value) => sum + value, 0) / centers.length - targetHeight / 2;
    shiftSubtree(node.id, targetY - node.y);
  });

  const edges = map.edges.map((edge) => {
    const parent = byId.get(edge.parentId);
    const child = byId.get(edge.childId);
    return parent && child
      ? { ...edge, path: buildLiveConnectionPath(parent, child, { x: 0, y: 0 }, { x: 0, y: 0 }) }
      : edge;
  });
  return {
    ...map,
    nodes,
    edges,
    height: Math.max(map.height, ...nodes.map((node) => node.y + getNodeSize(node.depth, node.width).height + 28))
  };
}

function buildLiveConnectionPath(
  source: LayoutNode,
  target: LayoutNode,
  sourceOffset: { x: number; y: number },
  targetOffset: { x: number; y: number }
) {
  const sourceSize = getNodeSize(source.depth, source.width);
  const targetSize = getNodeSize(target.depth, target.width);
  const travelsLeft = target.x + targetOffset.x < source.x + sourceOffset.x;
  const startX = source.x + sourceOffset.x + (travelsLeft ? 0 : sourceSize.width);
  const endX = target.x + targetOffset.x + (travelsLeft ? targetSize.width : 0);
  const startY = source.y + sourceOffset.y + getNodeAnchorY(source.depth, sourceSize.height);
  const endY = target.y + targetOffset.y + getNodeAnchorY(target.depth, targetSize.height);
  const bend = (startX + endX) / 2;
  return `M ${startX} ${startY} C ${bend} ${startY}, ${bend} ${endY}, ${endX} ${endY}`;
}

function findConnectionTarget(nodes: LayoutNode[], sourceId: string, x: number, y: number) {
  return nodes
    .filter((node) => node.id !== sourceId)
    .map((node) => {
      const size = getNodeSize(node.depth, node.width);
      const dx = x < node.x ? node.x - x : x > node.x + size.width ? x - node.x - size.width : 0;
      const dy = y < node.y ? node.y - y : y > node.y + size.height ? y - node.y - size.height : 0;
      return { node, distance: Math.hypot(dx, dy) };
    })
    .filter((entry) => entry.distance <= 42)
    .sort((a, b) => a.distance - b.distance)[0]?.node || null;
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
    const layoutNode: LayoutNode = {
      ...node,
      children: node.children,
      depth,
      parentId,
      x: node.position?.x ?? depthX(depth),
      y: node.position?.y ?? y
    };
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
  delete removed.detachedDepth;

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

function detachNodeInTree(root: TreeNode, nodeId: string, position: { x: number; y: number }, depth: number) {
  const sourceParent = findParent(root, nodeId);
  if (!sourceParent) return;
  const sourceIndex = sourceParent.children.findIndex((child) => child.id === nodeId);
  const [removed] = sourceParent.children.splice(sourceIndex, 1);
  if (!removed) return;
  removed.detached = true;
  removed.detachedDepth = depth;
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
