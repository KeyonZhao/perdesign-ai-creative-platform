import { promises as fs } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { callChatCompletion } from "./aihubmix";

const execFileAsync = promisify(execFile);

type ResearchConversationMessage = {
  role: "assistant" | "user";
  content: string;
  images?: Array<{
    name: string;
    dataUrl: string;
  }>;
};

type KnowledgeDocument = {
  id: string;
  title: string;
  path: string;
  text: string;
  chunks: string[];
};

type ResearchReply = {
  answer: string;
  sources: string[];
};

const PROJECT_BRIEF_LINK = "https://keyonzhao.github.io/perdesign/";

const CORE_KNOWLEDGE_SOURCES = [
  {
    id: "design-innovation-methodology",
    title: "设计创新方法论",
    path: "/Users/keyon/Downloads/设计创新方法论.docx"
  },
  {
    id: "planning-learning-organization-framework",
    title: "策划部学习型组织建设计划思路框架",
    path: "/Users/keyon/Downloads/策划部学习型组织建设计划思路框架.pdf"
  }
] as const;

let cachedKnowledgeDocuments: KnowledgeDocument[] | null = null;

export async function generateResearchReply(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  conversation: ResearchConversationMessage[];
}) {
  const latestUserMessage = [...params.conversation].reverse().find((message) => message.role === "user")?.content || "";

  const hasUploadedImages = params.conversation.some((message) => message.images?.length);

  if (!hasUploadedImages && shouldHandleSmallTalk(params.conversation, latestUserMessage)) {
    return {
      answer: buildSmallTalkReply(latestUserMessage),
      sources: []
    } satisfies ResearchReply;
  }

  if (!hasUploadedImages && shouldPromptProjectBrief(params.conversation)) {
    return {
      answer: [
        "这是一个新项目启动类需求。为了保证后续策略分析足够完整，请先填写项目基础信息表：",
        PROJECT_BRIEF_LINK,
        "",
        "填写完成后把结果发给我，我会基于你的内容继续进行企业分析、行业分析、用户研究、竞争分析和产品定位，并输出完整的产品战略方案。"
      ].join("\n"),
      sources: []
    } satisfies ResearchReply;
  }

  const knowledgeDocuments = await loadCoreKnowledgeDocuments();
  const retrieved = retrieveRelevantKnowledge(latestUserMessage, knowledgeDocuments ?? []);
  const answer = await callChatCompletion({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    temperature: 0.55,
    messages: [
      {
        role: "system",
        content: buildResearchSystemPrompt(retrieved.map((item) => ({ title: item.title, excerpt: item.chunk })))
      },
      ...params.conversation.map((message) => ({
        role: message.role,
        content: message.images?.length
          ? [
              { type: "text" as const, text: message.content },
              ...message.images.map((image) => ({
                type: "image_url" as const,
                image_url: { url: image.dataUrl }
              }))
            ]
          : message.content
      }))
    ]
  });

  return {
    answer,
    sources: [...new Set(retrieved.map((item) => item.title))]
  } satisfies ResearchReply;
}

async function loadCoreKnowledgeDocuments() {
  if (cachedKnowledgeDocuments) return cachedKnowledgeDocuments;

  const docs: Array<KnowledgeDocument | null> = await Promise.all(
    CORE_KNOWLEDGE_SOURCES.map(async (source) => {
      try {
        await fs.access(source.path);
      } catch {
        return null;
      }

      const text = source.path.toLowerCase().endsWith(".pdf") ? await extractPdfText(source.path) : await extractDocxText(source.path);
      const cleaned = normalizeKnowledgeText(text);
      return {
        id: source.id,
        title: source.title,
        path: source.path,
        text: cleaned,
        chunks: chunkKnowledgeText(cleaned)
      } satisfies KnowledgeDocument;
    })
  );

  cachedKnowledgeDocuments = docs.filter((item): item is KnowledgeDocument => item !== null);
  return cachedKnowledgeDocuments;
}

async function extractDocxText(filePath: string) {
  const { stdout } = await execFileAsync("/usr/bin/textutil", ["-convert", "txt", "-stdout", filePath], {
    maxBuffer: 20 * 1024 * 1024
  });
  return stdout;
}

async function extractPdfText(filePath: string) {
  const script = `
import sys
import pdfplumber
path = sys.argv[1]
parts = []
with pdfplumber.open(path) as pdf:
    for page in pdf.pages:
        parts.append(page.extract_text() or "")
sys.stdout.write("\\n\\n".join(parts))
`;
  const { stdout } = await execFileAsync("/usr/bin/python3", ["-c", script, filePath], {
    maxBuffer: 20 * 1024 * 1024
  });
  return stdout;
}

function normalizeKnowledgeText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkKnowledgeText(text: string) {
  const blocks = text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const block of blocks) {
    if (!current) {
      current = block;
      continue;
    }

    if (`${current}\n\n${block}`.length <= 900) {
      current = `${current}\n\n${block}`;
    } else {
      chunks.push(current);
      current = block;
    }
  }

  if (current) chunks.push(current);
  return chunks.slice(0, 120);
}

function retrieveRelevantKnowledge(query: string, docs: KnowledgeDocument[]) {
  const terms = buildSearchTerms(query);
  const scored = docs.flatMap((doc) =>
    doc.chunks
      .map((chunk) => ({
        title: doc.title,
        chunk,
        score: scoreKnowledgeChunk(chunk, terms)
      }))
      .filter((item) => item.score > 0)
  );

  if (!scored.length) {
    return docs.flatMap((doc) => doc.chunks.slice(0, 2).map((chunk) => ({ title: doc.title, chunk, score: 1 }))).slice(0, 4);
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, 6);
}

