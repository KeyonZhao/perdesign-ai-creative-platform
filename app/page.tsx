"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bot,
  ArrowUp,
  Check,
  Copy,
  Download,
  FileDown,
  Grid3X3,
  Loader2,
  Mic,
  MessageSquareText,
  Network,
  Palette,
  Pencil,
  Plus,
  PlugZap,
  SendHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { ControlPanel } from "@/components/ControlPanel";
import { Gallery } from "@/components/Gallery";
import { ResearchMindMapModal, type MindMapRevisionRequest, type MindMapTreeData } from "@/components/ResearchMindMapModal";
import { Toast } from "@/components/Toast";
import { VentEditor } from "@/components/VentEditor";
import {
  clearLocalGenerationBatches,
  deleteLocalGenerationBatch,
  getLocalGalleryStats,
  loadLocalGenerationBatches,
  replaceLocalGenerationBatches,
  requestPersistentLocalStorage,
  saveLocalGenerationBatch,
  type LocalGalleryStats
} from "@/lib/local-gallery";
import { exportPerdesignProject, importPerdesignProject } from "@/lib/project-backup";
import { convertImageDataUrlToPng, prepareImageForVision, prepareLocalEditImages } from "@/lib/image";
import { buildCreativeDivergencePrompt } from "@/lib/creative-divergence";
import { buildEcommercePosterPrompt } from "@/lib/ecommerce-poster";
import { downloadResearchWord } from "@/lib/research-word";
import {
  addPendingImageJob,
  loadPendingImageJobs,
  removePendingImageJob,
  type PendingImageJob
} from "@/lib/pending-image-jobs";
import type {
  CreativeDivergenceRequest,
  CustomCanvasGenerationRequest,
  GenerationBatch,
  GenerationResult,
  GenerationSourceImage,
  GenerationStatus,
  GenerationType,
  ProductInputMode,
  ToastMessage,
  UploadedImage,
  VideoGenerationRequest
} from "@/lib/types";
import { makeId } from "@/lib/utils";

const storageKeys = {
  activeSection: "product-workstation-active-section",
  authCode: "product-workstation-auth-code",
  imageApiKey: "product-workstation-image-api-key",
  imageApiBaseUrl: "product-workstation-image-api-base-url",
  chatApiKey: "product-workstation-chat-api-key",
  chatApiBaseUrl: "product-workstation-chat-api-base-url",
  requirement: "product-workstation-requirement",
  count: "product-workstation-count",
  size: "product-workstation-size",
  quality: "product-workstation-quality",
  productName: "product-workstation-product-name",
  innovationLevel: "product-workstation-innovation-level"
};

const BRAIN_MODEL = "gpt-5.5";
const AUTH_CODE = "perdesignsg";
const DEFAULT_IMAGE_API_BASE_URL = "https://task-api-1.65535.space/apimart/v1";
const DEFAULT_CHAT_API_BASE_URL = "https://api2.65535.space/v1";
const SCENE_GENERATION_PROMPT = "分析图片中的产品品类，生成该品类经常出现在的场景下的产品场景图";
const PRESET_CHAT_API_KEY = "server-managed";
const PRESET_IMAGE_API_KEY = "server-managed";
const MAX_IMAGE_GENERATION_CONCURRENCY = 20;
const RESEARCH_HISTORY_STORAGE_KEY = "perdesign-research-history-v1";
const MIND_MAP_HISTORY_STORAGE_KEY = "perdesign-mindmap-history-v1";
const researchScrollPositions = new Map<string, number>();
const RESEARCH_WELCOME_MESSAGE =
  "你好，我是品物 AI 策划师。你可以从项目想法、现有问题或希望达成的目标开始说起。";

type WorkspaceSection = "research" | "design" | "vent" | "mindmap" | "api";
type ActiveMindMap = {
  message: ResearchMessage;
  tree: MindMapTreeData;
};
type MindMapSession = ActiveMindMap & {
  id: string;
  title: string;
  updatedAt: number;
  canRevise: boolean;
  analysisMode?: "ai";
  analysisVersion?: string;
};
type ResearchFile = {
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  extractedText?: string;
};
type PendingAuthAction =
  | { type: "generate" }
  | { type: "research" }
  | { type: "multi-view"; result: GenerationResult }
  | { type: "scene"; result: GenerationResult }
  | { type: "ecommerce-poster"; result: GenerationResult; productName?: string; instruction?: string }
  | { type: "divergence"; result: GenerationResult; productName?: string; request: CreativeDivergenceRequest }
  | { type: "image-prompt"; result: GenerationResult; instruction: string; referenceImages?: GenerationSourceImage[] }
  | { type: "video"; result: GenerationResult; request: VideoGenerationRequest }
  | { type: "local-edit"; result: GenerationResult; maskImageBase64: string; instruction: string; guideImageBase64?: string }
  | { type: "custom-generate"; request: CustomCanvasGenerationRequest }
  | null;
type ResearchMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  files?: ResearchFile[];
  sources?: Array<string | ResearchWebSource>;
  images?: ResearchWebImage[];
};
type ResearchWebSource = { title: string; url: string; snippet?: string; domain?: string };
type ResearchWebImage = { url: string; sourceUrl: string; sourceTitle: string; alt?: string };
type ResearchSession = {
  id: string;
  title: string;
  customTitle?: boolean;
  updatedAt: number;
  messages: ResearchMessage[];
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: null | (() => void);
  onerror: null | ((event: { error?: string }) => void);
  onresult: null | ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void);
  start: () => void;
  stop: () => void;
  abort: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

