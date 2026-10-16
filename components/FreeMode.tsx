"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Download, FileText, Loader2, MessageSquare, Paperclip, Plus, SendHorizontal, Trash2, X } from "lucide-react";
import { prepareImageForVision } from "@/lib/image";
import { makeId } from "@/lib/utils";

const MAX_ATTACHMENTS = 20;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_FILES = ".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.pptx,.xlsx,image/*";

type FreeAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  extractedText?: string;
};

type FreeMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  attachments?: FreeAttachment[];
  generatedImages?: string[];
};

type FreeChatSession = {
  id: string;
  title: string;
  messages: FreeMessage[];
  createdAt: number;
  updatedAt: number;
};

const EMPTY_FREE_MESSAGES: FreeMessage[] = [];

export function FreeMode({
  authorized,
  apiKey,
  baseUrl,
  model,
  imageApiKey,
  imageApiBaseUrl,
  imageModel,
  onNeedAuth,
  onToast
}: {
  authorized: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  imageApiKey: string;
  imageApiBaseUrl: string;
  imageModel: string;
  onNeedAuth: () => void;
  onToast: (type: "success" | "error" | "info", message: string) => void;
}) {
  const [sessions, setSessions] = useState<FreeChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [historyReady, setHistoryReady] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<FreeAttachment[]>([]);
  const [isResponding, setIsResponding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const messages = activeSession?.messages || EMPTY_FREE_MESSAGES;

  useEffect(() => {
    let cancelled = false;
    void loadFreeChatSessions().then((stored) => {
      if (cancelled) return;
      const next = stored.length ? stored : [createFreeChatSession()];
      setSessions(next);
      setActiveSessionId(next[0].id);
      setHistoryReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!historyReady) return;
    const timer = window.setTimeout(() => { void saveFreeChatSessions(sessions); }, 250);
    return () => window.clearTimeout(timer);
  }, [sessions, historyReady]);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isResponding, attachments]);

  function setMessages(updater: FreeMessage[] | ((current: FreeMessage[]) => FreeMessage[])) {
    setSessions((current) => current.map((session) => {
      if (session.id !== activeSessionId) return session;
      const nextMessages = typeof updater === "function" ? updater(session.messages) : updater;
      return {
        ...session,
        messages: nextMessages,
        title: deriveSessionTitle(nextMessages, session.title),
        updatedAt: Date.now()
      };
    }));
  }

  function createChat() {
    if (isResponding) return onToast("info", "请等待当前回复完成后再新建对话。");
    const session = createFreeChatSession();
    setSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    setInput("");
    setAttachments([]);
  }

  function removeChat(sessionId: string) {
    if (isResponding && sessionId === activeSessionId) return onToast("info", "请等待当前回复完成后再删除对话。");
    setSessions((current) => {
      const remaining = current.filter((session) => session.id !== sessionId);
      const next = remaining.length ? remaining : [createFreeChatSession()];
      if (sessionId === activeSessionId) setActiveSessionId(next[0].id);
      return next;
    });
  }

  async function addFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    const available = MAX_ATTACHMENTS - attachments.length;
    if (available <= 0) return onToast("error", `每条消息最多上传 ${MAX_ATTACHMENTS} 个文件。`);
    const selected = Array.from(files).slice(0, available);
    if (selected.length < files.length) onToast("info", `已保留前 ${available} 个文件，单条消息最多 ${MAX_ATTACHMENTS} 个。`);

    try {
      const next = await Promise.all(selected.map(async (file) => {
        if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} 超过平台当前 25MB 单文件上限。`);
        if (file.type.startsWith("image/")) {
          if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} 超过图片 20MB 上限。`);
          const original = await readFileAsDataUrl(file);
          const dataUrl = await prepareImageForVision(original, 1800, 0.84, 1_200_000);
          return { id: makeId("free-file"), name: file.name, size: file.size, type: file.type, dataUrl };
        }
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/free-chat/file", { method: "POST", body: form });
        const payload = await readJson<{ content?: string; error?: string }>(response);
        if (!response.ok || !payload.content) throw new Error(payload.error || `${file.name} 无法读取。`);
        return {
          id: makeId("free-file"),
          name: file.name,
          size: file.size,
          type: file.type,
          extractedText: payload.content
        };
      }));
      setAttachments((current) => [...current, ...next].slice(0, MAX_ATTACHMENTS));
    } catch (error) {
      onToast("error", error instanceof Error ? error.message : "附件读取失败。");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function send() {
    if (isResponding || (!input.trim() && !attachments.length)) return;
    if (!authorized) return onNeedAuth();
    const userText = input.trim() || "请阅读并分析我上传的内容。";
    const sentAttachments = [...attachments];
    const documentText = sentAttachments
      .filter((item) => item.extractedText)
      .map((item) => `\n\n--- 附件：${item.name} ---\n${item.extractedText}`)
      .join("");
    const images = sentAttachments
      .filter((item) => item.dataUrl)
      .map((item) => ({ name: item.name, dataUrl: item.dataUrl! }));
    const conversation = [
      ...messages.map((message) => {
        const priorDocumentText = message.attachments
          ?.filter((item) => item.extractedText)
          .map((item) => `\n\n--- 附件：${item.name} ---\n${item.extractedText}`)
          .join("") || "";
        const priorImages = message.attachments
          ?.filter((item) => item.dataUrl)
          .map((item) => ({ name: item.name, dataUrl: item.dataUrl! })) || [];
        const generatedImages = message.generatedImages?.slice(-1).map((dataUrl) => ({
          name: "此前生成的图片.png",
          dataUrl
        })) || [];
        return {
          role: message.role,
          content: `${message.content}${priorDocumentText}`,
          ...((priorImages.length || generatedImages.length) ? { images: [...priorImages, ...generatedImages] } : {})
        };
      }),
      { role: "user" as const, content: `${userText}${documentText}`, images }
    ];
    const userMessage: FreeMessage = {
      id: makeId("free-user"),
      role: "user",
      content: userText,
      attachments: sentAttachments
    };
    const assistantId = makeId("free-assistant");
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setAttachments([]);
    setIsResponding(true);

    try {
      const hasPreviousGeneratedImage = messages.some((message) => Boolean(message.generatedImages?.length));
      if (isImageGenerationRequest(
        userText,
        sentAttachments.some((item) => Boolean(item.dataUrl)) || hasPreviousGeneratedImage
      )) {
        const image = await generateImage({
          prompt: userText,
          attachments: sentAttachments,
          conversation: messages,
          chatApiKey: apiKey,
          chatApiBaseUrl: baseUrl,
          brainModel: model,
          imageApiKey,
          imageApiBaseUrl,
          imageModel
        });
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            generatedImages: [image]
          }
        ]);
        return;
      }
      const response = await fetch("/api/free-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, baseUrl, model, conversation })
      });
      if (!response.ok || !response.body) {
        const payload = await readJson<{ error?: string }>(response);
        throw new Error(payload.error || "自由对话请求失败。");
      }
      let answer = "";
      let streamError = "";
      await readNdjson(response.body, (event) => {
        if (event.type === "delta" && event.content) {
          answer += event.content;
          setMessages((current) => upsertAssistant(current, assistantId, answer));
        } else if (event.type === "error") {
          streamError = event.error || "自由对话请求失败。";
        }
      });
      if (streamError) throw new Error(streamError);
      if (!answer.trim()) throw new Error("接口没有返回有效内容。");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "自由对话请求失败。";
      setMessages((current) => upsertAssistant(current, assistantId, `这次没有拿到回复。原因：${reason}`));
      onToast("error", reason);
    } finally {
      setIsResponding(false);
    }
  }

  return (
    <section
      className={`free-mode ${isDragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setIsDragging(false); void addFiles(event.dataTransfer.files); }}
    >
      <aside className="free-history-sidebar">
        <div className="free-history-header">
          <div><strong>自由对话</strong><span>{sessions.length} 个任务</span></div>
          <button type="button" onClick={createChat} aria-label="新建对话"><Plus /></button>
        </div>
        <div className="free-history-list">
          {sessions.map((session) => (
            <div className={`free-history-item ${session.id === activeSessionId ? "active" : ""}`} key={session.id}>
              <button
                type="button"
                className="free-history-select"
                onClick={() => {
                  if (isResponding && session.id !== activeSessionId) return onToast("info", "请等待当前回复完成后再切换对话。");
                  setActiveSessionId(session.id);
                  setInput("");
                  setAttachments([]);
                }}
              >
                <MessageSquare />
                <span><b>{session.title}</b><small>{formatSessionTime(session.updatedAt)}</small></span>
              </button>
              <button type="button" className="free-history-delete" onClick={() => removeChat(session.id)} aria-label={`删除 ${session.title}`}><Trash2 /></button>
            </div>
          ))}
        </div>
      </aside>

      <div className="free-chat-panel">
      <div className="free-chat-stream" ref={streamRef}>
        {!messages.length ? (
          <div className="free-chat-empty">
            <div className="free-chat-mark"><Bot /></div>
            <h1>有什么可以帮忙的？</h1>
            <p>输入问题，或上传图片与文件开始自由对话。</p>
          </div>
        ) : messages.map((message) => (
          <article key={message.id} className={`free-chat-message ${message.role}`}>
            <div className="free-chat-avatar">{message.role === "assistant" ? <Bot /> : "你"}</div>
            <div className="free-chat-bubble">
              {message.attachments?.length ? (
                <div className="free-message-files">
                  {message.attachments.map((file) => (
                    file.dataUrl ? (
                      <button
                        type="button"
                        className="free-message-image"
                        key={file.id}
                        onClick={() => setPreviewImage(file.dataUrl!)}
                        aria-label={`放大查看 ${file.name}`}
                      >
                        <img src={file.dataUrl} alt={file.name} />
                      </button>
                    ) : (
                      <span className="free-message-document" key={file.id}><FileText /><b>{file.name}</b></span>
                    )
                  ))}
                </div>
              ) : null}
              {message.content ? <div className="free-chat-text">{message.content}</div> : null}
              {message.generatedImages?.length ? (
                <div className="free-generated-images">
                  {message.generatedImages.map((image, index) => (
                    <div className="free-generated-image" key={`${message.id}-${index}`}>
                      <button type="button" className="free-generated-image-open" onClick={() => setPreviewImage(image)} aria-label="放大查看生成图片">
                        <img src={image} alt="AI 生成图片" />
                      </button>
                      <button type="button" className="free-generated-image-download" onClick={() => downloadImage(image)} aria-label="下载图片"><Download /></button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        ))}
        {isResponding && messages.at(-1)?.role === "user" ? <div className="free-chat-thinking"><Loader2 /> 正在思考</div> : null}
      </div>

      <div className="free-composer-wrap">
        {attachments.length ? (
          <div className="free-attachment-strip">
            {attachments.map((file) => (
              <div className="free-attachment" key={file.id}>
                {file.dataUrl ? <img src={file.dataUrl} alt="" /> : <FileText />}
                <span><b>{file.name}</b><small>{formatBytes(file.size)}</small></span>
                <button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))} aria-label={`移除 ${file.name}`}><X /></button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="free-composer">
          <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_FILES} hidden onChange={(event) => void addFiles(event.target.files)} />
          <button type="button" className="free-attach-button" onClick={() => fileInputRef.current?.click()} aria-label="添加照片和文件"><Paperclip /></button>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onPaste={(event) => {
              const pastedFiles = Array.from(event.clipboardData.files);
              if (pastedFiles.length) void addFiles(pastedFiles);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
            }}
            placeholder="询问任何问题"
            rows={1}
          />
          <button type="button" className="free-send-button" disabled={isResponding || (!input.trim() && !attachments.length)} onClick={() => void send()} aria-label="发送">
            {isResponding ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </button>
        </div>
        <p className="free-composer-note">每条消息最多 20 个附件；图片最大 20MB，其他文件当前最大 25MB。AI 可能会出错，请核查重要信息。</p>
      </div>
      {isDragging ? <div className="free-drop-overlay"><Paperclip /><strong>将文件拖到这里</strong><span>最多添加 20 个附件</span></div> : null}
      {previewImage ? (
        <div className="free-image-preview" role="dialog" aria-modal="true" onClick={() => setPreviewImage("")}>
          <button type="button" onClick={() => setPreviewImage("")} aria-label="关闭图片预览"><X /></button>
          <img src={previewImage} alt="生成图片预览" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
      </div>
    </section>
  );
}

function isImageGenerationRequest(value: string, hasImages: boolean) {
  const explicitVisualRequest = /(?:生成|画|绘制|制作|创建|做|设计|出|改|修改|重绘|变成|换成).{0,16}(?:图|图片|图像|海报|插画|照片|效果图|渲染图)|(?:图|图片|图像|海报|插画|照片|效果图|渲染图).{0,16}(?:生成|画|绘制|制作|创建|修改|重绘)/i.test(value);
  const productDesignRequest = /(?:请|帮我|给我|参考.{0,16})?(?:设计|创作|生成|做)(?:一|1)(?:个|款|台|套|辆|种|组).{1,60}/i.test(value);
  const imageFollowUp = hasImages && /(?:参考|借鉴|沿用|照着|基于|按照|设计|生成|出图|做|画|绘制|修改|调整|改成|换成|替换|去掉|删除|移除|增加|加入|添加|放入|放上|保留|重绘|优化|变成|让.{0,20}(?:更|变|呈现))/i.test(value);
  return explicitVisualRequest || productDesignRequest || imageFollowUp;
}

async function generateImage({
  prompt,
  attachments,
  conversation,
  chatApiKey,
  chatApiBaseUrl,
  brainModel,
  imageApiKey,
  imageApiBaseUrl,
  imageModel
}: {
  prompt: string;
  attachments: FreeAttachment[];
  conversation: FreeMessage[];
  chatApiKey: string;
  chatApiBaseUrl: string;
  brainModel: string;
  imageApiKey: string;
  imageApiBaseUrl: string;
  imageModel: string;
}) {
  const currentImages = attachments.filter((item) => item.dataUrl).map((item) => item.dataUrl!);
  const latestGeneratedImage = [...conversation]
    .reverse()
    .find((message) => message.generatedImages?.length)
    ?.generatedImages?.at(-1);
  const continuePreviousImage = !currentImages.length && Boolean(latestGeneratedImage) && isImageContinuationRequest(prompt);
  const images = currentImages.length
    ? currentImages
    : continuePreviousImage && latestGeneratedImage
      ? [latestGeneratedImage]
      : [];
  // A previously generated image is the current design itself, not merely a style reference.
  // Treating it as style-only causes the model to keep the category while replacing the form.
  const useImagesAsStyleReferences = currentImages.length > 0 && isStyleReferenceRequest(prompt);
  const conversationContext = buildImageConversationContext(conversation);
  const baseContextualRequest = conversationContext
    ? `请结合以下同一对话中的上下文理解本次生图要求。不要机械复述上下文，只执行用户最新要求。\n\n对话上下文：\n${conversationContext}\n\n用户最新要求：\n${prompt}`
    : prompt;
  const contextualRequest = continuePreviousImage
    ? [
        "这是对同一张既有设计图进行连续衍生或修改，不是重新设计另一款同类产品。",
        "必须把输入图片中的主体视为同一个产品：锁定其可识别的整体轮廓、比例、主体结构、部件布局、设计语言和核心造型特征。",
        "只执行用户本轮明确提出的变化；未被点名的外观、结构、CMF、视角、构图与背景尽量保持不变。禁止仅保留产品类型却替换成另一套造型。",
        baseContextualRequest
      ].join("\n")
    : baseContextualRequest;
  const innovationLevel = continuePreviousImage ? 12 : 65;
  let finalPrompt = contextualRequest;
  if (!continuePreviousImage) {
    try {
      const optimizeResponse = await fetch("/api/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: chatApiKey,
          baseUrl: chatApiBaseUrl,
          model: brainModel,
          productName: "",
          userPrompt: contextualRequest,
          innovationLevel,
          ...(useImagesAsStyleReferences
            ? { referenceImageBase64s: images.slice(0, 3) }
            : images[0]
              ? { productImageBase64: images[0], referenceImageBase64s: images.slice(1, 4) }
              : {})
        })
      });
      const optimized = await readJson<{ optimizedPrompt?: string }>(optimizeResponse);
      if (optimizeResponse.ok && optimized.optimizedPrompt?.trim()) finalPrompt = optimized.optimizedPrompt.trim();
    } catch {
      // The original request remains usable if prompt analysis is temporarily unavailable.
    }
  }
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageApiKey,
      imageApiBaseUrl,
      imageModel,
      productName: "",
      requirement: finalPrompt,
      useExactPrompt: true,
      count: 1,
      size: await resolveImageSize(prompt, images[0]),
      quality: "high",
      innovationLevel: continuePreviousImage ? 8 : 60,
      ...(useImagesAsStyleReferences
        ? { referenceImageBase64s: images.slice(0, 3) }
        : images[0]
          ? { imageBase64: images[0], referenceImageBase64s: images.slice(1, 4) }
          : {})
    })
  });
  const submission = await readJson<{ jobId?: string; error?: string }>(response);
  if (!response.ok || !submission.jobId) throw new Error(submission.error || "图片生成任务提交失败。");

  const startedAt = Date.now();
  while (Date.now() - startedAt < 10 * 60_000) {
    await delay(2200);
    const statusResponse = await fetch("/api/generate/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageApiKey, imageApiBaseUrl, jobId: submission.jobId })
    });
    const status = await readJson<{ status?: string; imageBase64?: string; error?: string }>(statusResponse);
    if (status.status === "done" && status.imageBase64) return status.imageBase64;
    if (status.status === "failed" || (!statusResponse.ok && statusResponse.status !== 202)) {
      throw new Error(status.error || "图片生成失败。");
    }
  }
  throw new Error("图片生成等待超时，请稍后重试。");
}

function isStyleReferenceRequest(value: string) {
  return /(?:参考|借鉴|沿用|照着|按照).{0,20}(?:风格|造型|设计语言|视觉语言|配色|材质|质感|形式)|(?:参考图|风格图|灵感图)|(?:这个|这种|该).{0,8}(?:风格|设计语言|视觉语言)/i.test(value);
}

function isImageContinuationRequest(value: string) {
  return /(?:刚才|上一张|上一个|此前|之前|这张|这个|它|继续|再来|再.{0,6}(?:生成|出|做|画)|保持|沿用|基于|在.{0,8}基础上|调整|修改|改成|换成|替换|去掉|删除|移除|增加|加入|添加|放入|放上|保留|优化|重绘|同样|相同|背景|人物|颜色|材质|视角)/i.test(value);
}

function buildImageConversationContext(messages: FreeMessage[]) {
  return messages
    .slice(-10)
    .map((message) => {
      const attachmentNames = message.attachments?.map((item) => item.name).join("、");
      const imageNote = message.generatedImages?.length ? "（本轮生成过图片）" : "";
      const fileNote = attachmentNames ? `（附件：${attachmentNames}）` : "";
      return `${message.role === "user" ? "用户" : "助手"}：${message.content}${fileNote}${imageNote}`;
    })
    .join("\n")
    .slice(-12_000);
}

async function resolveImageSize(prompt: string, referenceImage?: string) {
  const normalized = prompt.replace(/\s+/g, "");
  if (/(?:1[:：比]1|正方形|方图|方形)/i.test(normalized)) return "1024x1024";
  if (/(?:16[:：比]9|3[:：比]2|4[:：比]3|横版|横图|横屏|宽幅|全景|banner|横向)/i.test(normalized)) return "1536x1024";
  if (/(?:9[:：比]16|2[:：比]3|3[:：比]4|竖版|竖图|竖屏|手机壁纸|纵向)/i.test(normalized)) return "1024x1536";
  if (referenceImage) return readImageOrientation(referenceImage);
  if (/(?:海报|封面|杂志|人物全身|服装|包装)/i.test(normalized)) return "1024x1536";
  if (/(?:场景|空间|建筑|室内|景观|汽车|交通工具|产品展示|环境)/i.test(normalized)) return "1536x1024";
  return "auto";
}

function readImageOrientation(dataUrl: string) {
  return new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > image.naturalHeight * 1.08) resolve("1536x1024");
      else if (image.naturalHeight > image.naturalWidth * 1.08) resolve("1024x1536");
      else resolve("1024x1024");
    };
    image.onerror = () => resolve("auto");
    image.src = dataUrl;
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function downloadImage(dataUrl: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `perdesign-free-${Date.now()}.png`;
  link.click();
}

function upsertAssistant(messages: FreeMessage[], id: string, content: string) {
  const found = messages.some((message) => message.id === id);
  return found
    ? messages.map((message) => message.id === id ? { ...message, content } : message)
    : [...messages, { id, role: "assistant" as const, content }];
}

async function readNdjson(stream: ReadableStream<Uint8Array>, onEvent: (event: { type?: string; content?: string; error?: string }) => void) {
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
      try { onEvent(JSON.parse(line)); } catch { /* Ignore malformed keep-alive lines. */ }
    }
    if (done) break;
  }
}

async function readJson<T>(response: Response) {
  try { return await response.json() as T; } catch { return {} as T; }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`${file.name} 读取失败。`));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function createFreeChatSession(): FreeChatSession {
  const now = Date.now();
  return { id: makeId("free-chat"), title: "新对话", messages: [], createdAt: now, updatedAt: now };
}

function deriveSessionTitle(messages: FreeMessage[], fallback: string) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstUserMessage) return fallback;
  return firstUserMessage.replace(/\s+/g, " ").slice(0, 24) || fallback;
}

function formatSessionTime(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

const FREE_CHAT_DB = "perdesign-free-chat";
const FREE_CHAT_STORE = "history";

async function loadFreeChatSessions(): Promise<FreeChatSession[]> {
  try {
    const database = await openFreeChatDatabase();
    return await new Promise((resolve, reject) => {
      const request = database.transaction(FREE_CHAT_STORE, "readonly").objectStore(FREE_CHAT_STORE).get("sessions");
      request.onsuccess = () => resolve(Array.isArray(request.result?.value) ? request.result.value : []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

async function saveFreeChatSessions(sessions: FreeChatSession[]) {
  try {
    const database = await openFreeChatDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(FREE_CHAT_STORE, "readwrite");
      transaction.objectStore(FREE_CHAT_STORE).put({ id: "sessions", value: sessions });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // Conversation remains available in memory if browser storage is unavailable.
  }
}

function openFreeChatDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(FREE_CHAT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FREE_CHAT_STORE)) {
        request.result.createObjectStore(FREE_CHAT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
