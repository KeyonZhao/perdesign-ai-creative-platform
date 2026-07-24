"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  Grid3X3,
  Mic,
  MessageSquareText,
  Palette,
  Plus,
  PlugZap,
  SendHorizontal,
  Sparkles,
  X
} from "lucide-react";
import { ControlPanel } from "@/components/ControlPanel";
import { Gallery } from "@/components/Gallery";
import { Toast } from "@/components/Toast";
import { VentEditor } from "@/components/VentEditor";
import {
  clearLocalGenerationBatches,
  getLocalGalleryStats,
  loadLocalGenerationBatches,
  replaceLocalGenerationBatches,
  requestPersistentLocalStorage,
  saveLocalGenerationBatch,
  type LocalGalleryStats
} from "@/lib/local-gallery";
import { exportPerdesignProject, importPerdesignProject } from "@/lib/project-backup";
import { convertImageDataUrlToPng, prepareImageForVision } from "@/lib/image";
import { buildCreativeDivergencePrompt } from "@/lib/creative-divergence";
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
  UploadedImage
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
const DEFAULT_IMAGE_API_BASE_URL = "https://img-cn.65535.space/v1";
const DEFAULT_CHAT_API_BASE_URL = "https://api-cn.65535.space/v1";
const SCENE_GENERATION_PROMPT = "分析图片中的产品品类，生成该品类经常出现在的场景下的产品场景图";
const PRESET_CHAT_API_KEY = "server-managed";
const PRESET_IMAGE_API_KEY = "server-managed";
const MAX_IMAGE_GENERATION_CONCURRENCY = 20;

type WorkspaceSection = "research" | "design" | "vent" | "api";
type ResearchFile = {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
};
type PendingAuthAction =
  | { type: "generate" }
  | { type: "research" }
  | { type: "multi-view"; result: GenerationResult }
  | { type: "scene"; result: GenerationResult }
  | { type: "divergence"; result: GenerationResult; productName?: string; request: CreativeDivergenceRequest }
  | { type: "image-prompt"; result: GenerationResult; instruction: string; referenceImages?: GenerationSourceImage[] }
  | { type: "local-edit"; result: GenerationResult; maskImageBase64: string; instruction: string; guideImageBase64?: string }
  | { type: "custom-generate"; request: CustomCanvasGenerationRequest }
  | null;
type ResearchMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  files?: ResearchFile[];
  sources?: string[];
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
  const [researchMessages, setResearchMessages] = useState<ResearchMessage[]>([
    {
      id: makeId("research-message"),
      role: "assistant",
      content:
        "这里是策划研究工作区。我会以“品物创新 · 产品战略策划师”的角色和你对话，并优先参考核心知识库来完成企业分析、用户洞察、竞争分析与产品定位。"
    }
  ]);
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
            title: `Concept ${String(sequence).padStart(2, "0")}`
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
      case "divergence":
        void generateDivergenceCore(action.result, action.productName, action.request, forceAuthorized);
        break;
      case "image-prompt":
        void generateFromImagePromptCore(action.result, action.instruction, action.referenceImages, forceAuthorized);
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
            sketchImageBase64: params.sketchImage?.dataUrl,
            imageBase64: params.productImage?.dataUrl,
            maskImageBase64: params.maskImageBase64,
            localEditGuideImageBase64: params.localEditGuideImageBase64,
            referenceImageBase64: params.referenceImage?.dataUrl,
            referenceImageBase64s: params.referenceImages?.map((image) => image.dataUrl),
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

  async function generateDivergence(
    result: GenerationResult,
    sourceProductName: string | undefined,
    request: CreativeDivergenceRequest
  ) {
    const selectedStyleCount = new Set(request.styleIds || []).size;
    if (selectedStyleCount > 4) {
      return pushToast("error", "最多选择 4 种创意风格。");
    }
    if (Boolean(selectedStyleCount) === Boolean(request.referenceImage)) {
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
    const { imageApiKey: resolvedImageApiKey, imageApiBaseUrl: resolvedImageApiBaseUrl, unlocked } = getResolvedConfig(forceAuthorized);
    if (!unlocked) return;
    if (!resolvedImageApiKey || !resolvedImageApiBaseUrl) {
      return pushToast("error", "当前认证信息不可用，请重新输入认证码。");
    }
    if (!result.imageBase64) return pushToast("error", "当前图片不可用于创意发散。");

    const resolvedProductName = sourceProductName?.trim() || productName.trim();
    let exactPrompt: string;
    let divergenceStyles: string[];
    try {
      const preparedDivergence = buildCreativeDivergencePrompt({
        productName: resolvedProductName,
        request
      });
      exactPrompt = preparedDivergence.prompt;
      divergenceStyles = preparedDivergence.quadrantStyleLabels;
    } catch (error) {
      return pushToast("error", error instanceof Error ? error.message : "创意发散参数无效。");
    }

    await runGeneration({
      productName: resolvedProductName,
      productImage: { name: `${result.title}.png`, dataUrl: result.imageBase64 },
      referenceImages: request.referenceImage ? [request.referenceImage] : undefined,
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

    const pngSourceImage = await convertImageDataUrlToPng(result.imageBase64);
    const sourceSize = await getImageSizeOption(pngSourceImage, size);
    await runGeneration({
      productImage: { name: `${result.title}.png`, dataUrl: pngSourceImage },
      maskImageBase64,
      localEditGuideImageBase64: guideImageBase64,
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
    const conversationImages = files?.map((file) => ({
      name: file.name,
      dataUrl: file.dataUrl
    }));
    const nextConversation = [
      ...researchMessages.map((message) => ({ role: message.role, content: message.content })),
      {
        role: "user" as const,
        content: userContent,
        images: conversationImages
      }
    ];

    setResearchMessages((current) => [...current, { id: makeId("research-user"), role: "user", content: userContent, files }]);
    setResearchInput("");
    setResearchFiles([]);
    setIsResearchResponding(true);

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

      const data = await readApiResponse<{ answer?: string; sources?: string[]; error?: string }>(response);
      if (!response.ok || !data.answer) throw new Error(data.error || "策划研究回复失败。");
      const answer = data.answer;
      const sources = data.sources || [];

      setResearchMessages((current) => [
        ...current,
        {
          id: makeId("research-assistant"),
          role: "assistant",
          content: answer,
          sources
        }
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "策划研究回复失败。";
      pushToast("error", reason);
      setResearchMessages((current) => [
        ...current,
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

  async function addResearchFiles(files: FileList | null) {
    if (!files?.length) return;
    const availableSlots = Math.max(0, 4 - researchFiles.length);
    if (!availableSlots) {
      pushToast("error", "每次最多上传 4 张图片。");
      return;
    }

    const selectedFiles = Array.from(files);
    const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/")).slice(0, availableSlots);
    if (imageFiles.length !== selectedFiles.length) {
      pushToast("error", "策划研究目前仅支持上传图片，每次最多 4 张。");
    }
    if (!imageFiles.length) return;

    try {
      const next = await Promise.all(
        imageFiles.map(async (file) => {
          if (file.size > 20 * 1024 * 1024) {
            throw new Error(`${file.name} 超过 20MB，请压缩后重新上传。`);
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
      pushToast("error", error instanceof Error ? error.message : "图片读取失败，请更换图片后重试。");
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
                    isGeneratingVariant={status === "generating"}
                    onGenerateMultiView={generateMultiView}
                    onGenerateScene={generateScene}
                    onGenerateDivergence={generateDivergence}
                    onGenerateFromPrompt={generateFromImagePrompt}
                    onGenerateDesignDescription={generateDesignDescription}
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
              />
            ) : null}

            {activeSection === "vent" ? <VentEditor /> : null}

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
        <span className="app-version" aria-label="当前版本 v1.0.2">v1.0.2</span>
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
  onRemoveFile
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
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

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

  return (
    <section className="section-surface">
      <div className="research-shell">
        <div className="research-stream">
          {messages.map((message) => (
            <article key={message.id} className={`research-message ${message.role}`}>
              <div className="research-role">
                {message.role === "assistant" ? <Bot className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                <span>{message.role === "assistant" ? "Research AI" : "你"}</span>
              </div>
              <div className="research-bubble-wrap">
                <div
                  className={`research-bubble ${message.role === "assistant" ? "has-copy" : ""}`}
                  onContextMenu={(event) => selectMessageText(event.currentTarget)}
                >
                  {message.content}
                </div>
                {message.role === "assistant" ? (
                  <button
                    type="button"
                    className={`research-copy-button ${copiedMessageId === message.id ? "copied" : ""}`}
                    onClick={() => void copyMessage(message)}
                    title={copiedMessageId === message.id ? "已复制" : "复制全部文本"}
                    aria-label={copiedMessageId === message.id ? "已复制" : "复制全部文本"}
                  >
                    {copiedMessageId === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                ) : null}
              </div>
              {message.sources?.length ? (
                <div className="research-chip-row research-source-row">
                  {message.sources.map((source) => (
                    <span key={`${message.id}-${source}`} className="research-chip source">
                      {source}
                    </span>
                  ))}
                </div>
              ) : null}
              {message.files?.length ? (
                <div className="research-chip-row">
                  {message.files.map((file, index) => (
                    <span key={`${message.id}-${file.name}-${index}`} className="research-chip research-file-chip">
                      <img src={file.dataUrl} alt="" className="research-file-thumb" />
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
                  <img src={file.dataUrl} alt="" className="research-file-thumb" />
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
            accept="image/*"
            multiple
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </div>
    </section>
  );
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
      throw new Error("上传图片数据过大，服务器未能接收。平台已尝试压缩图片，请刷新后重试。");
    }
    if (!response.ok) {
      throw new Error(`服务请求失败（${response.status}），请稍后重试。`);
    }
    throw new Error("服务返回格式异常，请稍后重试。");
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