export default function Home() {
  const [activeSection, setActiveSection] = usePersistedState(storageKeys.activeSection, "design");
  const [authCode, setAuthCode] = usePersistedState(storageKeys.authCode, "");
  const [imageApiKey, setImageApiKey] = usePersistedState(storageKeys.imageApiKey, "");
  const [imageApiBaseUrl, setImageApiBaseUrl] = usePersistedState(
    storageKeys.imageApiBaseUrl,
    DEFAULT_IMAGE_API_BASE_URL
  );
  const [chatApiKey, setChatApiKey] = usePersistedState(storageKeys.chatApiKey, "");
  const [chatApiBaseUrl, setChatApiBaseUrl] = usePersistedState(
    storageKeys.chatApiBaseUrl,
    DEFAULT_CHAT_API_BASE_URL
  );
  const imageModel = "gpt-image-2";
  const [productName, setProductName] = usePersistedState(storageKeys.productName, "");
  const [requirement, setRequirement] = usePersistedState(storageKeys.requirement, "");
  const [count, setCount] = usePersistedNumber(storageKeys.count, 4);
  const [size, setSize] = usePersistedState(storageKeys.size, "1024x1024");
  const [quality, setQuality] = usePersistedState(storageKeys.quality, "high");
  const [productInputMode, setProductInputMode] = useState<ProductInputMode>("product");
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
  const [innovationLevel, setInnovationLevel] = usePersistedNumber(storageKeys.innovationLevel, 50);
  const [promptBeforeOptimization, setPromptBeforeOptimization] = useState<string | null>(null);
  const [authDraft, setAuthDraft] = useState("");
  const [authModalValue, setAuthModalValue] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAuthAction, setPendingAuthAction] = useState<PendingAuthAction>(null);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [generationBatches, setGenerationBatches] = useState<GenerationBatch[]>([]);
  const generationBatchesRef = useRef<GenerationBatch[]>([]);
  const hasRecoveredPendingJobsRef = useRef(false);
  const designDescriptionTasksRef = useRef<Map<string, Promise<string>>>(new Map());
  const [designDescriptionLoadingIds, setDesignDescriptionLoadingIds] = useState<string[]>([]);
  const [localHistoryStats, setLocalHistoryStats] = useState<LocalGalleryStats | null>(null);
  const [isLocalHistoryReady, setIsLocalHistoryReady] = useState(false);
  const [activeGenerationBatchId, setActiveGenerationBatchId] = useState<string | null>(null);
  const [pendingGenerationCount, setPendingGenerationCount] = useState(0);
  const [mobileDesignSettingsOpen, setMobileDesignSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [researchInput, setResearchInput] = useState("");
  const [researchFiles, setResearchFiles] = useState<ResearchFile[]>([]);
  const [isResearchListening, setIsResearchListening] = useState(false);
  const [isResearchResponding, setIsResearchResponding] = useState(false);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [researchMessages, setResearchMessages] = useState<ResearchMessage[]>(() => createResearchWelcomeMessages());
  const [researchSessions, setResearchSessions] = useState<ResearchSession[]>([]);
  const [activeResearchSessionId, setActiveResearchSessionId] = useState("");
  const [isResearchHistoryReady, setIsResearchHistoryReady] = useState(false);
  const [activeMindMap, setActiveMindMap] = useState<ActiveMindMap | null>(null);
  const [isImportingMindMap, setIsImportingMindMap] = useState(false);
  const [isGeneratingMindMap, setIsGeneratingMindMap] = useState(false);
  const mindMapGenerationLockRef = useRef(false);
  const [mindMapGenerationError, setMindMapGenerationError] = useState("");
  const [mindMapSessions, setMindMapSessions] = useState<MindMapSession[]>([]);
  const [activeMindMapSessionId, setActiveMindMapSessionId] = useState("");
  const isAuthorized = normalizeAuthCode(authCode) === AUTH_CODE;
  const hasChatConfig = isAuthorized;
  const canGenerate = Boolean(
    productName.trim() ||
    requirement.trim() ||
    uploadedImage ||
    referenceImages.length
  );

  useEffect(() => {
    setAuthDraft(authCode);
    setAuthModalValue(authCode);
  }, [authCode]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(MIND_MAP_HISTORY_STORAGE_KEY) || "[]") as MindMapSession[];
      if (Array.isArray(parsed) && parsed.length) {
        const sorted = [...parsed].sort((a, b) => b.updatedAt - a.updatedAt);
        setMindMapSessions(sorted);
        setActiveMindMapSessionId(sorted[0].id);
        setActiveMindMap({ message: sorted[0].message, tree: sorted[0].tree });
        return;
      }
    } catch {
      // 本地导图历史损坏时以空白导图重新开始。
    }
    const blank = createBlankMindMapSession();
    setMindMapSessions([blank]);
    setActiveMindMapSessionId(blank.id);
    setActiveMindMap({ message: blank.message, tree: blank.tree });
    persistMindMapSessions([blank]);
  }, []);

  useEffect(() => {
    if (isAuthorized) {
      if (imageApiKey !== PRESET_IMAGE_API_KEY) setImageApiKey(PRESET_IMAGE_API_KEY);
      if (chatApiKey !== PRESET_CHAT_API_KEY) setChatApiKey(PRESET_CHAT_API_KEY);
      if (imageApiBaseUrl !== DEFAULT_IMAGE_API_BASE_URL) setImageApiBaseUrl(DEFAULT_IMAGE_API_BASE_URL);
      if (chatApiBaseUrl !== DEFAULT_CHAT_API_BASE_URL) setChatApiBaseUrl(DEFAULT_CHAT_API_BASE_URL);
      return;
    }

    if (imageApiKey) setImageApiKey("");
    if (chatApiKey) setChatApiKey("");
  }, [
    chatApiBaseUrl,
    chatApiKey,
    imageApiBaseUrl,
    imageApiKey,
    isAuthorized,
    setChatApiBaseUrl,
    setChatApiKey,
    setImageApiBaseUrl,
    setImageApiKey
  ]);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(RESEARCH_HISTORY_STORAGE_KEY) || "[]") as ResearchSession[];
      const valid = parsed
        .filter((session) =>
          session?.id &&
          Array.isArray(session.messages) &&
          hasMeaningfulResearchSessionContent(session.messages)
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 40);
      localStorage.setItem(RESEARCH_HISTORY_STORAGE_KEY, JSON.stringify(valid));
      if (valid.length) {
        setResearchSessions(valid);
        setActiveResearchSessionId(valid[0].id);
        setResearchMessages(valid[0].messages);
      } else {
        const session = createResearchSessionRecord();
        setResearchSessions([session]);
        setActiveResearchSessionId(session.id);
        setResearchMessages(session.messages);
      }
    } catch {
      const session = createResearchSessionRecord();
      setResearchSessions([session]);
      setActiveResearchSessionId(session.id);
      setResearchMessages(session.messages);
    } finally {
      setIsResearchHistoryReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isResearchHistoryReady || !activeResearchSessionId) return;
    setResearchSessions((current) => {
      const storedMessages = sanitizeResearchMessages(researchMessages);
      const existingSession = current.find((session) => session.id === activeResearchSessionId);
      if (
        existingSession &&
        JSON.stringify(existingSession.messages) === JSON.stringify(storedMessages)
      ) {
        return current;
      }
      const nextSession: ResearchSession = {
        id: activeResearchSessionId,
        title: existingSession?.customTitle
          ? existingSession.title
          : getResearchSessionTitle(storedMessages),
        customTitle: existingSession?.customTitle,
        updatedAt: Date.now(),
        messages: storedMessages
      };
      const existingIndex = current.findIndex((session) => session.id === activeResearchSessionId);
      const next = existingIndex >= 0
        ? current.map((session) => session.id === activeResearchSessionId ? nextSession : session)
        : [nextSession, ...current].slice(0, 40);
      const sortedNext = sortResearchSessionsByUpdatedAt(next);
      try {
        localStorage.setItem(RESEARCH_HISTORY_STORAGE_KEY, JSON.stringify(sortedNext));
      } catch {
        // Keep the in-memory history available if browser storage is full or unavailable.
      }
      return sortedNext;
    });
  }, [activeResearchSessionId, isResearchHistoryReady, researchMessages]);

  useEffect(() => {
    let cancelled = false;

    async function restoreLocalHistory() {
      try {
        const batches = await loadLocalGenerationBatches();
        if (cancelled) return;
        generationBatchesRef.current = batches;
        setGenerationBatches(batches);
        setActiveGenerationBatchId(batches.at(-1)?.id || null);
        setLocalHistoryStats(await getLocalGalleryStats());
      } catch (error) {
        if (cancelled) return;
        const toast = {
          id: makeId("toast"),
          type: "error" as const,
          message: error instanceof Error ? error.message : "本地作品恢复失败。"
        };
        setToasts((current) => [...current, toast]);
        window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 4200);
      } finally {
        if (!cancelled) setIsLocalHistoryReady(true);
      }
    }

    void restoreLocalHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLocalHistoryReady || !isAuthorized || hasRecoveredPendingJobsRef.current) return;
    hasRecoveredPendingJobsRef.current = true;
    const pendingJobs = loadPendingImageJobs();
    if (!pendingJobs.length) return;

    let cancelled = false;
    const config = getResolvedConfig();
    setStatus("generating");
    setPendingGenerationCount(pendingJobs.length);
    setActiveGenerationBatchId(pendingJobs.at(-1)?.batchId || null);
    pushToast("info", `正在恢复 ${pendingJobs.length} 个未完成的生图任务。`);

    void Promise.allSettled(
      pendingJobs.map(async (job) => {
        try {
          const imageBase64 = await pollImageJob(job.jobId, config);
          if (cancelled) return;
          removePendingImageJob(job.jobId);
          await upsertRecoveredJobResult(job, {
            id: `async-job-${job.jobId}`,
            title: `Concept ${String(job.sequence).padStart(2, "0")}`,
            prompt: job.prompt,
            imageBase64
          });
        } catch (error) {
          if (cancelled) return;
          if (error instanceof TerminalImageJobError) removePendingImageJob(job.jobId);
          await upsertRecoveredJobResult(job, {
            id: `async-job-${job.jobId}`,
            title: `Concept ${String(job.sequence).padStart(2, "0")}`,
            prompt: job.prompt,
            error: error instanceof Error ? error.message : "任务恢复失败，请稍后刷新重试。"
          });
        } finally {
          if (!cancelled) {
            setPendingGenerationCount((current) => Math.max(0, current - 1));
          }
        }
      })
    ).then(() => {
      if (cancelled) return;
      setStatus("success");
      setPendingGenerationCount(0);
      pushToast("success", "未完成的生图任务已恢复。");
    });

    return () => {
      cancelled = true;
    };
    // Pending jobs are intentionally restored once from the latest refs and persisted config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, isLocalHistoryReady]);

  function pushToast(type: ToastMessage["type"], message: string) {
    const toast = { id: makeId("toast"), type, message };
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 4200);
  }

  async function refreshHistoryStats() {
    try {
      setLocalHistoryStats(await getLocalGalleryStats());
    } catch {
      setLocalHistoryStats(null);
    }
  }

  async function persistGeneratedBatch(batch: GenerationBatch) {
    try {
      await saveLocalGenerationBatch(batch);
      await requestPersistentLocalStorage();
      await refreshHistoryStats();
    } catch (error) {
      const message = error instanceof DOMException && error.name === "QuotaExceededError"
        ? "浏览器本地空间不足，这张图片未能自动保存。请导出并清理部分历史作品。"
        : error instanceof Error ? error.message : "图片已生成，但本地保存失败。";
      pushToast("error", message);
    }
  }

  async function saveGeneratedModel(sourceResult: GenerationResult, modelBlob: Blob, modelTaskId: string) {
    const currentBatches = generationBatchesRef.current;
    const sourceBatch = currentBatches.find((batch) =>
      batch.results.some((result) => result.id === sourceResult.id)
    );
    const modelNumber = currentBatches.reduce(
      (sum, batch) => sum + batch.results.filter((result) => result.assetType === "model3d").length,
      0
    ) + 1;
    const modelBatch: GenerationBatch = {
      id: makeId("model3d-batch"),
      metadata: sourceBatch?.metadata,
      results: [{
        id: makeId("model3d"),
        assetType: "model3d",
        title: `3D Model ${String(modelNumber).padStart(2, "0")}`,
        prompt: `由 ${sourceResult.title || "当前方案"} 生成的无贴图3D模型`,
        imageBase64: sourceResult.imageBase64,
        modelBlob,
        modelTaskId
      }]
    };
    const nextBatches = [...currentBatches, modelBatch];
    generationBatchesRef.current = nextBatches;
    setGenerationBatches(nextBatches);
    setActiveGenerationBatchId(modelBatch.id);
    await persistGeneratedBatch(modelBatch);
    pushToast("success", "3D模型已生成并保存到画廊。");
  }

  async function upscaleImage(result: GenerationResult) {
    if (!result.imageBase64) return pushToast("error", "当前图片无法进行高清放大。");
    setStatus("generating");
    setPendingGenerationCount(1);
    setActiveGenerationBatchId(makeId("upscale-pending"));
    try {
      const sourceSize = await getDataUrlImageSize(result.imageBase64);
      const targetWidth = sourceSize.width * 2;
      const targetHeight = sourceSize.height * 2;
      if (targetWidth * targetHeight > 34_000_000) {
        throw new Error("当前图片已经很大，放大 2 倍会超过 SeedVR2-7B 的 3400 万像素上限。");
      }

      pushToast("info", "正在提交 SeedVR2-7B 高清放大任务…");
      const createResponse = await fetch("/api/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: result.imageBase64,
          size: `${targetWidth}x${targetHeight}`
        })
      });
      const createPayload = await readApiResponse<{ taskId?: string; error?: string }>(createResponse);
      if (!createResponse.ok || !createPayload.taskId) {
        throw new Error(createPayload.error || "高清放大服务没有返回任务编号。");
      }

      let upscaledImage = "";
      for (let attempt = 0; attempt < 300; attempt += 1) {
        await waitForImageJobPoll(attempt === 0 ? 1800 : Math.min(5000, 2200 + attempt * 120));
        const statusResponse = await fetch(
          `/api/upscale/status?taskId=${encodeURIComponent(createPayload.taskId)}`,
          { cache: "no-store" }
        );
        const statusPayload = await readApiResponse<{
          status?: string;
          imageBase64?: string;
          error?: string;
        }>(statusResponse);
        if (statusPayload.status === "done" && statusPayload.imageBase64) {
          upscaledImage = statusPayload.imageBase64;
          break;
        }
        if (!statusResponse.ok && statusResponse.status !== 202) {
          throw new Error(statusPayload.error || "高清放大任务失败。");
        }
      }
      if (!upscaledImage) throw new Error("高清放大等待超时，请稍后重试。");

      const currentBatches = generationBatchesRef.current;
      const sourceBatch = currentBatches.find((batch) =>
        batch.results.some((item) => item.id === result.id)
      );
      const hdNumber = currentBatches.reduce(
        (sum, batch) => sum + batch.results.filter((item) => batch.metadata?.generationType === "upscale" && item.imageBase64).length,
        0
      ) + 1;
      const upscaleBatch: GenerationBatch = {
        id: makeId("upscale-batch"),
        metadata: {
          productName: sourceBatch?.metadata?.productName,
          description: `由 ${result.title || "当前图片"} 使用 SeedVR2-7B 放大至 ${targetWidth}×${targetHeight}`,
          innovationLevel: 0,
          generationType: "upscale",
          productImage: { name: `${result.title || "source"}.png`, dataUrl: result.imageBase64 }
        },
        results: [{
          id: makeId("upscale"),
          title: `HD ${String(hdNumber).padStart(2, "0")}`,
          prompt: `SeedVR2-7B 2× 高清放大 · ${targetWidth}×${targetHeight}`,
          imageBase64: upscaledImage
        }]
      };
      const nextBatches = [...currentBatches, upscaleBatch];
      generationBatchesRef.current = nextBatches;
      setGenerationBatches(nextBatches);
      setActiveGenerationBatchId(upscaleBatch.id);
      setPendingGenerationCount(0);
      setStatus("success");
      await persistGeneratedBatch(upscaleBatch);
      pushToast("success", `高清放大完成，已保存为 ${targetWidth}×${targetHeight} 新图片。`);
    } catch (error) {
      setPendingGenerationCount(0);
      setStatus("error");
      pushToast("error", error instanceof Error ? error.message : "高清放大失败，请稍后重试。");
    }
  }

  async function pollImageJob(
    jobId: string,
    config: {
      imageApiKey: string;
      imageApiBaseUrl: string;
    }
  ) {
    let consecutiveQueryFailures = 0;

    while (true) {
      try {
        const response = await fetch("/api/generate/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageApiKey: config.imageApiKey,
            imageApiBaseUrl: config.imageApiBaseUrl,
            jobId
          })
        });
        const data = await readApiResponse<{
          status?: "pending" | "running" | "done" | "failed";
          imageBase64?: string;
          error?: string;
        }>(response);

        if (data.status === "done" && data.imageBase64) return data.imageBase64;
        if (data.status === "failed" || response.status === 422) {
          throw new TerminalImageJobError(data.error || "图片生成任务失败。");
        }
        if (!response.ok && response.status !== 202) {
          throw new Error(data.error || `任务查询失败（${response.status}）。`);
        }
        consecutiveQueryFailures = 0;
        await waitForImageJobPoll(2000);
      } catch (error) {
        if (error instanceof TerminalImageJobError) throw error;
        consecutiveQueryFailures += 1;
        if (consecutiveQueryFailures >= 6) {
          throw new Error(
            `暂时无法查询生图任务，任务编号 ${jobId} 已保留。刷新页面后会继续恢复。`
          );
        }
        await waitForImageJobPoll(Math.min(6000, 1000 * consecutiveQueryFailures));
      }
    }
  }

  async function upsertRecoveredJobResult(job: PendingImageJob, result: GenerationResult) {
    let updatedBatch: GenerationBatch | undefined;
    const currentBatches = generationBatchesRef.current;
    const hasBatch = currentBatches.some((batch) => batch.id === job.batchId);
    const nextBatches = hasBatch
      ? currentBatches.map((batch) => {
          if (batch.id !== job.batchId) return batch;
          const existingIndex = batch.results.findIndex((item) => item.id === result.id);
          const results = existingIndex >= 0
            ? batch.results.map((item, index) => index === existingIndex ? result : item)
            : [...batch.results, result];
          updatedBatch = { ...batch, results: sortGenerationResults(results) };
          return updatedBatch;
        })
      : [
          ...currentBatches,
          (updatedBatch = {
            id: job.batchId,
            results: [result],
            metadata: {
              description: job.prompt,
              innovationLevel: 50,
              generationType: "design"
            }
          })
        ];

    generationBatchesRef.current = nextBatches;
    setGenerationBatches(nextBatches);
    if (updatedBatch) {
      await saveLocalGenerationBatch(updatedBatch);
      await refreshHistoryStats();
    }
  }

  async function exportLocalProject() {
    if (!generationBatchesRef.current.length) return pushToast("info", "当前没有可导出的本地作品。");
    try {
      await exportPerdesignProject(generationBatchesRef.current);
      pushToast("success", "项目备份已开始下载。");
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "项目导出失败。");
    }
  }

  async function importLocalProject(file: File) {
    try {
      const importedBatches = await importPerdesignProject(file);
      const current = generationBatchesRef.current;
      let sequence = current.reduce((sum, batch) => sum + batch.results.length, 0);
      const normalizedImports = importedBatches.map((batch) => ({
        id: makeId(`imported-${batch.id || "batch"}`),
        metadata: batch.metadata,
        results: batch.results.map((result) => {
          sequence += 1;
          return {
            ...result,
            id: makeId(`imported-${result.id || "result"}`),
            title: result.assetType === "model3d"
              ? `3D Model ${String(sequence).padStart(2, "0")}`
              : `Concept ${String(sequence).padStart(2, "0")}`
          };
        })
      }));
      const nextBatches = [...current, ...normalizedImports];
      generationBatchesRef.current = nextBatches;
      setGenerationBatches(nextBatches);
      setActiveGenerationBatchId(normalizedImports.at(-1)?.id || current.at(-1)?.id || null);
      await replaceLocalGenerationBatches(nextBatches);
      await requestPersistentLocalStorage();
      await refreshHistoryStats();
      pushToast("success", `已导入 ${normalizedImports.reduce((sum, batch) => sum + batch.results.filter((result) => result.imageBase64).length, 0)} 张图片。`);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "项目导入失败。");
    }
  }

  async function clearLocalHistory() {
    if (!generationBatchesRef.current.length) return;
    if (!window.confirm("确定清空当前设备上的全部历史作品吗？建议先导出项目备份。")) return;
    try {
      await clearLocalGenerationBatches();
      generationBatchesRef.current = [];
      setGenerationBatches([]);
      setActiveGenerationBatchId(null);
      await refreshHistoryStats();
      pushToast("success", "本地历史作品已清空。");
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "本地历史清空失败。");
    }
  }

  async function deleteGalleryResult(resultId: string) {
    const currentBatches = generationBatchesRef.current;
    const targetBatch = currentBatches.find((batch) =>
      batch.results.some((result) => result.id === resultId)
    );
    if (!targetBatch) return false;

    const targetResult = targetBatch.results.find((result) => result.id === resultId);
    const label = targetResult?.error ? "这个失败记录" : "这个画廊项目";
    if (!window.confirm(`确定删除${label}吗？删除后无法恢复。`)) return false;

    try {
      const remainingResults = targetBatch.results.filter((result) => result.id !== resultId);
      const nextBatches = remainingResults.length
        ? currentBatches.map((batch) =>
            batch.id === targetBatch.id ? { ...batch, results: remainingResults } : batch
          )
        : currentBatches.filter((batch) => batch.id !== targetBatch.id);

      generationBatchesRef.current = nextBatches;
      setGenerationBatches(nextBatches);
      if (activeGenerationBatchId === targetBatch.id && !remainingResults.length) {
        setActiveGenerationBatchId(nextBatches.at(-1)?.id || null);
      }

      if (remainingResults.length) {
        await saveLocalGenerationBatch({ ...targetBatch, results: remainingResults });
      } else {
        await deleteLocalGenerationBatch(targetBatch.id);
      }

      const pendingJobId = resultId.startsWith("async-job-")
        ? resultId.slice("async-job-".length)
        : "";
      if (pendingJobId) removePendingImageJob(pendingJobId);
      await refreshHistoryStats();
      pushToast("success", "已从画廊删除。");
      return true;
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "删除失败，请稍后重试。");
      return false;
    }
  }

  function changeSection(section: WorkspaceSection) {
    setMobileDesignSettingsOpen(false);
    setActiveSection(section);
  }

  function getResolvedConfig(forceAuthorized = false) {
    const unlocked = forceAuthorized || isAuthorized;
    return {
      chatApiBaseUrl: unlocked ? DEFAULT_CHAT_API_BASE_URL : chatApiBaseUrl.trim(),
      chatApiKey: unlocked ? PRESET_CHAT_API_KEY : chatApiKey.trim(),
      imageApiBaseUrl: unlocked ? DEFAULT_IMAGE_API_BASE_URL : imageApiBaseUrl.trim(),
      imageApiKey: unlocked ? PRESET_IMAGE_API_KEY : imageApiKey.trim(),
      unlocked
    };
  }

  function openAuthModal(action: PendingAuthAction = null) {
    setPendingAuthAction(action);
    setAuthModalValue(authDraft || authCode);
    setIsAuthModalOpen(true);
  }

  function ensureAuthorized(action: PendingAuthAction = null) {
    if (isAuthorized) return true;
    openAuthModal(action);
    return false;
  }

  function runPendingAction(action: PendingAuthAction, forceAuthorized = false) {
    if (!action) return;
    switch (action.type) {
      case "generate":
        void generateCore(forceAuthorized);
        break;
      case "research":
        void sendResearchMessageCore(forceAuthorized);
        break;
      case "multi-view":
        void generateMultiViewCore(action.result, forceAuthorized);
        break;
      case "scene":
        void generateSceneCore(action.result, forceAuthorized);
        break;
      case "ecommerce-poster":
        void generateEcommercePosterCore(action.result, action.productName, action.instruction, forceAuthorized);
        break;
      case "divergence":
        void generateDivergenceCore(action.result, action.productName, action.request, forceAuthorized);
        break;
      case "image-prompt":
        void generateFromImagePromptCore(action.result, action.instruction, action.referenceImages, forceAuthorized);
        break;
      case "video":
        void generateVideoCore(action.result, action.request, forceAuthorized);
        break;
      case "local-edit":
        void generateLocalEditCore(action.result, action.maskImageBase64, action.instruction, action.guideImageBase64, forceAuthorized);
        break;
      case "custom-generate":
        void generateCustomCanvasCore(action.request, forceAuthorized);
        break;
      default:
        break;
    }
  }

  function completeAuthorization(rawValue: string, shouldRunPendingAction = false) {
    const normalized = normalizeAuthCode(rawValue);
    if (normalized !== AUTH_CODE) {
      pushToast("error", "认证码不正确，请重新输入。");
      return false;
    }

    setAuthCode(AUTH_CODE);
    setAuthDraft(AUTH_CODE);
    setAuthModalValue(AUTH_CODE);
    setImageApiBaseUrl(DEFAULT_IMAGE_API_BASE_URL);
    setChatApiBaseUrl(DEFAULT_CHAT_API_BASE_URL);
    setImageApiKey(PRESET_IMAGE_API_KEY);
    setChatApiKey(PRESET_CHAT_API_KEY);
    pushToast("success", "认证通过，平台功能已解锁。");

    const nextAction = pendingAuthAction;
    setPendingAuthAction(null);
    setIsAuthModalOpen(false);
    if (shouldRunPendingAction && nextAction) {
      window.setTimeout(() => runPendingAction(nextAction, true), 0);
    }
    return true;
  }

  function saveAuthConfig() {
    const nextValue = authDraft.trim();
    const normalized = normalizeAuthCode(nextValue);

    setAuthCode(nextValue);
    setPendingAuthAction(null);

    if (normalized !== AUTH_CODE) {
      setImageApiKey("");
      setChatApiKey("");
      pushToast("error", "认证码不正确，当前已切换为未认证状态。");
      return;
    }

    completeAuthorization(nextValue, false);
  }

  function submitAuthModal() {
    completeAuthorization(authModalValue, true);
  }

  async function optimizePrompt() {
    const { chatApiKey: resolvedChatApiKey, chatApiBaseUrl: resolvedChatApiBaseUrl, unlocked } = getResolvedConfig();
    if (!unlocked) return openAuthModal();
    if (!resolvedChatApiKey || !resolvedChatApiBaseUrl) return pushToast("error", "当前认证信息不可用，请重新输入认证码。");
    if (!productName.trim() && !requirement.trim() && !uploadedImage && !referenceImages.length) {
      return pushToast("error", "请填写文字描述，或上传可用于撰写提示词的图片。");
    }

    setStatus("optimizing");
    try {
      const [subjectImageForOptimization, referenceImagesForOptimization] = await Promise.all([
        uploadedImage ? prepareImageForVision(uploadedImage.dataUrl, 1600, 0.82) : Promise.resolve(undefined),
        Promise.all(referenceImages.map((image) => prepareImageForVision(image.dataUrl, 1600, 0.82)))
      ]);
      const response = await fetch("/api/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: resolvedChatApiKey,
          baseUrl: resolvedChatApiBaseUrl,
          model: BRAIN_MODEL,
          productName: productName.trim(),
          userPrompt: requirement,
          productImageBase64: productInputMode === "product" ? subjectImageForOptimization : undefined,
          sketchImageBase64: productInputMode === "sketch" ? subjectImageForOptimization : undefined,
          referenceImageBase64s: referenceImagesForOptimization,
          innovationLevel
        })
      });
      const data = await readApiResponse<{ optimizedPrompt?: string; error?: string }>(response);
      if (!response.ok || !data.optimizedPrompt) throw new Error(data.error || "提示词优化失败。");
      setPromptBeforeOptimization(requirement);
      setRequirement(data.optimizedPrompt);
      setStatus("idle");
      pushToast("success", "提示词已撰写并回填。");
    } catch (error) {
      setStatus("error");
      pushToast("error", error instanceof Error ? error.message : "提示词优化失败。");
    }
  }

  async function optimizeCustomCanvasPrompt(request: CustomCanvasGenerationRequest) {
    const { chatApiKey: resolvedChatApiKey, chatApiBaseUrl: resolvedChatApiBaseUrl, unlocked } = getResolvedConfig();
    if (!unlocked) {
      openAuthModal();
      throw new Error("请先完成认证，再使用 AI 撰写提示词。");
    }
    if (!resolvedChatApiKey || !resolvedChatApiBaseUrl) {
      throw new Error("当前认证信息不可用，请重新输入认证码。");
    }

    const [productImageForOptimization, referenceImageForOptimization] = await Promise.all([
      prepareImageForVision(request.sourceImage.dataUrl, 1600, 0.82),
      request.referenceImage
        ? prepareImageForVision(request.referenceImage.dataUrl, 1600, 0.82)
        : Promise.resolve(undefined)
    ]);
    const response = await fetch("/api/optimize-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: resolvedChatApiKey,
        baseUrl: resolvedChatApiBaseUrl,
        model: BRAIN_MODEL,
        productName: request.productName,
        userPrompt: request.requirement,
        productImageBase64: productImageForOptimization,
        referenceImageBase64: referenceImageForOptimization,
        innovationLevel: request.innovationLevel
      })
    });
    const data = await readApiResponse<{ optimizedPrompt?: string; error?: string }>(response);
    if (!response.ok || !data.optimizedPrompt) {
      throw new Error(data.error || "提示词撰写失败，请稍后重试。");
    }
    return data.optimizedPrompt;
  }

  function restorePromptBeforeOptimization() {
    if (promptBeforeOptimization === null) return;
    setRequirement(promptBeforeOptimization);
    setPromptBeforeOptimization(null);
    pushToast("info", "已恢复优化前的文字内容。");
  }

  async function generate() {
    if (!ensureAuthorized({ type: "generate" })) return;
    await generateCore();
  }

  async function generateCore(forceAuthorized = false) {
    if (!isLocalHistoryReady) return pushToast("info", "正在恢复本地作品，请稍候再生成。");
    const { imageApiKey: resolvedImageApiKey, imageApiBaseUrl: resolvedImageApiBaseUrl, unlocked } = getResolvedConfig(forceAuthorized);
    if (!unlocked) return;
    if (!resolvedImageApiKey || !resolvedImageApiBaseUrl) return pushToast("error", "当前认证信息不可用，请重新输入认证码。");
    if (!productName.trim() && !requirement.trim() && !uploadedImage && !referenceImages.length) {
      return pushToast("error", "请填写文字描述，或上传可用于生成的图片。");
    }

    await runGeneration({
      productName: productName.trim(),
      sketchImage: productInputMode === "sketch" && uploadedImage ? { name: uploadedImage.name, dataUrl: uploadedImage.dataUrl } : undefined,
      productImage: productInputMode === "product" && uploadedImage ? { name: uploadedImage.name, dataUrl: uploadedImage.dataUrl } : undefined,
      referenceImages: referenceImages.map((image) => ({ name: image.name, dataUrl: image.dataUrl })),
      innovationLevel,
      requirement,
      count
    }, forceAuthorized);
  }

  function generateCustomCanvas(request: CustomCanvasGenerationRequest) {
    if (!ensureAuthorized({ type: "custom-generate", request })) return false;
    void generateCustomCanvasCore(request);
    return true;
  }

  async function generateCustomCanvasCore(request: CustomCanvasGenerationRequest, forceAuthorized = false) {
    if (!isLocalHistoryReady) {
      pushToast("info", "正在恢复本地作品，请稍候再生成。");
      return;
    }
    const { imageApiKey: resolvedImageApiKey, imageApiBaseUrl: resolvedImageApiBaseUrl, unlocked } = getResolvedConfig(forceAuthorized);
    if (!unlocked) return;
    if (!resolvedImageApiKey || !resolvedImageApiBaseUrl) {
      pushToast("error", "当前认证信息不可用，请重新输入认证码。");
      return;
    }
    if (!request.sourceImage.dataUrl) {
      pushToast("error", "请先上传需要编辑的图片。");
      return;
    }

    await runGeneration({
      productName: request.productName.trim(),
      productImage: { name: request.sourceImage.name, dataUrl: request.sourceImage.dataUrl },
      referenceImage: request.referenceImage
        ? { name: request.referenceImage.name, dataUrl: request.referenceImage.dataUrl }
        : undefined,
      innovationLevel: request.innovationLevel,
      requirement: request.requirement,
      count: request.count,
      sizeOverride: request.size
    }, forceAuthorized);
  }

  async function runGeneration(params: {
    productName?: string;
    sketchImage?: GenerationSourceImage;
    productImage?: GenerationSourceImage;
    referenceImage?: GenerationSourceImage;
    referenceImages?: GenerationSourceImage[];
    innovationLevel: number;
    requirement: string;
    count: number;
    generationType?: GenerationType;
    divergenceStyles?: string[];
    metadataDescription?: string;
    sizeOverride?: string;
    maskImageBase64?: string;
    localEditGuideImageBase64?: string;
    useExactPrompt?: boolean;
  }, forceAuthorized = false) {
    const config = getResolvedConfig(forceAuthorized);
    const referenceImageCount = (params.referenceImage ? 1 : 0) + (params.referenceImages?.length || 0);
    const requestImageCount =
      (params.sketchImage ? 1 : 0) +
      (params.productImage ? 1 : 0) +
      referenceImageCount;
    const maximumImageDataUrlLength = requestImageCount >= 4
      ? 600_000
      : requestImageCount >= 2
        ? 750_000
        : 1_000_000;
    const preserveLocalEditPixels = Boolean(params.maskImageBase64);

    let preparedSketchImageBase64 = params.sketchImage?.dataUrl;
    let preparedProductImageBase64 = params.productImage?.dataUrl;
    let preparedReferenceImageBase64 = params.referenceImage?.dataUrl;
    let preparedReferenceImageBase64s = params.referenceImages?.map((image) => image.dataUrl);

    try {
      [
        preparedSketchImageBase64,
        preparedProductImageBase64,
        preparedReferenceImageBase64,
        preparedReferenceImageBase64s
      ] = await Promise.all([
        params.sketchImage
          ? prepareImageForVision(params.sketchImage.dataUrl, 1800, 0.84, maximumImageDataUrlLength)
          : Promise.resolve(undefined),
        params.productImage && !preserveLocalEditPixels
          ? prepareImageForVision(params.productImage.dataUrl, 1800, 0.84, maximumImageDataUrlLength)
          : Promise.resolve(params.productImage?.dataUrl),
        params.referenceImage
          ? prepareImageForVision(params.referenceImage.dataUrl, 1800, 0.84, maximumImageDataUrlLength)
          : Promise.resolve(undefined),
        params.referenceImages
          ? Promise.all(params.referenceImages.map((image) =>
              prepareImageForVision(image.dataUrl, 1800, 0.84, maximumImageDataUrlLength)
            ))
          : Promise.resolve(undefined)
      ]);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "图片处理失败，请更换图片后重试。");
      return;
    }

    const batchId = makeId("generation-batch");
    const existingBatches = generationBatchesRef.current;
    const existingResultCount = existingBatches.reduce((sum, batch) => sum + batch.results.length, 0);
    const progressiveBatch: GenerationBatch = {
      id: batchId,
      results: [],
      metadata: {
        productName: params.productName,
        description: params.metadataDescription ?? params.requirement,
        innovationLevel: params.innovationLevel,
        generationType: params.generationType || "design",
        divergenceStyles: params.divergenceStyles,
        sketchImage: params.sketchImage,
        productImage: params.productImage,
        referenceImage: params.referenceImage,
        referenceImages: params.referenceImages
      }
    };
    const batchesWithProgressiveBatch = [...existingBatches, progressiveBatch];
    generationBatchesRef.current = batchesWithProgressiveBatch;
    setGenerationBatches(batchesWithProgressiveBatch);
    setActiveGenerationBatchId(batchId);
    setPendingGenerationCount(params.count);
    setStatus("generating");
    await persistGeneratedBatch(progressiveBatch);

    let nextRequestIndex = 0;
    let completedCount = 0;
    let failedCount = 0;

    async function requestSingleResult(requestIndex: number): Promise<GenerationResult> {
      let submittedJobId = "";
      const sequence = existingResultCount + requestIndex + 1;
      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageApiKey: config.imageApiKey,
            imageApiBaseUrl: config.imageApiBaseUrl,
            chatApiKey: config.chatApiKey,
            chatApiBaseUrl: config.chatApiBaseUrl,
            brainModel: BRAIN_MODEL,
            imageModel,
            productName: params.productName,
            sketchImageBase64: preparedSketchImageBase64,
            imageBase64: preparedProductImageBase64,
            maskImageBase64: params.maskImageBase64,
            localEditGuideImageBase64: params.localEditGuideImageBase64,
            referenceImageBase64: preparedReferenceImageBase64,
            referenceImageBase64s: preparedReferenceImageBase64s,
            innovationLevel: params.innovationLevel,
            requirement: params.requirement,
            useExactPrompt: params.useExactPrompt,
            count: 1,
            size: params.sizeOverride || size,
            quality
          })
        });

        const data = await readApiResponse<{
          jobId?: string;
          status?: string;
          prompt?: string;
          error?: string;
        }>(response);
        if (!response.ok || !data.jobId) {
          throw new Error(data.error || "未能创建生图任务，请稍后重试。");
        }

        submittedJobId = data.jobId;
        const prompt = data.prompt?.trim() || params.requirement;
        addPendingImageJob({
          jobId: submittedJobId,
          batchId,
          prompt,
          sequence,
          createdAt: Date.now()
        });
        const imageBase64 = await pollImageJob(submittedJobId, config);
        removePendingImageJob(submittedJobId);
        return {
          id: `async-job-${submittedJobId}`,
          title: "",
          prompt,
          imageBase64
        };
      } catch (error) {
        if (submittedJobId && error instanceof TerminalImageJobError) {
          removePendingImageJob(submittedJobId);
        }
        return {
          id: submittedJobId ? `async-job-${submittedJobId}` : makeId(`failed-concept-${requestIndex}`),
          title: "",
          prompt: params.requirement,
          error: error instanceof Error ? error.message : "生成失败，请检查配置后重试。"
        };
      }
    }

    function appendCompletedResult(result: GenerationResult, sequence: number) {
      completedCount += 1;
      if (result.error) failedCount += 1;
      const numberedResult = {
        ...result,
        title: `Concept ${String(sequence).padStart(2, "0")}`,
        prompt: result.prompt?.trim() || params.requirement
      };
      let updatedBatch: GenerationBatch | undefined;
      const nextBatches = generationBatchesRef.current.map((batch) => {
        if (batch.id !== batchId) return batch;
        const existingIndex = batch.results.findIndex((item) => item.id === numberedResult.id);
        const results = existingIndex >= 0
          ? batch.results.map((item, index) => index === existingIndex ? numberedResult : item)
          : [...batch.results, numberedResult];
        updatedBatch = { ...batch, results: sortGenerationResults(results) };
        return updatedBatch;
      });
      generationBatchesRef.current = nextBatches;
      setGenerationBatches(nextBatches);
      setPendingGenerationCount((current) => Math.max(0, current - 1));
      if (updatedBatch) void persistGeneratedBatch(updatedBatch);
    }

    async function generationWorker() {
      while (true) {
        const requestIndex = nextRequestIndex;
        nextRequestIndex += 1;
        if (requestIndex >= params.count) return;
        appendCompletedResult(
          await requestSingleResult(requestIndex),
          existingResultCount + requestIndex + 1
        );
      }
    }

    try {
      const workerCount = Math.min(MAX_IMAGE_GENERATION_CONCURRENCY, params.count);
      await Promise.all(Array.from({ length: workerCount }, () => generationWorker()));
      const completedBatch = generationBatchesRef.current.find((batch) => batch.id === batchId);
      if (completedBatch) void persistGeneratedBatch(completedBatch);
      setPendingGenerationCount(0);
      setStatus("success");
      pushToast(failedCount ? "info" : "success", failedCount ? `已完成，${failedCount} 个方案生成失败。` : "全部方案生成完成。");
    } catch (error) {
      setPendingGenerationCount(0);
      setStatus("error");
      setActiveGenerationBatchId(null);
      pushToast("error", error instanceof Error ? error.message : "生成失败，请检查配置后重试。");
    }
  }

  async function generateMultiView(result: GenerationResult) {
    if (!ensureAuthorized({ type: "multi-view", result })) return;
    await generateMultiViewCore(result);
  }

  async function generateMultiViewCore(result: GenerationResult, forceAuthorized = false) {
    const { imageApiKey: resolvedImageApiKey, imageApiBaseUrl: resolvedImageApiBaseUrl, unlocked } = getResolvedConfig(forceAuthorized);
    if (!unlocked) return;
    if (!resolvedImageApiKey || !resolvedImageApiBaseUrl) return pushToast("error", "当前认证信息不可用，请重新输入认证码。");
    if (!result.imageBase64) return pushToast("error", "当前图片不可用于多视图生成。");

    await runGeneration({
      productImage: { name: `${result.title}.png`, dataUrl: result.imageBase64 },
      referenceImage: undefined,
      innovationLevel: 0,
      requirement:
        "生成这个产品的多视角图片，画面最右侧是产品的斜侧透视图，左侧包含产品正视图、左视图、后视图、顶视图。",
      count: 1,
      generationType: "multi-view",
      sizeOverride: "1536x1024"
    }, forceAuthorized);
  }

  async function generateScene(result: GenerationResult) {
    if (!ensureAuthorized({ type: "scene", result })) return;
    await generateSceneCore(result);
  }

  async function generateSceneCore(result: GenerationResult, forceAuthorized = false) {
    const { imageApiKey: resolvedImageApiKey, imageApiBaseUrl: resolvedImageApiBaseUrl, unlocked } = getResolvedConfig(forceAuthorized);
    if (!unlocked) return;
    if (!resolvedImageApiKey || !resolvedImageApiBaseUrl) return pushToast("error", "当前认证信息不可用，请重新输入认证码。");
    if (!result.imageBase64) return pushToast("error", "当前图片不可用于场景图生成。");

    await runGeneration({
      productImage: { name: `${result.title}.png`, dataUrl: result.imageBase64 },
      referenceImage: undefined,
      innovationLevel: 0,
      requirement: SCENE_GENERATION_PROMPT,
      count: 1,
      generationType: "scene"
    }, forceAuthorized);
  }

  async function generateEcommercePoster(
    result: GenerationResult,
    sourceProductName?: string,
    instruction?: string
  ) {
    const normalizedInstruction = instruction?.trim();
    if (!ensureAuthorized({
      type: "ecommerce-poster",
      result,
      productName: sourceProductName,
      instruction: normalizedInstruction
    })) return;
    await generateEcommercePosterCore(result, sourceProductName, normalizedInstruction);
  }

  async function generateEcommercePosterCore(
    result: GenerationResult,
    sourceProductName?: string,
    instruction?: string,
    forceAuthorized = false
  ) {
    const { imageApiKey: resolvedImageApiKey, imageApiBaseUrl: resolvedImageApiBaseUrl, unlocked } =
      getResolvedConfig(forceAuthorized);
    if (!unlocked) return;
    if (!resolvedImageApiKey || !resolvedImageApiBaseUrl) {
      return pushToast("error", "当前认证信息不可用，请重新输入认证码。");
    }
    if (!result.imageBase64) return pushToast("error", "当前图片不可用于电商海报生成。");

    const resolvedProductName = sourceProductName?.trim() || productName.trim();
    const pngSourceImage = await convertImageDataUrlToPng(result.imageBase64);
    const ecommercePrompt = buildEcommercePosterPrompt({
      productName: resolvedProductName,
      userInstruction: instruction
    });

    await runGeneration({
      productName: resolvedProductName,
      productImage: { name: `${result.title}.png`, dataUrl: pngSourceImage },
      innovationLevel: 0,
      requirement: ecommercePrompt,
      count: 1,
      generationType: "ecommerce-poster",
      metadataDescription: instruction?.trim() || "电商详情长图",
      sizeOverride: "1440x2560",
      useExactPrompt: true
    }, forceAuthorized);
  }

  async function generateDivergence(
    result: GenerationResult,
    sourceProductName: string | undefined,
    request: CreativeDivergenceRequest
  ) {
    const mode = request.mode || "directed";
    const selectedStyleCount = new Set(request.styleIds || []).size;
    if (mode === "directed" && selectedStyleCount > 4) {
      return pushToast("error", "最多选择 4 种创意风格。");
    }
    if (mode === "directed" && Boolean(selectedStyleCount) === Boolean(request.referenceImage)) {
      return pushToast("error", "请选择 1 至 4 种创意风格，或上传一张风格参考图。");
    }
    if (!ensureAuthorized({ type: "divergence", result, productName: sourceProductName, request })) return;
    await generateDivergenceCore(result, sourceProductName, request);
  }

  async function generateDivergenceCore(
    result: GenerationResult,
    sourceProductName?: string,
    request: CreativeDivergenceRequest = {},
    forceAuthorized = false
  ) {
    const {
      imageApiKey: resolvedImageApiKey,
      imageApiBaseUrl: resolvedImageApiBaseUrl,
      chatApiKey: resolvedChatApiKey,
      chatApiBaseUrl: resolvedChatApiBaseUrl,
      unlocked
    } = getResolvedConfig(forceAuthorized);
    if (!unlocked) return;
    if (!resolvedImageApiKey || !resolvedImageApiBaseUrl) {
      return pushToast("error", "当前认证信息不可用，请重新输入认证码。");
    }
    if (!result.imageBase64) return pushToast("error", "当前图片不可用于创意发散。");

    const resolvedProductName = sourceProductName?.trim() || productName.trim();
    let exactPrompt: string;
    let divergenceStyles: string[];
    try {
      if ((request.mode || "directed") === "free") {
        if (!resolvedChatApiKey || !resolvedChatApiBaseUrl) {
          throw new Error("自由探索需要可用的对话模型配置。");
        }
        setPendingGenerationCount(1);
        setStatus("generating");
        const sourceImageBase64 = await prepareImageForVision(result.imageBase64, 1600, 0.84);
        const response = await fetch("/api/divergence-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: resolvedChatApiKey,
            baseUrl: resolvedChatApiBaseUrl,
            model: BRAIN_MODEL,
            productName: resolvedProductName,
            sourceImageBase64,
            explorationLevel: request.explorationLevel || "balanced",
            note: request.note?.trim() || "",
            originalDescription: (result.designDescription || result.prompt || "").slice(0, 4000)
          })
        });
        const data = await readApiResponse<{ prompt?: string; concepts?: string[]; error?: string }>(response);
        if (!response.ok || !data.prompt || data.concepts?.length !== 4) {
          throw new Error(data.error || "大脑模型没有返回完整的四条探索路线。");
        }
        exactPrompt = data.prompt;
        divergenceStyles = data.concepts;
      } else {
        const preparedDivergence = buildCreativeDivergencePrompt({
          productName: resolvedProductName,
          request
        });
        exactPrompt = preparedDivergence.prompt;
        divergenceStyles = preparedDivergence.quadrantStyleLabels;
      }
    } catch (error) {
      setStatus("error");
      return pushToast("error", error instanceof Error ? error.message : "创意发散参数无效。");
    }

    await runGeneration({
      productName: resolvedProductName,
      productImage: { name: `${result.title}.png`, dataUrl: result.imageBase64 },
      referenceImages: (request.mode || "directed") === "directed" && request.referenceImage
        ? [request.referenceImage]
        : undefined,
      innovationLevel: 100,
      requirement: exactPrompt,
      count: 1,
      generationType: "divergence",
      divergenceStyles,
      sizeOverride: "1536x1024",
      useExactPrompt: true
    }, forceAuthorized);
  }

  async function generateFromImagePrompt(
    result: GenerationResult,
    instruction: string,
    referenceImages?: GenerationSourceImage[]
  ) {
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) return pushToast("error", "请输入文字描述。");
    if (!ensureAuthorized({ type: "image-prompt", result, instruction: trimmedInstruction, referenceImages })) return;
    await generateFromImagePromptCore(result, trimmedInstruction, referenceImages);
  }

  async function generateFromImagePromptCore(
    result: GenerationResult,
    instruction: string,
    referenceImages?: GenerationSourceImage[],
    forceAuthorized = false
  ) {
    const { imageApiKey: resolvedImageApiKey, imageApiBaseUrl: resolvedImageApiBaseUrl, unlocked } =
      getResolvedConfig(forceAuthorized);
    if (!unlocked) return;
    if (!resolvedImageApiKey || !resolvedImageApiBaseUrl) {
      return pushToast("error", "当前认证信息不可用，请重新输入认证码。");
    }
    if (!result.imageBase64) return pushToast("error", "当前图片不可用于继续生成。");

    const pngSourceImage = await convertImageDataUrlToPng(result.imageBase64);
    const sourceSize = await getImageSizeOption(pngSourceImage, size);
    await runGeneration(
      {
        productImage: { name: `${result.title}.png`, dataUrl: pngSourceImage },
        referenceImages,
        innovationLevel: 50,
        requirement: instruction.trim(),
        count: 1,
        generationType: "image-prompt",
        metadataDescription: instruction.trim(),
        sizeOverride: sourceSize,
        useExactPrompt: true
      },
      forceAuthorized
    );
  }

  async function generateVideo(result: GenerationResult, request: VideoGenerationRequest) {
    if (!ensureAuthorized({ type: "video", result, request })) return;
    await generateVideoCore(result, request);
  }

  async function generateVideoCore(
    result: GenerationResult,
    request: VideoGenerationRequest,
    forceAuthorized = false
  ) {
    const { unlocked } = getResolvedConfig(forceAuthorized);
    if (!unlocked) return;
    if (!result.imageBase64) return pushToast("error", "当前图片不可用于视频生成。");

    const currentBatches = generationBatchesRef.current;
    const sourceBatch = currentBatches.find((batch) =>
      batch.results.some((item) => item.id === result.id)
    );
    const videoNumber = currentBatches.reduce(
      (sum, batch) => sum + batch.results.filter((item) => item.assetType === "video").length,
      0
    ) + 1;
    const videoResultId = makeId("video");
    const videoBatch: GenerationBatch = {
      id: makeId("video-batch"),
      metadata: {
        productName: sourceBatch?.metadata?.productName,
        description: request.prompt,
        innovationLevel: sourceBatch?.metadata?.innovationLevel || 0,
        generationType: "video",
        productImage: sourceBatch?.metadata?.productImage,
        referenceImage: sourceBatch?.metadata?.referenceImage,
        referenceImages: sourceBatch?.metadata?.referenceImages
      },
      results: [{
        id: videoResultId,
        assetType: "video",
        title: `Video ${String(videoNumber).padStart(2, "0")}`,
        prompt: request.prompt,
        imageBase64: result.imageBase64,
        videoStatus: "queued"
      }]
    };
    const nextBatches = [...currentBatches, videoBatch];
    generationBatchesRef.current = nextBatches;
    setGenerationBatches(nextBatches);
    setActiveGenerationBatchId(videoBatch.id);
    void persistGeneratedBatch(videoBatch);
    pushToast("info", "视频任务已创建，完成后会自动更新到画廊。");

    try {
      const preparedImage = await prepareImageForVision(result.imageBase64, 1600, 0.84);
      const createResponse = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: preparedImage,
          prompt: request.prompt,
          ratio: request.ratio,
          duration: request.duration,
          resolution: request.resolution
        })
      });
      const createPayload = await readApiResponse<{ taskId?: string; error?: string }>(createResponse);
      if (!createResponse.ok || !createPayload.taskId) {
        throw new Error(createPayload.error || "视频服务没有返回有效的任务编号。");
      }

      updateVideoGalleryResult(videoBatch.id, videoResultId, {
        videoTaskId: createPayload.taskId,
        videoStatus: "running"
      });

      for (let attempt = 0; attempt < 240; attempt += 1) {
        await waitForImageJobPoll(attempt === 0 ? 2500 : 5000);
        const statusResponse = await fetch(
          `/api/video/status?taskId=${encodeURIComponent(createPayload.taskId)}`,
          { cache: "no-store" }
        );
        const statusPayload = await readApiResponse<{
          status?: GenerationResult["videoStatus"];
          videoUrl?: string;
          error?: string;
        }>(statusResponse);
        if (!statusResponse.ok) {
          throw new Error(statusPayload.error || "视频任务查询失败。");
        }

        if (statusPayload.status === "succeeded" && statusPayload.videoUrl) {
          const completedBatch = updateVideoGalleryResult(videoBatch.id, videoResultId, {
            videoStatus: "succeeded",
            videoUrl: statusPayload.videoUrl,
            error: undefined
          });
          if (completedBatch) await persistGeneratedBatch(completedBatch);
          pushToast("success", "视频已生成并保存到画廊。");
          return;
        }

        if (statusPayload.status === "failed" || statusPayload.status === "cancelled") {
          throw new Error(statusPayload.error || "视频服务未能完成当前任务。");
        }

        updateVideoGalleryResult(videoBatch.id, videoResultId, {
          videoStatus: statusPayload.status || "running"
        });
      }

      throw new Error("视频生成等待超时，请稍后重新尝试。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "视频生成失败，请稍后重试。";
      const failedBatch = updateVideoGalleryResult(videoBatch.id, videoResultId, {
        videoStatus: "failed",
        error: message
      });
      if (failedBatch) await persistGeneratedBatch(failedBatch);
      pushToast("error", message);
    }
  }

  function updateVideoGalleryResult(
    batchId: string,
    resultId: string,
    patch: Partial<GenerationResult>
  ) {
    let updatedBatch: GenerationBatch | undefined;
    const nextBatches = generationBatchesRef.current.map((batch) => {
      if (batch.id !== batchId) return batch;
      updatedBatch = {
        ...batch,
        results: batch.results.map((item) => item.id === resultId ? { ...item, ...patch } : item)
      };
      return updatedBatch;
    });
    generationBatchesRef.current = nextBatches;
    setGenerationBatches(nextBatches);
    return updatedBatch;
  }

  async function generateLocalEdit(result: GenerationResult, maskImageBase64: string, instruction: string, guideImageBase64?: string) {
    if (!ensureAuthorized({ type: "local-edit", result, maskImageBase64, instruction, guideImageBase64 })) return;
    await generateLocalEditCore(result, maskImageBase64, instruction, guideImageBase64);
  }

  async function generateLocalEditCore(
    result: GenerationResult,
    maskImageBase64: string,
    instruction: string,
    guideImageBase64?: string,
    forceAuthorized = false
  ) {
    const { imageApiKey: resolvedImageApiKey, imageApiBaseUrl: resolvedImageApiBaseUrl, unlocked } = getResolvedConfig(forceAuthorized);
    if (!unlocked) return;
    if (!resolvedImageApiKey || !resolvedImageApiBaseUrl) return pushToast("error", "当前认证信息不可用，请重新输入认证码。");
    if (!result.imageBase64) return pushToast("error", "当前图片不可用于局部修改。");
    if (!maskImageBase64 || !instruction.trim()) return pushToast("error", "请先涂抹需要修改的区域，并输入修改要求。");

    const sourceSize = await getImageSizeOption(result.imageBase64, size);
    const preparedLocalEditImages = await prepareLocalEditImages(
      result.imageBase64,
      maskImageBase64,
      guideImageBase64
    );
    await runGeneration({
      productImage: { name: `${result.title}.jpg`, dataUrl: preparedLocalEditImages.sourceImageBase64 },
      maskImageBase64: preparedLocalEditImages.maskImageBase64,
      localEditGuideImageBase64: preparedLocalEditImages.guideImageBase64,
      referenceImage: undefined,
      innovationLevel: 70,
      requirement: instruction.trim(),
      count: 1,
      generationType: "local-edit",
      metadataDescription: instruction.trim(),
      sizeOverride: sourceSize
    }, forceAuthorized);
  }

  function generateDesignDescription(result: GenerationResult) {
    const existingTask = designDescriptionTasksRef.current.get(result.id);
    if (existingTask) return existingTask;
    if (!ensureAuthorized()) return Promise.reject(new Error("请先完成认证，再生成设计说明。"));

    const task = generateDesignDescriptionCore(result).finally(() => {
      if (designDescriptionTasksRef.current.get(result.id) !== task) return;
      designDescriptionTasksRef.current.delete(result.id);
      setDesignDescriptionLoadingIds((current) => current.filter((id) => id !== result.id));
    });
    designDescriptionTasksRef.current.set(result.id, task);
    setDesignDescriptionLoadingIds((current) => current.includes(result.id) ? current : [...current, result.id]);
    return task;
  }

  async function generateDesignDescriptionCore(result: GenerationResult) {
    const { chatApiKey: resolvedChatApiKey, chatApiBaseUrl: resolvedChatApiBaseUrl, unlocked } = getResolvedConfig();
    if (!unlocked || !resolvedChatApiKey || !resolvedChatApiBaseUrl) {
      throw new Error("当前认证信息不可用，请重新输入认证码。");
    }
    if (!result.imageBase64) throw new Error("当前图片无法用于生成设计说明。");

    try {
      const imageForAnalysis = await prepareImageForVision(result.imageBase64);
      const response = await fetch("/api/design-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: resolvedChatApiKey,
          baseUrl: resolvedChatApiBaseUrl,
          model: BRAIN_MODEL,
          imageBase64: imageForAnalysis
        })
      });
      const data = await readApiResponse<{ description?: string; error?: string }>(response);
      if (!response.ok || !data.description?.trim()) {
        throw new Error(data.error || "设计说明生成失败，请稍后重试。");
      }

      const description = data.description.trim();
      let updatedBatch: GenerationBatch | undefined;
      const nextBatches = generationBatchesRef.current.map((batch) => {
        if (!batch.results.some((item) => item.id === result.id)) return batch;
        updatedBatch = {
          ...batch,
          results: batch.results.map((item) =>
            item.id === result.id ? { ...item, designDescription: description } : item
          )
        };
        return updatedBatch;
      });
      generationBatchesRef.current = nextBatches;
      setGenerationBatches(nextBatches);
      if (updatedBatch) await persistGeneratedBatch(updatedBatch);
      pushToast("success", "设计说明已生成并保存。");
      return description;
    } catch (error) {
      const originalMessage = error instanceof Error ? error.message : "";
      const message = /failed to fetch|networkerror|load failed/i.test(originalMessage)
        ? "无法连接设计说明服务。若当前网址是 localhost，请重新启动本地服务；若是 Vercel 网址，请刷新页面后重试。"
        : originalMessage || "设计说明生成失败，请稍后重试。";
      pushToast("error", message);
      throw new Error(message);
    }
  }

  async function sendResearchMessage() {
    if (!ensureAuthorized({ type: "research" })) return;
    await sendResearchMessageCore();
  }

  async function sendResearchMessageCore(forceAuthorized = false) {
    const { chatApiKey: resolvedChatApiKey, chatApiBaseUrl: resolvedChatApiBaseUrl, unlocked } = getResolvedConfig(forceAuthorized);
    if (!unlocked) return;
    if (!researchInput.trim() && researchFiles.length === 0) {
      pushToast("error", "请先输入研究任务，或上传资料清单。");
      return;
    }
    if (!resolvedChatApiKey || !resolvedChatApiBaseUrl) {
      pushToast("error", "当前认证信息不可用，请重新输入认证码。");
      return;
    }

    const files = researchFiles.length ? [...researchFiles] : undefined;
    const userContent = researchInput.trim() || "请基于我上传的资料继续展开研究。";
    const requestedWebEvidence = /(?:链接|来源|出处|数据|资料|网页|网站|附图|图片|照片|案例图)/.test(userContent);
    const conversationImages = files?.filter((file) => file.dataUrl?.startsWith("data:image/")).map((file) => ({
      name: file.name,
      dataUrl: file.dataUrl!
    }));
    const documentContext = files
      ?.filter((file) => file.extractedText)
      .map((file) => `\n\n--- 上传文件：${file.name} ---\n${file.extractedText}`)
      .join("") || "";
    const nextConversation = [
      ...researchMessages
        .filter((message) => message.content.trim().length > 0)
        .map((message) => ({ role: message.role, content: message.content.trim() })),
      {
        role: "user" as const,
        content: `${userContent}${documentContext}`,
        images: conversationImages
      }
    ];
    const shouldGenerateResearchTitle = !researchMessages.some((message) => message.role === "user");
    const titleSessionId = activeResearchSessionId;

    setResearchMessages((current) => [...current, { id: makeId("research-user"), role: "user", content: userContent, files }]);
    setResearchInput("");
    setResearchFiles([]);
    setIsResearchResponding(true);

    if (shouldGenerateResearchTitle && titleSessionId) {
      void generateSemanticResearchTitle({
        sessionId: titleSessionId,
        content: userContent,
        apiKey: resolvedChatApiKey,
        baseUrl: resolvedChatApiBaseUrl
      });
    }

    try {
      const response = await fetch("/api/research-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: resolvedChatApiKey,
          baseUrl: resolvedChatApiBaseUrl,
          model: BRAIN_MODEL,
          conversation: nextConversation
        })
      });

      if (!response.ok || !response.body) {
        const data = await readApiResponse<{ error?: string }>(response);
        throw new Error(data.error || "策划研究回复失败。");
      }

      const assistantMessageId = makeId("research-assistant");
      let streamedContent = "";
      let streamError = "";
      setResearchMessages((current) => [
        ...current,
        { id: assistantMessageId, role: "assistant", content: "" }
      ]);

      await readNdjsonStream(response.body, (event) => {
        if (event.type === "delta" && event.content) {
          streamedContent += event.content;
          if (!requestedWebEvidence) {
            setResearchMessages((current) => current.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: streamedContent }
                : message
            ));
          }
        } else if (event.type === "done") {
          const sourceCount = event.sources?.filter((source) => typeof source !== "string").length || 0;
          const imageCount = event.images?.length || 0;
          setResearchMessages((current) => current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: reconcileResearchEvidenceClaims(streamedContent, sourceCount, imageCount, requestedWebEvidence),
                  sources: event.sources || [],
                  images: event.images || []
                }
              : message
          ));
          if (sourceCount || imageCount) {
            pushToast("success", `已附上 ${sourceCount} 个网络来源${imageCount ? `和 ${imageCount} 张相关图片` : ""}，位于本条回复下方。`);
          }
        } else if (event.type === "error") {
          streamError = event.error || "策划研究回复失败。";
        }
      });
      if (streamError) throw new Error(streamError);
      if (!streamedContent) throw new Error("策划研究接口没有返回有效内容。");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "策划研究回复失败。";
      pushToast("error", reason);
      setResearchMessages((current) => [
        ...current.filter((message) => message.content.trim().length > 0),
        {
          id: makeId("research-assistant"),
          role: "assistant",
          content: `这次没有拿到策划研究回复。原因：${reason}`
        }
      ]);
    } finally {
      setIsResearchResponding(false);
    }
  }

  async function generateSemanticResearchTitle({
    sessionId,
    content,
    apiKey,
    baseUrl
  }: {
    sessionId: string;
    content: string;
    apiKey: string;
    baseUrl: string;
  }) {
    try {
      const response = await fetch("/api/research-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, baseUrl, model: BRAIN_MODEL, content })
      });
      const data = await readApiResponse<{ title?: string; error?: string }>(response);
      if (!response.ok || !data.title) return;
      setResearchSessions((current) => {
        const next = current.map((session) =>
          session.id === sessionId && !session.customTitle
            ? { ...session, title: data.title!, customTitle: true, updatedAt: Date.now() }
            : session
        );
        const sorted = sortResearchSessionsByUpdatedAt(next);
        persistResearchSessions(sorted);
        return sorted;
      });
    } catch {
      // Keep the local fallback title when semantic title generation is unavailable.
    }
  }

  async function reviseResearchMessage(
    messageId: string,
    originalContent: string,
    request: MindMapRevisionRequest
  ) {
    const {
      chatApiKey: resolvedChatApiKey,
      chatApiBaseUrl: resolvedChatApiBaseUrl,
      unlocked
    } = getResolvedConfig(false);
    if (!unlocked || !resolvedChatApiKey || !resolvedChatApiBaseUrl) {
      throw new Error("当前认证信息不可用，请重新输入认证码。");
    }

    try {
      const response = await fetch("/api/research-revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: resolvedChatApiKey,
          baseUrl: resolvedChatApiBaseUrl,
          model: BRAIN_MODEL,
          originalContent,
          ...request
        })
      });
      const data = await readApiResponse<{ content?: string; error?: string }>(response);
      if (!response.ok || !data.content) throw new Error(data.error || "策划案修改失败。");
      setResearchMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, content: data.content! } : message
        )
      );
      pushToast("success", "已根据导图差异更新策划案。");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "策划案修改失败。";
      pushToast("error", reason);
      throw error;
    }
  }

  async function generateResearchMindMap(content: string) {
    const {
      chatApiKey: resolvedChatApiKey,
      chatApiBaseUrl: resolvedChatApiBaseUrl,
      unlocked
    } = getResolvedConfig(false);
    if (!unlocked || !resolvedChatApiKey || !resolvedChatApiBaseUrl) {
      const message = "当前认证信息不可用，请重新输入认证码。";
      pushToast("error", message);
      throw new Error(message);
    }
    try {
      const response = await fetch("/api/research-mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({
          apiKey: resolvedChatApiKey,
          baseUrl: resolvedChatApiBaseUrl,
          model: BRAIN_MODEL,
          content
        })
      });
      const payload = await readApiResponse<{
        tree?: MindMapTreeData;
        nodeCount?: number;
        quality?: { score?: number; depth?: number; stageOutputs?: number };
        fallback?: boolean;
        warning?: string;
        analysisMode?: "ai";
        analysisVersion?: string;
        error?: string;
      }>(response);
      if (!response.ok || !payload.tree || payload.analysisMode !== "ai" || payload.analysisVersion !== "argument-v2") {
        throw new Error(payload.error || "策划案导图没有获得完整的大模型分析结果。");
      }
      pushToast(
        payload.fallback ? "info" : "success",
        payload.warning || `战略导图已完成逻辑重构与质量验收，共 ${payload.nodeCount || "多"} 个有效节点${payload.quality?.score ? `，结构评分 ${payload.quality.score} 分` : ""}。`
      );
      return payload.tree;
    } catch (error) {
      const message = error instanceof Error && error.name === "TimeoutError"
        ? "导图分析超过 3 分钟，任务已停止且不会继续发起新的模型请求，请重新生成。"
        : error instanceof Error ? error.message : "策划案导图重构失败。";
      pushToast("error", message);
      throw new Error(message);
    }
  }

  async function importResearchDocument(file: File) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/research-document", {
        method: "POST",
        body: formData
      });
      const payload = await readApiResponse<{
        content?: string;
        title?: string;
        truncated?: boolean;
        error?: string;
      }>(response);
      if (!response.ok || !payload.content) {
        throw new Error(payload.error || "策划案文件读取失败。");
      }
      const title = payload.title?.trim() || "导入策划案";
      const importedMessage: ResearchMessage = {
        id: makeId("research-imported-document"),
        role: "assistant",
        content: `# ${title}\n\n${payload.content}`
      };
      setResearchMessages((current) => [
        ...current,
        { id: makeId("research-import-user"), role: "user", content: title },
        importedMessage
      ]);
      pushToast(
        payload.truncated ? "info" : "success",
        payload.truncated ? "策划案较长，已提取前 16 万字用于生成导图。" : "策划案全文已读取，正在准备战略导图。"
      );
      return importedMessage;
    } catch (error) {
      const message = error instanceof Error ? error.message : "策划案文件读取失败。";
      pushToast("error", message);
      throw new Error(message);
    }
  }

  async function openResearchMindMap(message: ResearchMessage) {
    const reusableSession = mindMapSessions.find((session) =>
      session.analysisMode === "ai" &&
      session.analysisVersion === "argument-v2" &&
      session.message.content === message.content
    );
    if (reusableSession) {
      setActiveMindMapSessionId(reusableSession.id);
      setActiveMindMap({ message: reusableSession.message, tree: reusableSession.tree });
      changeSection("mindmap");
      pushToast("success", "已直接打开这份策划案已有的导图结果。");
      return;
    }
    if (mindMapGenerationLockRef.current) {
      pushToast("info", "上一份导图仍在分析中，请等待完成后再试。");
      return;
    }
    mindMapGenerationLockRef.current = true;
    setMindMapGenerationError("");
    setIsGeneratingMindMap(true);
    changeSection("mindmap");
    try {
      const tree = await generateResearchMindMap(message.content);
      const session: MindMapSession = {
        id: makeId("mindmap"),
        title: tree.label.trim().slice(0, 48) || "策划案思维导图",
        updatedAt: Date.now(),
        message,
        tree,
        canRevise: true,
        analysisMode: "ai",
        analysisVersion: "argument-v2"
      };
      setMindMapSessions((current) => {
        const next = [session, ...current];
        persistMindMapSessions(next);
        return next;
      });
      setActiveMindMapSessionId(session.id);
      setActiveMindMap({ message, tree });
    } catch (error) {
      setMindMapGenerationError(error instanceof Error ? error.message : "导图生成失败，请稍后重试。");
      throw error;
    } finally {
      mindMapGenerationLockRef.current = false;
      setIsGeneratingMindMap(false);
    }
  }

  function createNewMindMap() {
    const session = createBlankMindMapSession();
    setMindMapSessions((current) => {
      const next = [session, ...current];
      persistMindMapSessions(next);
      return next;
    });
    setActiveMindMapSessionId(session.id);
    setActiveMindMap({ message: session.message, tree: session.tree });
  }

  function selectMindMapSession(sessionId: string) {
    const session = mindMapSessions.find((item) => item.id === sessionId);
    if (!session) return;
    setActiveMindMapSessionId(session.id);
    setActiveMindMap({ message: session.message, tree: session.tree });
  }

  function updateActiveMindMapTree(tree: MindMapTreeData) {
    if (!activeMindMapSessionId) return;
    setActiveMindMap({ message: activeMindMap?.message || { id: "", role: "assistant", content: "" }, tree });
    setMindMapSessions((current) => {
      const next = current
        .map((session) => session.id === activeMindMapSessionId
          ? { ...session, title: tree.label.trim().slice(0, 48) || session.title, tree, updatedAt: Date.now() }
          : session)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      persistMindMapSessions(next);
      return next;
    });
  }

  function deleteMindMapSession(sessionId: string) {
    const remaining = mindMapSessions.filter((item) => item.id !== sessionId);
    const next = remaining.length ? remaining : [createBlankMindMapSession()];
    persistMindMapSessions(next);
    setMindMapSessions(next);
    if (sessionId === activeMindMapSessionId) {
      setActiveMindMapSessionId(next[0].id);
      setActiveMindMap({ message: next[0].message, tree: next[0].tree });
    }
  }

  async function importDocumentToMindMap(file: File) {
    if (isImportingMindMap) return;
    setIsImportingMindMap(true);
    try {
      const message = await importResearchDocument(file);
      await openResearchMindMap(message);
    } finally {
      setIsImportingMindMap(false);
    }
  }

  function startNewResearchSession() {
    if (isResearchResponding) {
      pushToast("info", "请等待当前策划回复完成后再新建会话。");
      return;
    }
    const session = createResearchSessionRecord();
    setResearchSessions((current) => [session, ...current]);
    setActiveResearchSessionId(session.id);
    setResearchMessages(session.messages);
    setResearchInput("");
    setResearchFiles([]);
  }

  function openResearchSession(sessionId: string) {
    if (sessionId === activeResearchSessionId || isResearchResponding) return;
    const session = researchSessions.find((item) => item.id === sessionId);
    if (!session) return;
    setActiveResearchSessionId(session.id);
    setResearchMessages(session.messages);
    setResearchInput("");
    setResearchFiles([]);
  }

  function renameResearchSession(sessionId: string, title: string) {
    const nextTitle = title.trim().slice(0, 80);
    if (!nextTitle) return;
    setResearchSessions((current) => {
      const next = sortResearchSessionsByUpdatedAt(current.map((session) =>
        session.id === sessionId
          ? { ...session, title: nextTitle, customTitle: true, updatedAt: Date.now() }
          : session
      ));
      persistResearchSessions(next);
      return next;
    });
  }

  function deleteResearchSession(sessionId: string) {
    if (isResearchResponding) return;
    const remaining = researchSessions.filter((session) => session.id !== sessionId);
    if (sessionId !== activeResearchSessionId) {
      setResearchSessions(remaining);
      persistResearchSessions(remaining);
      return;
    }
    const replacement = remaining[0] || createResearchSessionRecord();
    const next = remaining.length ? remaining : [replacement];
    setResearchSessions(next);
    setActiveResearchSessionId(replacement.id);
    setResearchMessages(replacement.messages);
    setResearchInput("");
    setResearchFiles([]);
    persistResearchSessions(next);
  }

  function exportResearchSession(sessionId: string) {
    const session = researchSessions.find((item) => item.id === sessionId);
    if (!session) {
      pushToast("error", "当前没有可导出的策划项目。");
      return;
    }
    const payload = {
      format: "perdesign-research-project",
      version: 1,
      exportedAt: new Date().toISOString(),
      project: {
        title: session.title,
        updatedAt: session.updatedAt,
        messages: sanitizeResearchMessages(session.messages)
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeResearchFilename(session.title)}.perdesign-research.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    pushToast("success", "策划项目已导出。");
  }

  async function importResearchSession(file: File) {
    if (isResearchResponding) {
      pushToast("info", "请等待当前策划回复完成后再导入项目。");
      return;
    }
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("策划项目文件超过 8MB，无法导入。");
      const imported = parseResearchProjectFile(await file.text());
      const session: ResearchSession = {
        id: makeId("research-session"),
        title: imported.title,
        customTitle: true,
        updatedAt: Date.now(),
        messages: imported.messages.map((message) => ({ ...message, id: makeId(`research-${message.role}`) }))
      };
      setResearchSessions((current) => {
        const next = sortResearchSessionsByUpdatedAt([session, ...current]);
        persistResearchSessions(next);
        return next;
      });
      setActiveResearchSessionId(session.id);
      setResearchMessages(session.messages);
      setResearchInput("");
      setResearchFiles([]);
      pushToast("success", `已导入策划项目“${session.title}”。`);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "策划项目文件无法识别。");
    }
  }

  async function addResearchFiles(files: FileList | null) {
    if (!files?.length) return;
    const availableSlots = Math.max(0, 4 - researchFiles.length);
    if (!availableSlots) {
      pushToast("error", "每次最多上传 4 个文件或图片。");
      return;
    }

    const selectedFiles = Array.from(files).slice(0, availableSlots);
    const supportedFiles = selectedFiles.filter((file) =>
      file.type.startsWith("image/") || /\.(?:pdf|docx|txt|md|markdown)$/i.test(file.name)
    );
    if (supportedFiles.length !== selectedFiles.length) {
      pushToast("error", "支持图片、PDF、DOCX、TXT 和 Markdown 文件。其他文件已跳过。");
    }
    if (!supportedFiles.length) return;

    try {
      const next = await Promise.all(
        supportedFiles.map(async (file) => {
          if (file.size > 25 * 1024 * 1024) {
            throw new Error(`${file.name} 超过 25MB，请压缩后重新上传。`);
          }
          if (!file.type.startsWith("image/")) {
            const formData = new FormData();
            formData.append("file", file);
            const response = await fetch("/api/research-document", { method: "POST", body: formData });
            const payload = await readApiResponse<{ content?: string; error?: string }>(response);
            if (!response.ok || !payload.content) throw new Error(payload.error || `${file.name} 无法读取。`);
            return { name: file.name, size: file.size, type: file.type, extractedText: payload.content } satisfies ResearchFile;
          }
          const originalDataUrl = await readFileAsDataUrl(file);
          const dataUrl = await prepareImageForVision(originalDataUrl, 1600, 0.82);
          return {
            name: file.name,
            size: file.size,
            type: file.type,
            dataUrl
          } satisfies ResearchFile;
        })
      );
      setResearchFiles((current) => [...current, ...next].slice(0, 4));
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "附件读取失败，请更换文件后重试。");
    }
  }

  function toggleResearchVoiceInput() {
    if (isResearchListening) {
      speechRecognitionRef.current?.stop();
      setIsResearchListening(false);
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      pushToast("error", "当前浏览器不支持语音输入。");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal) transcript += result[0]?.transcript || "";
      }
      if (!transcript.trim()) return;
      setResearchInput((current) => `${current}${current.trim() ? " " : ""}${transcript.trim()}`);
    };
    recognition.onerror = (event) => {
      setIsResearchListening(false);
      if (event.error === "not-allowed") {
        pushToast("error", "请先允许浏览器使用麦克风。");
        return;
      }
      if (event.error === "no-speech") return;
      pushToast("error", "语音识别失败，请重试。");
    };
    recognition.onend = () => {
      setIsResearchListening(false);
    };

    speechRecognitionRef.current = recognition;
    recognition.start();
    setIsResearchListening(true);
    pushToast("info", "语音识别已开启，请开始说话。");
  }

  return (
    <>
      <main className="app-shell">
        <div className="workspace-layout">
          <aside className="workspace-sidebar">
            <WorkspaceNav activeSection={activeSection as WorkspaceSection} onChange={changeSection} />
          </aside>

          <div className="workspace-main">
            <section className={activeSection === "design" ? "section-surface design-editor" : "hidden"}>
              <div className="design-workspace">
                <button
                  type="button"
                  className={`mobile-settings-backdrop ${mobileDesignSettingsOpen ? "open" : ""}`}
                  onClick={() => setMobileDesignSettingsOpen(false)}
                  aria-label="关闭设计设置"
                />
                <div className={`workspace-sidebar-detail ${mobileDesignSettingsOpen ? "mobile-open" : ""}`}>
                  <div className="mobile-settings-header">
                    <div>
                      <strong>设计设置</strong>
                      <span>产品图、参考图与生成参数</span>
                    </div>
                    <button type="button" onClick={() => setMobileDesignSettingsOpen(false)} aria-label="关闭设计设置">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <ControlPanel
                    productName={productName}
                    setProductName={setProductName}
                    productInputMode={productInputMode}
                    setProductInputMode={setProductInputMode}
                    uploadedImage={uploadedImage}
                    setUploadedImage={setUploadedImage}
                    referenceImages={referenceImages}
                    setReferenceImages={setReferenceImages}
                    innovationLevel={innovationLevel}
                    setInnovationLevel={setInnovationLevel}
                    requirement={requirement}
                    setRequirement={setRequirement}
                    count={count}
                    setCount={setCount}
                    size={size}
                    setSize={setSize}
                    status={status}
                    hasChatConfig={hasChatConfig}
                    canGenerate={canGenerate}
                    onOptimize={optimizePrompt}
                    onRestorePrompt={restorePromptBeforeOptimization}
                    canRestorePrompt={promptBeforeOptimization !== null}
                    onGenerate={() => {
                      void generate();
                      setMobileDesignSettingsOpen(false);
                    }}
                    onError={(message) => pushToast("error", message)}
                  />
                </div>
                <div className="design-gallery-pane">
                  <Gallery
                    isActive={activeSection === "design"}
                    status={status}
                    batches={generationBatches}
                    activeBatchId={activeGenerationBatchId}
                    count={status === "generating" ? pendingGenerationCount : count}
                    isGeneratingVariant={status === "generating" || status === "optimizing"}
                    onGenerateMultiView={generateMultiView}
                    onGenerateScene={generateScene}
                    onGenerateEcommercePoster={generateEcommercePoster}
                    onGenerateDivergence={generateDivergence}
                    onGenerateFromPrompt={generateFromImagePrompt}
                    onGenerateDesignDescription={generateDesignDescription}
                    onModelGenerated={saveGeneratedModel}
                    onUpscale={upscaleImage}
                    onGenerateVideo={generateVideo}
                    designDescriptionLoadingIds={designDescriptionLoadingIds}
                    onLocalEdit={generateLocalEdit}
                    onGenerateCustom={generateCustomCanvas}
                    onOptimizeCustom={optimizeCustomCanvasPrompt}
                    hasChatConfig={hasChatConfig}
                    onOpenSettings={() => setMobileDesignSettingsOpen(true)}
                    historyStats={localHistoryStats}
                    isHistoryReady={isLocalHistoryReady}
                    onRefreshHistoryStats={refreshHistoryStats}
                    onExportProject={exportLocalProject}
                    onImportProject={importLocalProject}
                    onClearHistory={clearLocalHistory}
                    onDeleteResult={deleteGalleryResult}
                    onError={(message) => pushToast("error", message)}
                    onSuccess={(message) => pushToast("success", message)}
                  />
                </div>
              </div>
            </section>

            {activeSection === "research" ? (
              <ResearchSection
                input={researchInput}
                setInput={setResearchInput}
                files={researchFiles}
                addFiles={addResearchFiles}
                messages={researchMessages}
                isListening={isResearchListening}
                isResponding={isResearchResponding}
                onSend={sendResearchMessage}
                onToggleVoiceInput={toggleResearchVoiceInput}
                onRemoveFile={(index) => setResearchFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                onOpenMindMap={openResearchMindMap}
                sessions={researchSessions}
                activeSessionId={activeResearchSessionId}
                historyReady={isResearchHistoryReady}
                onNewSession={startNewResearchSession}
                onSelectSession={openResearchSession}
                onExportSession={exportResearchSession}
                onImportSession={importResearchSession}
                onRenameSession={renameResearchSession}
                onDeleteSession={deleteResearchSession}
              />
            ) : null}

            {activeSection === "vent" ? <VentEditor /> : null}

            {activeSection === "mindmap" ? (
              <MindMapSection
                activeMap={activeMindMap}
                sessions={mindMapSessions}
                activeSessionId={activeMindMapSessionId}
                isImporting={isImportingMindMap}
                isGenerating={isGeneratingMindMap}
                generationError={mindMapGenerationError}
                onImport={importDocumentToMindMap}
                onDismissGenerationError={() => setMindMapGenerationError("")}
                onNew={createNewMindMap}
                onSelect={selectMindMapSession}
                onDelete={deleteMindMapSession}
                onTreeChange={updateActiveMindMapTree}
                onRequestRevision={async (request) => {
                  if (!activeMindMap) return;
                  await reviseResearchMessage(
                    activeMindMap.message.id,
                    activeMindMap.message.content,
                    request
                  );
                  changeSection("research");
                }}
              />
            ) : null}

            {activeSection === "api" ? (
              <ApiSection
                authCode={authDraft}
                setAuthCode={setAuthDraft}
                isAuthorized={isAuthorized}
                onSave={saveAuthConfig}
              />
            ) : null}
          </div>
        </div>
        <span className="app-version" aria-label="当前版本 v1.0.6">v1.0.6</span>
      </main>
      <AuthCodeModal
        open={isAuthModalOpen}
        value={authModalValue}
        setValue={setAuthModalValue}
        onClose={() => {
          setIsAuthModalOpen(false);
          setPendingAuthAction(null);
        }}
        onSubmit={submitAuthModal}
      />
      <Toast toasts={toasts} />
    </>
  );
}

