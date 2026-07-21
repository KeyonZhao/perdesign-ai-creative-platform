"use client";

import { Download, HardDrive, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import type { LocalGalleryStats } from "@/lib/local-gallery";
import { formatBytes } from "@/lib/image";

type LocalHistoryModalProps = {
  open: boolean;
  stats: LocalGalleryStats | null;
  loading?: boolean;
  hasResults: boolean;
  onClose: () => void;
  onExport: () => Promise<void>;
  onImport: (file: File) => Promise<void>;
  onClear: () => Promise<void>;
};

export function LocalHistoryModal({
  open,
  stats,
  loading = false,
  hasResults,
  onClose,
  onExport,
  onImport,
  onClear
}: LocalHistoryModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busyAction, setBusyAction] = useState<"export" | "import" | "clear" | null>(null);

  if (!open) return null;

  async function runAction(action: "export" | "clear", callback: () => Promise<void>) {
    setBusyAction(action);
    try {
      await callback();
    } finally {
      setBusyAction(null);
    }
  }

  async function importFile(file: File) {
    setBusyAction("import");
    try {
      await onImport(file);
    } finally {
      setBusyAction(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const browserUsageRatio = stats?.browserUsage && stats.browserQuota
    ? Math.min(100, (stats.browserUsage / stats.browserQuota) * 100)
    : 0;

  return (
    <div className="local-history-backdrop" onClick={onClose}>
      <section className="local-history-dialog" role="dialog" aria-modal="true" aria-label="本地作品" onClick={(event) => event.stopPropagation()}>
        <header className="local-history-header">
          <div className="local-history-heading">
            <span className="local-history-icon"><HardDrive className="h-5 w-5" /></span>
            <div>
              <h2>本地作品</h2>
              <p>图片仅保存在当前设备的浏览器中</p>
            </div>
          </div>
          <button type="button" className="local-history-close" onClick={onClose} aria-label="关闭本地作品">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="local-history-body">
          <div className="local-history-stats">
            <div>
              <span>已保存图片</span>
              <strong>{loading ? "..." : stats?.imageCount || 0}</strong>
            </div>
            <div>
              <span>作品占用</span>
              <strong>{loading ? "..." : formatBytes(stats?.savedBytes || 0)}</strong>
            </div>
            <div>
              <span>生成批次</span>
              <strong>{loading ? "..." : stats?.batchCount || 0}</strong>
            </div>
          </div>

          <div className="local-history-storage">
            <div className="local-history-storage-title">
              <span>浏览器空间</span>
              <span>{stats?.browserUsage !== undefined && stats.browserQuota !== undefined
                ? `${formatBytes(stats.browserUsage)} / ${formatBytes(stats.browserQuota)}`
                : "由浏览器管理"}</span>
            </div>
            <div className="local-history-progress"><span style={{ width: `${browserUsageRatio}%` }} /></div>
            <div className={`local-history-persistence ${stats?.persistent ? "active" : ""}`}>
              <ShieldCheck className="h-4 w-4" />
              {stats?.persistent ? "已启用持久化保护" : "已自动申请持久化保护，是否获批由浏览器决定"}
            </div>
          </div>

          <div className="local-history-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void runAction("export", onExport)}
              disabled={!hasResults || busyAction !== null}
            >
              <Download className="h-4 w-4" />
              {busyAction === "export" ? "正在导出" : "导出项目"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={busyAction !== null}>
              <Upload className="h-4 w-4" />
              {busyAction === "import" ? "正在导入" : "导入项目"}
            </button>
            <button
              type="button"
              className="local-history-delete"
              onClick={() => void runAction("clear", onClear)}
              disabled={!hasResults || busyAction !== null}
            >
              <Trash2 className="h-4 w-4" />
              {busyAction === "clear" ? "正在清空" : "清空历史"}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".zip,application/zip"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
        </div>
      </section>
    </div>
  );
}