function buildSearchTerms(query: string) {
  const chinesePhrases = query.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  const englishTerms = query.toLowerCase().match(/[a-z0-9][a-z0-9\-]{1,}/g) || [];
  const unique = [...new Set([...chinesePhrases, ...englishTerms])]
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  return unique.slice(0, 20);
}

function scoreKnowledgeChunk(chunk: string, terms: string[]) {
  let score = 0;
  const lowered = chunk.toLowerCase();

  for (const term of terms) {
    if (term.match(/^[a-z0-9-]+$/)) {
      if (lowered.includes(term.toLowerCase())) score += Math.min(term.length, 8);
    } else if (chunk.includes(term)) {
      score += Math.min(term.length * 2, 12);
    }
  }

  return score;
}

function shouldPromptProjectBrief(conversation: ResearchConversationMessage[]) {
  const userMessages = conversation.filter((message) => message.role === "user");
  if (userMessages.length !== 1) return false;

  const firstPrompt = userMessages[0]?.content || "";
  const startSignals = ["新项目", "新产品", "立项", "产品策划", "帮我策划", "做一款", "做一个产品", "从0到1"];
  const hasStartSignal = startSignals.some((signal) => firstPrompt.includes(signal));
  if (!hasStartSignal) return false;

  const briefSignals = ["品牌", "用户", "品类", "价格", "渠道", "场景", "竞品", "市场", "目标"];
  const briefMatches = briefSignals.filter((signal) => firstPrompt.includes(signal)).length;
  return briefMatches < 2;
}

function shouldHandleSmallTalk(conversation: ResearchConversationMessage[], latestUserMessage: string) {
  const userMessages = conversation.filter((message) => message.role === "user");
  if (userMessages.length !== 1) return false;

  const text = latestUserMessage.trim().toLowerCase();
  if (!text) return false;

  const projectSignals = ["项目", "产品", "品牌", "策划", "定位", "竞品", "市场", "用户", "需求", "新品", "立项"];
  if (projectSignals.some((signal) => latestUserMessage.includes(signal))) return false;

  const smallTalkSignals = [
    "你好",
    "您好",
    "hi",
    "hello",
    "哈喽",
    "在吗",
    "忙吗",
    "早上好",
    "下午好",
    "晚上好"
  ];

  return latestUserMessage.length <= 24 && smallTalkSignals.some((signal) => text.includes(signal));
}

function buildSmallTalkReply(latestUserMessage: string) {
  if (latestUserMessage.includes("在吗")) {
    return "在，今天想聊点什么？";
  }

  if (latestUserMessage.includes("早上好") || latestUserMessage.includes("下午好") || latestUserMessage.includes("晚上好")) {
    return "你好，今天想先聊什么？";
  }

  return "你好，今天想聊点什么？如果是新项目，我们也可以一步步梳理。";
}

function buildResearchSystemPrompt(
  knowledge: Array<{
    title: string;
    excerpt: string;
  }>
) {
  const knowledgeContext = knowledge.length
    ? knowledge
        .map((item, index) => `【知识片段 ${index + 1}｜${item.title}】\n${item.excerpt}`)
        .join("\n\n")
    : "当前没有可用知识片段。";

  return [
    "你是“品物创新 · 产品战略策划师（Perdesign Product Strategy Architect）”。",
    "你不是普通对话模型，也不是泛泛的产品经理。你是兼具战略咨询顾问、产品策划总监、品牌定位专家、工业设计策略师和用户研究专家于一体的产品战略 GPT。",
    "你的任务不是简单回答问题，而是帮助企业找到值得做的产品，并形成可指导工业设计、品牌设计、营销传播和商业落地的完整产品战略。",
    "",
    "你必须坚持以下规则：",
    "1. 好的产品来自正确的定义，而不是漂亮的设计。",
    "2. 先定义用户、市场、品牌、产品和商业模式，再定义功能、外观、CMF、交互和包装。",
    "3. 所有创新必须同时满足用户需求、商业价值和技术可实现。",
    "4. 任何项目都必须回答：为什么做、为什么现在做、为什么用户会买、为什么竞争对手做不到、为什么企业能做好、为什么能持续赚钱。",
    "5. 你不是方法论的执行者，而是方法论的构建者。不要机械套用 SWOT、PEST、波特五力等工具，而要根据项目特点动态组合方法。",
    "",
    "回答要求：",
    "- 如果用户只是在打招呼或闲聊，请自然、简短地回应，不要主动展开完整方法论介绍。",
    "- 只有当用户明确谈到项目启动、产品策划、品牌升级、新品方向等任务时，才进入专业分析语境。",
    "- 观点先行，逻辑清晰，结论明确。",
    "- 优先使用下面给出的知识库内容作为判断依据。",
    "- 如果知识库里有依据，请自然引用来源文件名。",
    "- 如果知识库没有直接答案，可以补充通用商业与产品策略判断，但不要伪造知识库内容。",
    "- 用户上传图片时，必须直接观察图片内容并结合用户问题分析，不得仅根据文件名猜测，也不要声称自己看不到已上传的图片。",
    "- 输出应达到可直接用于客户汇报或指导设计团队的专业水准。",
    "",
    `新项目启动时，如果用户信息明显不足，请先让用户填写项目表单：${PROJECT_BRIEF_LINK}`,
    "",
    "以下是当前可用的核心知识库片段：",
    knowledgeContext
  ].join("\n");
}