function WorkspaceNav({
  activeSection,
  onChange
}: {
  activeSection: WorkspaceSection;
  onChange: (section: WorkspaceSection) => void;
}) {
  return (
    <aside className="workspace-nav">
      <div>
        <div className="workspace-brand">
          <img src="/pinwu-logo.png" alt="品物AI创意生成平台 Logo" className="workspace-brand-logo" />
          <div className="workspace-brand-copy">
            <div className="workspace-brand-title">品物AI创意生成平台</div>
            <div className="workspace-brand-subtitle">Perdesign AI Creative Platform</div>
          </div>
        </div>

        <div className="workspace-nav-group">
          <button
            type="button"
            className={`workspace-nav-item ${activeSection === "research" ? "active" : ""}`}
            onClick={() => onChange("research")}
          >
            <MessageSquareText className="h-4 w-4" />
            <span>策划研究</span>
          </button>
          <button
            type="button"
            className={`workspace-nav-item ${activeSection === "design" ? "active" : ""}`}
            onClick={() => onChange("design")}
          >
            <Palette className="h-4 w-4" />
            <span>外观设计</span>
          </button>
          <button
            type="button"
            className={`workspace-nav-item ${activeSection === "vent" ? "active" : ""}`}
            onClick={() => onChange("vent")}
          >
            <Grid3X3 className="h-4 w-4" />
            <span>网孔编辑</span>
          </button>
          <button
            type="button"
            className={`workspace-nav-item ${activeSection === "mindmap" ? "active" : ""}`}
            onClick={() => onChange("mindmap")}
          >
            <Network className="h-4 w-4" />
            <span>思维导图</span>
          </button>
        </div>
      </div>

      <div className="workspace-nav-bottom">
        <button
          type="button"
          className={`workspace-nav-item ${activeSection === "api" ? "active" : ""}`}
          onClick={() => onChange("api")}
        >
          <PlugZap className="h-4 w-4" />
          <span>认证码</span>
        </button>
      </div>
    </aside>
  );
}

