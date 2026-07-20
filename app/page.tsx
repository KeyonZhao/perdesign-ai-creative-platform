"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Eye,
  EyeOff,
  Mic,
  MessageSquareText,
  Palette,
  Plus,
  PlugZap,
  SendHorizontal,
  Sparkles
} from "lucide-react";
import { ControlPanel } from "@/components/ControlPanel";
import { Gallery } from "@/components/Gallery";
import { Toast } from "@/components/Toast";
import type {
  GenerationBatch,
  GenerationResult,
  GenerationStatus,
  ToastMessage,
  UploadedImage
} from "@/lib/types";
import { makeId } from "@/lib/utils";

const storageKeys = {
  activeSection: "product-workstation-active-section",
  imageApiKey: "product-workstation-image-api-key",
  imageApiBaseUrl: "product-workstation-image-api-base-url",
  chatApiKey: "product-workstation-chat-api-key",
  chatApiBaseUrl: "product-workstation-chat-api-base-url",
  requirement: "product-workstation-requirement",
  count: "product-workstation-count",
  size: "product-workstation-size",
  quality: "product-workstation-quality",
  referenceWeight: "product-workstation-reference-weight"
};

const BRAIN_MODEL = "gpt-5.5";

type WorkspaceSection = "research" | "design" | "api";
type ResearchFile = { name: string; size: number };
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
  const [imageApiKey, setImageApiKey] = usePersistedState(storageKeys.imageApiKey, "");
  const [imageApiBaseUrl, setImageApiBaseUrl] = usePersistedState(
    storageKeys.imageApiBaseUrl,
    "https://img-cn.65535.space/v1"
  );
  const [chatApiKey, setChatApiKey] = usePersistedState(storageKeys.chatApiKey, "");
  const [chatApiBaseUrl, setChatApiBaseUrl] = usePersistedState(
    storageKeys.chatApiBaseUrl,
    "https://api-cn.65535.space/v1"
  );
  const imageModel = "gpt-image-2";
  const [requirement, setRequirement] = usePersistedState(storageKeys.requirement, "");
  const [count, setCount] = usePersistedNumber(storageKeys.count, 4);
  const [size, setSize] = usePersistedState(storageKeys.size, "1024x1024");
  const [quality, setQuality] = usePersistedState(storageKeys.quality, "high");
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [referenceImage, setReferenceImage] = useState<UploadedImage | null>(null);
  const [referenceWeight, setReferenceWeight] = usePersistedNumber(storageKeys.referenceWeight, 50);
  const [showImageApiKey, setShowImageApiKey] = useState(false);
  const [showChatApiKey, setShowChatApiKey] = useState(false);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [generationBatches, setGenerationBatches] = useState<GenerationBatch[]>([]);
  const [activeGenerationBatchId, setActiveGenerationBatchId] = useState<string | null>(null);
  const [pendingGenerationCount, setPendingGenerationCount] = useState(0);
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
  const hasChatConfig = Boolean(chatApiKey.trim() && chatApiBaseUrl.trim());
  const canGenerate = Boolean(imageApiKey.trim() && imageApiBaseUrl.trim());

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.abort();
    };
  }, []);

  function pushToast(type: ToastMessage["type"], message: string) {
    const toast = { id: makeId("toast"), type, message };
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 4200);
  }

  function saveApiConfig() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKeys.imageApiKey, imageApiKey);
    window.localStorage.setItem(storageKeys.imageApiBaseUrl, imageApiBaseUrl);
    window.localStorage.setItem(storageKeys.chatApiKey, chatApiKey);
    window.localStorage.setItem(storageKeys.chatApiBaseUrl, chatApiBaseUrl);
    pushToast("success", "API 配置已保存，下次刷新会自动记住。");
  }

  async function optimizePrompt() {
    if (!chatApiKey || !chatApiBaseUrl) return pushToast("error", "请先填写对话请求地址和对话 API Key。");
    if (!requirement.trim()) return pushToast("error", "请先输入变款要求。");

    setStatus("optimizing");
    try {
      const response = await fetch("/api/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: chatApiKey, baseUrl: chatApiBaseUrl, model: BRAIN_MODEL, userPrompt: requirement })
      });
      const data = (await response.json()) as { optimizedPrompt?: string; error?: string };
      if (!response.ok || !data.optimizedPrompt) throw new Error(data.error || "提示词优化失败。");
      setRequirement(data.optimizedPrompt);
      setStatus("idle");
      pushToast("success", "提示词已优化并回填。");
    } catch (error) {
      setStatus("error");
      pushToast("error", error instanceof Error ? error.message : "提示词优化失败。");
    }
  }

  async function generate() {
    if (!imageApiKey || !imageApiBaseUrl) return pushToast("error", "请先填写生图请求地址和生图 API Key。");
    if (!uploadedImage && !referenceImage && !requirement.trim()) {
      return pushToast("error", "请至少输入提示词，或上传产品图 / 参考图。");
    }

    await runGeneration({
      imageBase64: uploadedImage?.dataUrl,
      referenceImageBase64: referenceImage?.dataUrl,
      referenceWeight: referenceImage ? referenceWeight : 0,
      requirement,
      count
    });
  }

  async function runGeneration(params: {
    imageBase64?: string;
    referenceImageBase64?: string;
    referenceWeight: number;
    requirement: string;
    count: number;
    sizeOverride?: string;
  }) {
    const batchId = makeId("generation-batch");
    setActiveGenerationBatchId(batchId);
    setPendingGenerationCount(params.count);
    setStatus("generating");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageApiKey,
          imageApiBaseUrl,
          chatApiKey,
          chatApiBaseUrl,
          brainModel: BRAIN_MODEL,
          imageModel,
          imageBase64: params.imageBase64,
          referenceImageBase64: params.referenceImageBase64,
          referenceWeight: params.referenceWeight,
          requirement: params.requirement,
          count: params.count,
          size: params.sizeOverride || size,
          quality
        })
      });

      const data = (await response.json()) as { results?: GenerationResult[]; error?: string };
      if (!response.ok || !data.results) throw new Error(data.error || "生成失败，请稍后重试。");
      const nextResults = data.results;

      setGenerationBatches((current) => {
        const existingCount = current.reduce((sum, batch) => sum + batch.results.length, 0);
        const numberedResults = nextResults.map((result, index) => {
          const sequence = existingCount + index + 1;
          const label = `Concept ${String(sequence).padStart(2, "0")}`;
          return {
            ...result,
            title: label
          };
        });

        return [...current, { id: batchId, results: numberedResults }];
      });
      setPendingGenerationCount(0);
      setStatus("success");
      const failed = nextResults.filter((result) => result.error).length;
      pushToast(failed ? "info" : "success", failed ? `已完成，${failed} 个方案生成失败。` : "全部方案生成完成。");
    } catch (error) {
      setPendingGenerationCount(0);
      setStatus("error");
      setActiveGenerationBatchId(null);
      pushToast("error", error instanceof Error ? error.message : "生成失败，请检查配置后重试。");
    }
  }

  async function generateMultiView(result: GenerationResult) {
    if (!imageApiKey || !imageApiBaseUrl) return pushToast("error", "请先填写生图请求地址和生图 API Key。");
    if (!result.imageBase64) return pushToast("error", "当前图片不可用于多视图生成。");

    await runGeneration({
      imageBase64: result.imageBase64,
      referenceImageBase64: undefined,
      referenceWeight: 0,
      requirement:
        "生成这个产品的多视角图片，画面最右侧是产品的斜侧透视图，左侧包含产品正视图、左视图、后视图、顶视图。",
      count: 1,
      sizeOverride: "1536x1024"
    });
  }

  async function generateScene(result: GenerationResult) {
    if (!imageApiKey || !imageApiBaseUrl) return pushToast("error", "请先填写生图请求地址和生图 API Key。");
    if (!result.imageBase64) return pushToast("error", "当前图片不可用于场景图生成。");

    await runGeneration({
      imageBase64: result.imageBase64,
      referenceImageBase64: undefined,
      referenceWeight: 0,
      requirement: "分析图片中的产品品类，生成该品类经常出现在的场景下的产品场景图",
      count: 1
    });
  }

  async function sendResearchMessage() {
    if (!researchInput.trim() && researchFiles.length === 0) {
      pushToast("error", "请先输入研究任务，或上传资料清单。");
      return;
    }
    if (!chatApiKey || !chatApiBaseUrl) {
      pushToast("error", "请先在 API 页填写对话请求地址和对话 API Key。");
      return;
    }

    const files = researchFiles.length ? [...researchFiles] : undefined;
    const userContent = researchInput.trim() || "请基于我上传的资料继续展开研究。";
    const nextConversation = [
      ...researchMessages.map((message) => ({ role: message.role, content: message.content })),
      { role: "user" as const, content: userContent }
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
          apiKey: chatApiKey,
          baseUrl: chatApiBaseUrl,
          model: BRAIN_MODEL,
          conversation: nextConversation
        })
      });

      const data = (await response.json()) as { answer?: string; sources?: string[]; error?: string };
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

  function addResearchFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = Array.from(files).map((file) => ({ name: file.name, size: file.size }));
    setResearchFiles((current) => [...current, ...next]);
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
            <WorkspaceNav activeSection={activeSection as WorkspaceSection} onChange={(section) => setActiveSection(section)} />

            {activeSection === "design" ? (
              <div className="workspace-sidebar-detail">
                <ControlPanel
                  uploadedImage={uploadedImage}
                  setUploadedImage={setUploadedImage}
                  referenceImage={referenceImage}
                  setReferenceImage={setReferenceImage}
                  referenceWeight={referenceWeight}
                  setReferenceWeight={setReferenceWeight}
                  requirement={requirement}
                  setRequirement={setRequirement}
                  count={count}
                  setCount={setCount}
                  size={size}
                  setSize={setSize}
                  quality={quality}
                  setQuality={setQuality}
                  status={status}
                  hasChatConfig={hasChatConfig}
                  canGenerate={canGenerate}
                  onOptimize={optimizePrompt}
                  onGenerate={generate}
                  onError={(message) => pushToast("error", message)}
                />
              </div>
            ) : null}
          </aside>

          <div className="workspace-main">
            {activeSection === "design" ? (
              <Gallery
                status={status}
                batches={generationBatches}
                activeBatchId={activeGenerationBatchId}
                count={pendingGenerationCount || count}
                isGeneratingVariant={status === "generating"}
                onGenerateMultiView={generateMultiView}
                onGenerateScene={generateScene}
                onError={(message) => pushToast("error", message)}
                onSuccess={(message) => pushToast("success", message)}
              />
            ) : null}

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

            {activeSection === "api" ? (
              <ApiSection
                imageApiBaseUrl={imageApiBaseUrl}
                setImageApiBaseUrl={setImageApiBaseUrl}
                imageApiKey={imageApiKey}
                setImageApiKey={setImageApiKey}
                chatApiBaseUrl={chatApiBaseUrl}
                setChatApiBaseUrl={setChatApiBaseUrl}
                chatApiKey={chatApiKey}
                setChatApiKey={setChatApiKey}
                showImageApiKey={showImageApiKey}
                setShowImageApiKey={setShowImageApiKey}
                showChatApiKey={showChatApiKey}
                setShowChatApiKey={setShowChatApiKey}
                onSave={saveApiConfig}
              />
            ) : null}
          </div>
        </div>
      </main>
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
        </div>
      </div>

      <div className="workspace-nav-bottom">
        <button
          type="button"
          className={`workspace-nav-item ${activeSection === "api" ? "active" : ""}`}
          onClick={() => onChange("api")}
        >
          <PlugZap className="h-4 w-4" />
          <span>API</span>
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
  addFiles: (files: FileList | null) => void;
  messages: ResearchMessage[];
  isListening: boolean;
  isResponding: boolean;
  onSend: () => void;
  onToggleVoiceInput: () => void;
  onRemoveFile: (index: number) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <section className="section-surface">
      <div className="section-header">
        <div>
          <h1 className="section-title">策划研究</h1>
          <p className="section-subtitle">围绕品牌、用户、竞品与场景做资料整理和研究拆解。</p>
        </div>
      </div>

      <div className="research-shell">
        <div className="research-stream">
          {messages.map((message) => (
            <article key={message.id} className={`research-message ${message.role}`}>
              <div className="research-role">
                {message.role === "assistant" ? <Bot className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                <span>{message.role === "assistant" ? "Research AI" : "你"}</span>
              </div>
              <div className="research-bubble">{message.content}</div>
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
                  {message.files.map((file) => (
                    <span key={`${message.id}-${file.name}`} className="research-chip">
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
            addFiles(event.dataTransfer.files);
          }}
        >
          {files.length ? (
            <div className="research-chip-row research-chip-stack">
              {files.map((file, index) => (
                <button key={`${file.name}-${index}`} type="button" className="research-chip dismissible" onClick={() => onRemoveFile(index)}>
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
            multiple
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </div>
    </section>
  );
}

function ApiSection(props: {
  imageApiBaseUrl: string;
  setImageApiBaseUrl: (value: string) => void;
  imageApiKey: string;
  setImageApiKey: (value: string) => void;
  chatApiBaseUrl: string;
  setChatApiBaseUrl: (value: string) => void;
  chatApiKey: string;
  setChatApiKey: (value: string) => void;
  showImageApiKey: boolean;
  setShowImageApiKey: (value: boolean) => void;
  showChatApiKey: boolean;
  setShowChatApiKey: (value: boolean) => void;
  onSave: () => void;
}) {
  return (
    <section className="section-surface">
      <div className="section-header">
        <div>
          <h1 className="section-title">API</h1>
          <p className="section-subtitle">这里集中管理所有接口配置与模型选项，避免散落在设计页面顶部。</p>
        </div>
      </div>

      <div className="api-grid">
        <div className="content-card-soft p-6">
          <div className="space-y-5">
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-200">生图请求地址</span>
              <input
                className="field h-11 px-3 text-sm"
                value={props.imageApiBaseUrl}
                onChange={(event) => props.setImageApiBaseUrl(event.target.value)}
                placeholder="https://img-cn.65535.space/v1"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-200">生图 API Key</span>
              <div className="relative">
                <input
                  className="field h-11 px-3 pr-11 text-sm"
                  type={props.showImageApiKey ? "text" : "password"}
                  value={props.imageApiKey}
                  onChange={(event) => props.setImageApiKey(event.target.value)}
                  placeholder="image2 分组的 Key"
                />
                <button
                  type="button"
                  className="api-eye-button"
                  onClick={() => props.setShowImageApiKey(!props.showImageApiKey)}
                >
                  {props.showImageApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
          </div>
        </div>

        <div className="content-card-soft p-6">
          <div className="space-y-5">
            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-200">对话请求地址</span>
              <input
                className="field h-11 px-3 text-sm"
                value={props.chatApiBaseUrl}
                onChange={(event) => props.setChatApiBaseUrl(event.target.value)}
                placeholder="https://api-cn.65535.space/v1"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-200">对话 API Key</span>
              <div className="relative">
                <input
                  className="field h-11 px-3 pr-11 text-sm"
                  type={props.showChatApiKey ? "text" : "password"}
                  value={props.chatApiKey}
                  onChange={(event) => props.setChatApiKey(event.target.value)}
                  placeholder="OpenAI Std / Pro 分组的 Key"
                />
                <button
                  type="button"
                  className="api-eye-button"
                  onClick={() => props.setShowChatApiKey(!props.showChatApiKey)}
                >
                  {props.showChatApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
          </div>
        </div>

        <div className="api-actions">
          <button type="button" className="btn-primary api-save-button" onClick={props.onSave}>
            保存配置
          </button>
        </div>
      </div>
    </section>
  );
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