function ResearchSection({
  input,
  setInput,
  files,
  addFiles,
  messages,
  isListening,
  isResponding,
  onSend,
  onToggleVoiceInput,
  onRemoveFile,
  onOpenMindMap,
  sessions,
  activeSessionId,
  historyReady,
  onNewSession,
  onSelectSession,
  onExportSession,
  onImportSession,
  onRenameSession,
  onDeleteSession
}: {
  input: string;
  setInput: (value: string) => void;
  files: ResearchFile[];
  addFiles: (files: FileList | null) => Promise<void>;
  messages: ResearchMessage[];
  isListening: boolean;
  isResponding: boolean;
  onSend: () => void;
  onToggleVoiceInput: () => void;
  onRemoveFile: (index: number) => void;
  onOpenMindMap: (message: ResearchMessage) => Promise<void>;
  sessions: ResearchSession[];
  activeSessionId: string;
  historyReady: boolean;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onExportSession: (sessionId: string) => void;
  onImportSession: (file: File) => Promise<void>;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const historyImportInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const lastAutoPositionedMessageIdRef = useRef(messages.at(-1)?.id || "");
  const positionedResearchSessionIdRef = useRef("");
  const upwardWheelDistanceRef = useRef(0);
  const lastUpwardWheelAtRef = useRef(0);
  const returnToMessageTopTimerRef = useRef<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showReturnToMessageTop, setShowReturnToMessageTop] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [mindMapLoadingMessageId, setMindMapLoadingMessageId] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const latestMessageId = messages.at(-1)?.id || "";
  const latestMessageRole = messages.at(-1)?.role;

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const stream = streamRef.current;
      if (!stream) return;
      const sessionChanged = positionedResearchSessionIdRef.current !== activeSessionId;
      if (sessionChanged) {
        const savedPosition = researchScrollPositions.get(activeSessionId);
        stream.scrollTo({
          top: savedPosition ?? stream.scrollHeight,
          behavior: "auto"
        });
        positionedResearchSessionIdRef.current = activeSessionId;
        if (latestMessageId) lastAutoPositionedMessageIdRef.current = latestMessageId;
        return;
      }
      const isNewMessage = Boolean(
        latestMessageId && latestMessageId !== lastAutoPositionedMessageIdRef.current
      );
      if (isNewMessage && latestMessageRole === "assistant") {
        const target = stream.querySelector<HTMLElement>(
          `[data-research-message-id="${CSS.escape(latestMessageId)}"]`
        );
        if (target) {
          stream.scrollTo({
            top: Math.max(0, target.offsetTop - stream.offsetTop - 8),
            behavior: "smooth"
          });
          lastAutoPositionedMessageIdRef.current = latestMessageId;
          return;
        }
      }
      if (isNewMessage) {
        stream.scrollTo({ top: stream.scrollHeight, behavior: "smooth" });
        lastAutoPositionedMessageIdRef.current = latestMessageId;
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeSessionId, latestMessageId, latestMessageRole]);

  useEffect(() => () => {
    if (returnToMessageTopTimerRef.current !== null) {
      window.clearTimeout(returnToMessageTopTimerRef.current);
    }
  }, []);

  async function copyMessage(message: ResearchMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = message.content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopiedMessageId(message.id);
    window.setTimeout(() => {
      setCopiedMessageId((current) => (current === message.id ? null : current));
    }, 1600);
  }

  function selectMessageText(element: HTMLDivElement) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function scrollCurrentResearchMessageToTop() {
    const stream = streamRef.current;
    if (!stream) return;
    const streamRect = stream.getBoundingClientRect();
    const readingLine = streamRect.top + 56;
    const assistantMessages = Array.from(
      stream.querySelectorAll<HTMLElement>('[data-research-message-role="assistant"]')
    );
    const currentMessage = assistantMessages.find((message) => {
      const rect = message.getBoundingClientRect();
      return rect.top <= readingLine && rect.bottom >= readingLine;
    }) || assistantMessages.find((message) => message.getBoundingClientRect().bottom > readingLine);
    if (!currentMessage) return;
    stream.scrollTo({
      top: Math.max(0, currentMessage.offsetTop - stream.offsetTop - 8),
      behavior: "smooth"
    });
    setShowReturnToMessageTop(false);
    upwardWheelDistanceRef.current = 0;
  }

  function detectRapidUpwardResearchScroll(event: React.WheelEvent<HTMLDivElement>) {
    const now = performance.now();
    if (event.deltaY >= 0) {
      upwardWheelDistanceRef.current = 0;
      return;
    }
    if (now - lastUpwardWheelAtRef.current > 420) upwardWheelDistanceRef.current = 0;
    lastUpwardWheelAtRef.current = now;
    upwardWheelDistanceRef.current += Math.abs(event.deltaY);
    if (upwardWheelDistanceRef.current < 150) return;

    setShowReturnToMessageTop(true);
    if (returnToMessageTopTimerRef.current !== null) {
      window.clearTimeout(returnToMessageTopTimerRef.current);
    }
    returnToMessageTopTimerRef.current = window.setTimeout(() => {
      setShowReturnToMessageTop(false);
      upwardWheelDistanceRef.current = 0;
      returnToMessageTopTimerRef.current = null;
    }, 1800);
  }

  return (
    <section className="section-surface">
      <div className="research-workspace">
        <aside className="research-history-sidebar">
          <div className="research-history-heading">
            <div>
              <strong>策划历史</strong>
              <span>{sessions.length} 个项目</span>
            </div>
            <div className="research-history-actions">
              <button type="button" onClick={onNewSession} disabled={isResponding} title="新建策划" aria-label="新建策划">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <input
            ref={historyImportInputRef}
            className="hidden"
            type="file"
            accept=".json,.perdesign-research.json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onImportSession(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="research-history-import"
            onClick={() => historyImportInputRef.current?.click()}
            disabled={isResponding}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>导入策划项目</span>
          </button>
          <div className="research-history-list">
            {historyReady ? sessions.map((session) => (
              <div
                key={session.id}
                className={`research-history-item ${session.id === activeSessionId ? "active" : ""}`}
              >
                <button
                  type="button"
                  className="research-history-item-main"
                  onClick={() => onSelectSession(session.id)}
                  disabled={isResponding && session.id !== activeSessionId}
                >
                  <MessageSquareText className="h-3.5 w-3.5" />
                  <span>
                    {renamingSessionId === session.id ? (
                      <input
                        value={renamingTitle}
                        autoFocus
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setRenamingTitle(event.target.value)}
                        onBlur={() => {
                          onRenameSession(session.id, renamingTitle);
                          setRenamingSessionId(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            setRenamingTitle(session.title);
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    ) : <strong>{session.title}</strong>}
                    <small>{formatResearchSessionTime(session.updatedAt)}</small>
                  </span>
                </button>
                <div className="research-history-item-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingSessionId(session.id);
                      setRenamingTitle(session.title);
                    }}
                    disabled={isResponding}
                    title="重命名"
                    aria-label={`重命名 ${session.title}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`确定删除策划项目“${session.title}”吗？`)) {
                        onDeleteSession(session.id);
                      }
                    }}
                    disabled={isResponding}
                    title="删除"
                    aria-label={`删除 ${session.title}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )) : (
              <div className="research-history-loading">正在读取历史记录…</div>
            )}
          </div>
        </aside>

        <div className="research-shell">
        <div className="research-conversation-toolbar">
          <div>
            <strong>{activeSession?.title || "新策划研究"}</strong>
            <span>策划对话与研究结果</span>
          </div>
          <span className="research-conversation-toolbar-actions">
            <button
              type="button"
              onClick={() => onExportSession(activeSessionId)}
              disabled={!activeSessionId || isResponding}
              title="导出当前策划项目"
            >
              <Download className="h-3.5 w-3.5" />
              <span>导出</span>
            </button>
          </span>
        </div>
        {showReturnToMessageTop ? (
          <button
            type="button"
            className="research-return-message-top"
            onClick={scrollCurrentResearchMessageToTop}
            title="回到当前回复开头"
            aria-label="回到当前回复开头"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        ) : null}
        <div
          ref={streamRef}
          className="research-stream"
          onWheel={detectRapidUpwardResearchScroll}
          onScroll={(event) => {
            if (activeSessionId) researchScrollPositions.set(activeSessionId, event.currentTarget.scrollTop);
          }}
        >
          {messages.map((message) => (
            <article
              key={message.id}
              data-research-message-id={message.id}
              data-research-message-role={message.role}
              className={`research-message ${message.role}`}
            >
              <div className="research-role">
                {message.role === "assistant" ? <Bot className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                <span>{message.role === "assistant" ? "Research AI" : "你"}</span>
              </div>
              <div className="research-bubble-wrap">
                <div
                  className={`research-bubble ${message.role === "assistant" ? "has-copy" : ""}`}
                  onContextMenu={(event) => selectMessageText(event.currentTarget)}
                >
                  {message.role === "assistant"
                    ? <ResearchMarkdown content={message.content} sources={message.sources} images={message.images} />
                    : message.content}
                </div>
                {message.role === "assistant" ? (
                  <div className="research-message-tools">
                    {canCreateResearchMindMap(message.content) ? (
                      <>
                        <button
                          type="button"
                          className="research-message-tool"
                          onClick={() => {
                            if (mindMapLoadingMessageId) return;
                            setMindMapLoadingMessageId(message.id);
                            void onOpenMindMap(message)
                              .catch(() => undefined)
                              .finally(() => setMindMapLoadingMessageId(null));
                          }}
                          disabled={Boolean(mindMapLoadingMessageId)}
                          title={mindMapLoadingMessageId === message.id ? "正在重构战略导图" : "转为战略思维导图"}
                          aria-label="转为思维导图"
                        >
                          {mindMapLoadingMessageId === message.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Network className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          className="research-message-tool"
                          onClick={() => void downloadResearchWord(message.content, activeSession?.title || "产品策划案")}
                          title="导出 Word"
                          aria-label="导出 Word"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className={`research-message-tool ${copiedMessageId === message.id ? "copied" : ""}`}
                      onClick={() => void copyMessage(message)}
                      title={copiedMessageId === message.id ? "已复制" : "复制全部文本"}
                      aria-label={copiedMessageId === message.id ? "已复制" : "复制全部文本"}
                    >
                      {copiedMessageId === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ) : null}
              </div>
              {message.sources?.length ? (
                <div className="research-evidence-section">
                  <div className="research-evidence-heading">资料来源</div>
                  <div className="research-chip-row research-source-row">
                    {message.sources.map((source) => typeof source === "string" ? (
                      <span key={`${message.id}-${source}`} className="research-chip source">{source}</span>
                    ) : (
                      <a
                        key={`${message.id}-${source.url}`}
                        className="research-chip source linked"
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        title={source.snippet || source.title}
                      >
                        <span className="research-source-index">W{message.sources!.filter((item) => typeof item !== "string").indexOf(source) + 1}</span>
                        {source.title}
                        <span className="research-source-domain">{source.domain || safeResearchHostname(source.url)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {message.files?.length ? (
                <div className="research-chip-row">
                  {message.files.map((file, index) => (
                    <span key={`${message.id}-${file.name}-${index}`} className="research-chip research-file-chip">
                      {file.dataUrl ? <img src={file.dataUrl} alt="" className="research-file-thumb" /> : <FileDown className="h-3.5 w-3.5" />}
                      {file.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {isResponding ? (
            <article className="research-message assistant">
              <div className="research-role">
                <Bot className="h-4 w-4" />
                <span>Research AI</span>
              </div>
              <div className="research-bubble research-thinking-bubble" aria-live="polite" aria-label="正在思考">
                <span className="research-thinking-dot" />
                <span className="research-thinking-dot" />
                <span className="research-thinking-dot" />
              </div>
            </article>
          ) : null}
        </div>

        <div
          className={`research-composer ${isDragOver ? "drag-active" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragOver(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setIsDragOver(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsDragOver(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragOver(false);
            void addFiles(event.dataTransfer.files);
          }}
        >
          {files.length ? (
            <div className="research-chip-row research-chip-stack">
              {files.map((file, index) => (
                <button
                  key={`${file.name}-${index}`}
                  type="button"
                  className="research-chip research-file-chip dismissible"
                  onClick={() => onRemoveFile(index)}
                  title="点击移除"
                >
                  {file.dataUrl ? <img src={file.dataUrl} alt="" className="research-file-thumb" /> : <FileDown className="h-3.5 w-3.5" />}
                  {file.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="research-composer-bar">
            <button type="button" className="research-plus-button" onClick={() => fileInputRef.current?.click()} aria-label="上传资料">
              <Plus className="h-4 w-4" />
            </button>
            <textarea
              className="research-textarea"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onPaste={(event) => {
                if (!event.clipboardData.files.length) return;
                event.preventDefault();
                void addFiles(event.clipboardData.files);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                if (event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (!isResponding) onSend();
              }}
              placeholder="询问 Perdesign AI"
            />
            <div className="research-composer-actions">
              <button
                type="button"
                className={`research-icon-button ${isListening ? "active" : ""}`}
                onClick={onToggleVoiceInput}
                aria-label="语音输入"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button type="button" className="research-send-button" onClick={onSend} aria-label="发送研究任务" disabled={isResponding}>
                <SendHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="image/*,.pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            multiple
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
        </div>
      </div>
    </section>
  );
}

function MindMapSection({
  activeMap,
  sessions,
  activeSessionId,
  isImporting,
  isGenerating,
  generationError,
  onImport,
  onDismissGenerationError,
  onNew,
  onSelect,
  onDelete,
  onTreeChange,
  onRequestRevision
}: {
  activeMap: ActiveMindMap | null;
  sessions: MindMapSession[];
  activeSessionId: string;
  isImporting: boolean;
  isGenerating: boolean;
  generationError: string;
  onImport: (file: File) => Promise<void>;
  onDismissGenerationError: () => void;
  onNew: () => void;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onTreeChange: (tree: MindMapTreeData) => void;
  onRequestRevision: (request: MindMapRevisionRequest) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeSession = sessions.find((session) => session.id === activeSessionId);

  return (
    <section className="section-surface mindmap-workspace-section">
      <div className="mindmap-project-workspace">
        <aside className="research-history-sidebar mindmap-history-sidebar">
          <div className="research-history-heading">
            <div><strong>历史导图</strong><span>{sessions.length} 个项目</span></div>
            <button type="button" onClick={onNew} title="新建空白导图" aria-label="新建空白导图">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".docx,.pdf,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onImport(file).catch(() => undefined);
            }}
          />
          <button className="research-history-import mindmap-upload-action" type="button" onClick={() => inputRef.current?.click()} disabled={isImporting}>
            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            <span>{isImporting ? "正在阅读全文与论证分析" : "上传策划案生成导图"}</span>
          </button>
          <div className="research-history-list mindmap-history-list">
            {sessions.map((session) => (
              <div key={session.id} className={`research-history-item ${session.id === activeSessionId ? "active" : ""}`}>
                <button type="button" className="research-history-item-main" onClick={() => onSelect(session.id)}>
                  <Network className="h-3.5 w-3.5" />
                  <span><strong>{session.title}</strong><small>{formatResearchSessionTime(session.updatedAt)}</small></span>
                </button>
                <div className="research-history-item-actions">
                  <button type="button" onClick={() => onDelete(session.id)} title="删除导图" aria-label={`删除${session.title}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
        <div className="mindmap-canvas-pane">
          {activeMap ? (
            <ResearchMindMapModal
              key={activeSessionId}
              embedded
              canRevise={Boolean(activeSession?.canRevise)}
              centerInitialView={Boolean(
                activeSession &&
                !activeSession.canRevise &&
                !activeSession.tree.position &&
                activeSession.tree.children.length === 0
              )}
              title={activeSession?.title || "新思维导图"}
              content={activeMap.message.content}
              initialTree={activeMap.tree}
              onTreeChange={onTreeChange}
              onClose={onNew}
              onRequestRevision={onRequestRevision}
            />
          ) : null}
          {isGenerating ? (
            <div className="mindmap-generation-status" role="status" aria-live="polite">
              <Loader2 className="h-6 w-6 animate-spin" />
              <strong>正在生成战略思维导图</strong>
              <span>正在分段阅读全文并建立内容账本；随后将重构七阶段论证链并执行结构质量验收。</span>
            </div>
          ) : null}
          {!isGenerating && generationError ? (
            <div className="mindmap-generation-status error" role="alert">
              <X className="h-5 w-5" />
              <strong>导图生成失败</strong>
              <span>{generationError}</span>
              <button type="button" onClick={onDismissGenerationError}>我知道了</button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function canCreateResearchMindMap(content: string) {
  const structuralLines = content
    .split(/\r?\n/)
    .filter((line) => /^\s*(#{1,5}\s+|[-*•]\s+|\d+[.)、]\s+)/.test(line));
  return content.length >= 280 && structuralLines.length >= 4;
}

function ResearchMarkdown({
  content,
  sources,
  images
}: {
  content: string;
  sources?: Array<string | ResearchWebSource>;
  images?: ResearchWebImage[];
}) {
  const lines = content.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  const webSources = (sources || []).filter((source): source is ResearchWebSource => typeof source !== "string");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)/);
    if (heading) {
      const level = heading[1].length;
      const children = renderResearchInlineMarkdown(heading[2], webSources);
      blocks.push(level === 1
        ? <h1 key={`h-${index}`}>{children}</h1>
        : level === 2
          ? <h2 key={`h-${index}`}>{children}</h2>
          : level === 3
            ? <h3 key={`h-${index}`}>{children}</h3>
            : <h4 key={`h-${index}`}>{children}</h4>);
      index += 1;
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*[-*•]\s+/.test(lines[index])) {
        items.push(<li key={`ul-${index}`}>{renderResearchInlineMarkdown(lines[index].replace(/^\s*[-*•]\s+/, ""), webSources)}</li>);
        index += 1;
      }
      blocks.push(<ul key={`ul-block-${index}`}>{items}</ul>);
      continue;
    }
    if (/^\s*\d+[.)、]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*\d+[.)、]\s+/.test(lines[index])) {
        items.push(<li key={`ol-${index}`}>{renderResearchInlineMarkdown(lines[index].replace(/^\s*\d+[.)、]\s+/, ""), webSources)}</li>);
        index += 1;
      }
      blocks.push(<ol key={`ol-block-${index}`}>{items}</ol>);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{renderResearchInlineMarkdown(quote.join(" "), webSources)}</blockquote>);
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s+/.test(lines[index]) &&
      !/^\s*(?:[-*•]\s+|\d+[.)、]\s+|>\s?)/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}>{renderResearchInlineMarkdown(paragraph.join(" "), webSources)}</p>);
  }

  const imagesByBlock = new Map<number, ResearchWebImage[]>();
  (images || []).forEach((image) => {
    const sourceIndex = webSources.findIndex((source) => source.url === image.sourceUrl);
    const citationOffset = sourceIndex >= 0 ? content.indexOf(`[W${sourceIndex + 1}]`) : -1;
    // Do not force an image into the document unless the answer actually cites
    // the page it came from. This keeps loosely related search imagery out of
    // unrelated sections and also cleans up older persisted conversations.
    if (citationOffset < 0) return;
    const proportionalIndex = content.length
      ? Math.floor((citationOffset / content.length) * Math.max(blocks.length, 1))
      : 0;
    const blockIndex = Math.max(0, Math.min(blocks.length - 1, proportionalIndex));
    if (!imagesByBlock.has(blockIndex)) imagesByBlock.set(blockIndex, [image]);
  });

  const interleaved: ReactNode[] = [];
  blocks.forEach((block, blockIndex) => {
    interleaved.push(block);
    (imagesByBlock.get(blockIndex) || []).forEach((image) => {
      interleaved.push(<ResearchInlineImage key={`web-image-${image.url}`} image={image} />);
    });
  });

  return <div className="research-markdown">{interleaved}</div>;
}

function renderResearchInlineMarkdown(text: string, sources: ResearchWebSource[] = []) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[W\d+\])/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${index}-${part}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${index}-${part}`}>{part.slice(1, -1)}</code>;
    }
    const citation = part.match(/^\[W(\d+)\]$/);
    if (citation) {
      const source = sources[Number(citation[1]) - 1];
      return source ? (
        <a
          key={`${index}-${part}`}
          className="research-inline-citation"
          href={source.url}
          target="_blank"
          rel="noreferrer"
          title={source.title}
        >
          {part}
        </a>
      ) : part;
    }
    return part;
  });
}

function ResearchInlineImage({ image }: { image: ResearchWebImage }) {
  return (
    <figure className="research-inline-figure">
      <a href={image.sourceUrl} target="_blank" rel="noreferrer" title={`查看图片来源：${image.sourceTitle}`}>
        <img
          src={image.url}
          alt={image.alt || image.sourceTitle}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => { event.currentTarget.closest("figure")?.remove(); }}
        />
      </a>
      <figcaption>资料图：{image.sourceTitle} · 点击查看原始网页</figcaption>
    </figure>
  );
}

function createResearchWelcomeMessages(): ResearchMessage[] {
  return [
    {
      id: makeId("research-message"),
      role: "assistant",
      content: RESEARCH_WELCOME_MESSAGE
    }
  ];
}

function createResearchSessionRecord(): ResearchSession {
  return {
    id: makeId("research-session"),
    title: "新策划研究",
    updatedAt: Date.now(),
    messages: createResearchWelcomeMessages()
  };
}

function sanitizeResearchMessages(messages: ResearchMessage[]): ResearchMessage[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content.trim(),
      files: message.files,
      sources: message.sources,
      images: message.images
    }));
}

function hasMeaningfulResearchSessionContent(messages: ResearchMessage[]) {
  return messages.some((message) =>
    message.role === "user" ||
    (message.role === "assistant" && message.content.trim() !== RESEARCH_WELCOME_MESSAGE)
  );
}

function persistResearchSessions(sessions: ResearchSession[]) {
  try {
    localStorage.setItem(
      RESEARCH_HISTORY_STORAGE_KEY,
      JSON.stringify(sortResearchSessionsByUpdatedAt(sessions).slice(0, 40))
    );
  } catch {
    // The current in-memory history remains usable if browser storage is unavailable.
  }
}

function sortResearchSessionsByUpdatedAt(sessions: ResearchSession[]) {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40);
}

function createBlankMindMapSession(): MindMapSession {
  const id = makeId("mindmap");
  const tree: MindMapTreeData = { id: `${id}-root`, label: "新思维导图", children: [] };
  return {
    id,
    title: tree.label,
    updatedAt: Date.now(),
    canRevise: false,
    tree,
    message: { id: `${id}-blank`, role: "assistant", content: "# 新思维导图" }
  };
}

function persistMindMapSessions(sessions: MindMapSession[]) {
  try {
    localStorage.setItem(
      MIND_MAP_HISTORY_STORAGE_KEY,
      JSON.stringify([...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 60))
    );
  } catch {
    // 浏览器存储不可用时仍保留当前内存中的导图。
  }
}

function getResearchSessionTitle(messages: ResearchMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstUserMessage) return "新策划研究";
  const firstSentence = firstUserMessage
    .replace(/\s+/g, " ")
    .split(/[。！？!?；;\n]/)[0]
    .trim();
  const summarized = firstSentence
    .replace(/^(?:你好[，,、 ]*)?(?:请|麻烦)?(?:你)?(?:帮我|帮忙|给我)?(?:策划|研究|分析|做|设计|开发|创建|生成)(?:一下|一个|一款|一份)?[，,、：: ]*/i, "")
    .replace(/^(?:我|我们)(?:现在|这次)?(?:想要?|需要|准备|计划|希望)(?:做|开发|设计|推出|策划)?(?:一个|一款|一套|一份)?[，,、：: ]*/i, "")
    .trim() || firstSentence;
  return summarized.length > 20 ? `${summarized.slice(0, 20)}…` : summarized;
}

function formatResearchSessionTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function sanitizeResearchFilename(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim();
  return (cleaned || "策划项目").slice(0, 60);
}

function parseResearchProjectFile(raw: string): { title: string; messages: ResearchMessage[] } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("文件不是有效的策划项目 JSON。");
  }
  if (!value || typeof value !== "object") throw new Error("策划项目文件结构不正确。");
  const payload = value as {
    format?: unknown;
    version?: unknown;
    project?: { title?: unknown; messages?: unknown };
  };
  if (payload.format !== "perdesign-research-project" || payload.version !== 1) {
    throw new Error("这不是受支持的品物策划项目文件。");
  }
  const title = typeof payload.project?.title === "string" ? payload.project.title.trim() : "";
  if (!title || title.length > 120 || !Array.isArray(payload.project?.messages)) {
    throw new Error("策划项目缺少有效的标题或对话内容。");
  }
  if (!payload.project.messages.length || payload.project.messages.length > 500) {
    throw new Error("策划项目中的消息数量不正确。");
  }
  const messages = payload.project.messages.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`第 ${index + 1} 条消息格式不正确。`);
    const message = item as { role?: unknown; content?: unknown; sources?: unknown; images?: unknown };
    if ((message.role !== "assistant" && message.role !== "user") || typeof message.content !== "string") {
      throw new Error(`第 ${index + 1} 条消息缺少有效内容。`);
    }
    if (!message.content.trim() || message.content.length > 500_000) {
      throw new Error(`第 ${index + 1} 条消息内容不正确或过长。`);
    }
    const sources = sanitizeImportedResearchSources(message.sources);
    const images = sanitizeImportedResearchImages(message.images);
    return {
      id: makeId(`research-${message.role}`),
      role: message.role,
      content: message.content,
      sources,
      images
    } satisfies ResearchMessage;
  });
  return { title: title.slice(0, 80), messages };
}

function safeResearchHostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "来源网页"; }
}

function reconcileResearchEvidenceClaims(content: string, sourceCount: number, imageCount: number, evidenceRequested: boolean) {
  if (!evidenceRequested && !imageCount) return content;
  const cleaned = content
    .split("\n")
    .filter((line) => !/(?:不能|无法|不支持).{0,22}(?:抓取|获取|访问|展示|提供|贴).{0,28}(?:网页|网络|网上)?图片|(?:不能|无法|不支持).{0,22}(?:从网上|从网络).{0,28}(?:图片|贴图)/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const evidenceNote = imageCount
    ? `> 平台已检索到 ${sourceCount} 个网络来源和 ${imageCount} 张相关附图，图片与原始网页入口见本条回复下方。`
    : `> 本次检索暂未返回可展示附图；已获得的资料来源入口见本条回复下方。`;
  return cleaned.includes("本条回复下方") ? cleaned : `${cleaned}\n\n${evidenceNote}`;
}

function sanitizeImportedResearchSources(value: unknown): ResearchMessage["sources"] {
  if (!Array.isArray(value)) return undefined;
  const result: Array<string | ResearchWebSource> = [];
  for (const source of value) {
    if (typeof source === "string") {
      result.push(source.slice(0, 160));
      continue;
    }
    if (!source || typeof source !== "object") continue;
    const item = source as Partial<ResearchWebSource>;
    if (typeof item.title !== "string" || typeof item.url !== "string" || !/^https?:\/\//i.test(item.url)) continue;
    result.push({ title: item.title.slice(0, 240), url: item.url, snippet: typeof item.snippet === "string" ? item.snippet.slice(0, 500) : "", domain: typeof item.domain === "string" ? item.domain.slice(0, 120) : "" });
  }
  return result.slice(0, 50);
}

function sanitizeImportedResearchImages(value: unknown): ResearchWebImage[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((image) => {
    if (!image || typeof image !== "object") return [];
    const item = image as Partial<ResearchWebImage>;
    if (typeof item.url !== "string" || typeof item.sourceUrl !== "string" || typeof item.sourceTitle !== "string") return [];
    if (!/^https?:\/\//i.test(item.url) || !/^https?:\/\//i.test(item.sourceUrl)) return [];
    return [{ url: item.url, sourceUrl: item.sourceUrl, sourceTitle: item.sourceTitle.slice(0, 240), alt: typeof item.alt === "string" ? item.alt.slice(0, 240) : "" }];
  }).slice(0, 8);
}

function ApiSection(props: {
  authCode: string;
  setAuthCode: (value: string) => void;
  isAuthorized: boolean;
  onSave: () => void;
}) {
  return (
    <section className="section-surface">
      <div className="section-header">
        <div>
          <h1 className="section-title">认证码</h1>
          <p className="section-subtitle">输入认证码后，平台会自动接入对话与生图服务，无需再手动填写 API Key。</p>
        </div>
      </div>

      <div className="api-grid">
        <div className="content-card-soft col-span-full max-w-[720px] p-6">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-200">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${props.isAuthorized ? "bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]" : "bg-zinc-500"}`}
              />
              {props.isAuthorized ? "已认证，可直接使用全部功能" : "未认证，生成与对话功能将被锁定"}
            </div>

            <label className="block">
              <input
                className="field h-11 px-3 text-sm"
                value={props.authCode}
                onChange={(event) => props.setAuthCode(event.target.value)}
                placeholder="请输入认证码"
              />
            </label>

            <div className="api-inline-actions px-4 py-4">
              <button type="button" className="btn-primary api-save-button" onClick={props.onSave}>
                保存并认证
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AuthCodeModal({
  open,
  value,
  setValue,
  onClose,
  onSubmit
}: {
  open: boolean;
  value: string;
  setValue: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5 backdrop-blur-sm">
      <div className="w-full max-w-[460px] rounded-[24px] border border-white/10 bg-[#18181b] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="space-y-2">
          <h2 className="text-[28px] font-semibold text-white">输入认证码</h2>
          <p className="text-sm leading-6 text-zinc-400">认证通过后即可直接使用生成与对话功能。</p>
        </div>

        <div className="mt-5 space-y-4">
          <input
            autoFocus
            className="field h-12 px-4 text-sm"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onSubmit();
            }}
            placeholder="请输入认证码"
          />

          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" className="btn-secondary h-11 rounded-[14px] px-4 text-sm font-medium" onClick={onClose}>
              取消
            </button>
            <button type="button" className="btn-primary h-11 rounded-[14px] px-5 text-sm font-semibold" onClick={onSubmit}>
              确认使用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

class TerminalImageJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TerminalImageJobError";
  }
}

function waitForImageJobPoll(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function getDataUrlImageSize(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error("无法读取当前图片尺寸。"));
        return;
      }
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => reject(new Error("无法读取当前图片尺寸。"));
    image.src = dataUrl;
  });
}

function sortGenerationResults(results: GenerationResult[]) {
  return [...results].sort((left, right) => {
    const leftSequence = Number(left.title.match(/\d+/)?.[0] || Number.MAX_SAFE_INTEGER);
    const rightSequence = Number(right.title.match(/\d+/)?.[0] || Number.MAX_SAFE_INTEGER);
    return leftSequence - rightSequence;
  });
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const responseText = await response.text();
  try {
    return JSON.parse(responseText) as T;
  } catch {
    if (response.status === 413 || /request entity too large|payload too large/i.test(responseText)) {
      throw new Error("本次图片总数据仍超过服务器接收上限，请减少参考图数量或更换较小的图片后重试。");
    }
    if (!response.ok) {
      throw new Error(`服务请求失败（${response.status}），请稍后重试。`);
    }
    throw new Error("服务返回格式异常，请稍后重试。");
  }
}

type ResearchStreamEvent = {
  type: "delta" | "done" | "error";
  content?: string;
  sources?: Array<string | ResearchWebSource>;
  images?: ResearchWebImage[];
  error?: string;
};

async function readNdjsonStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ResearchStreamEvent) => void
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = done ? "" : lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line) as ResearchStreamEvent);
      } catch {
        // Ignore incomplete or provider-specific non-JSON lines.
      }
    }
    if (done) break;
  }
}

function usePersistedState(key: string, defaultValue: string) {
  const [value, setValue] = useState(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored !== null) setValue(stored);
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(key, value);
  }, [hydrated, key, value]);

  return [value, setValue] as const;
}

function usePersistedNumber(key: string, defaultValue: number) {
  const [value, setValue] = useState(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored !== null) setValue(Number(stored));
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(key, String(value));
  }, [hydrated, key, value]);

  return [value, setValue] as const;
}

function getImageSizeOption(dataUrl: string, fallback: string) {
  return new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > image.naturalHeight) return resolve("1536x1024");
      if (image.naturalHeight > image.naturalWidth) return resolve("1024x1536");
      resolve("1024x1024");
    };
    image.onerror = () => resolve(fallback);
    image.src = dataUrl;
  });
}

function normalizeAuthCode(value: string) {
  return value.trim().toLowerCase();
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error(`${file.name} 读取失败，请重新上传。`));
    };
    reader.onerror = () => reject(new Error(`${file.name} 读取失败，请重新上传。`));
    reader.readAsDataURL(file);
  });
}
