import { promises as fs } from "fs";
import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import { callChatCompletion, streamChatCompletion } from "./aihubmix";
import { collectResearchWebEvidence, type ResearchWebImage, type ResearchWebSource } from "./research-web";

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
  sources: Array<string | ResearchWebSource>;
  images: ResearchWebImage[];
};

const PROJECT_BRIEF_LINK = "https://keyonzhao.github.io/perdesign/";

const PROJECT_DISCOVERY_PROTOCOL = [
  "项目访谈协议（正式策划开始前必须执行）：",
  "1. 当用户提出新项目、产品策划、品牌升级或产品机会研究时，先扫描整段对话和已上传资料，在内部建立“已获得 / 用户明确没有 / 尚缺失”的信息清单。",
  "2. 采用自然对话逐步补充信息，每次回复只能提出一个主要问题。禁止一次列出整份问卷，也不要要求用户集中回答多个问题。",
  "3. 用户已经主动提供的信息，无论表达方式是否与问卷一致，都视为已获得，不得重复询问。",
  "4. 用户回答“不知道、没有、不确定、暂时不清楚、跳过”等，记录为“用户暂无信息”并继续下一项，不得反复追问。",
  "5. 回应用户当前答案时可以用一句话简短承接，然后只问下一个最有价值的缺失问题。问题应结合已知项目内容改写，避免机械照读问卷。",
  "6. 如果某项答案含糊但足以继续，先记录并继续；只有会实质影响项目类型、核心用户或战略目标时，才追加一个澄清问题。",
  "7. 优先获取必需信息，再获取可显著提高研究质量的选填信息。资料上传只在确有帮助时自然邀请，不作为开始策划的硬门槛。",
  "8. 不再默认把项目表单链接甩给用户。只有用户明确希望一次性填写表单时，才提供链接。",
  "9. 当所有可获得信息已经收集完成，或用户明确要求停止访谈并开始研究时，停止提问，直接按照《产品机会分析执行标准 v3.1》的 STEP 0–6 开始策划案撰写。",
  "",
  "内部信息清单（按已知内容灵活跳过）：",
  "A. 项目基础：产品名称或类型；项目阶段（新产品、升级、系列延展、迭代、新品牌、外观升级等）；主要销售市场、渠道与使用场景。",
  "B. 背景目标：现在启动项目的原因；当前最遗憾或最需改善之处；市场、用户、销售或售后的常见反馈；最终最希望带来的变化。",
  "C. 用户信息：核心购买者、使用者与决策者；用户最在意的价值；用户对当前产品最不满意之处。",
  "D. 品牌信息：公司或品牌名称；使命、愿景、价值观；希望形成的第一品牌感受；企业核心优势；客户最终选择本品牌的原因；未来1–3年发展方向。",
  "E. 竞品参考：主要竞争品牌或产品；喜欢的产品、品牌或设计方向及原因；明确不希望接近的方向。",
  "F. 项目资料：产品图片、产品手册、品牌资料、技术资料、竞品资料和用户反馈等现有材料。",
  "",
  "完成条件：",
  "- 产品、项目阶段、市场/场景、启动原因、目标、核心用户和品牌主体属于高优先级信息，应尽可能获得或得到“暂无信息”的明确答复。",
  "- 其余信息尽可能获取；若用户没有，不阻塞策划启动。",
  "- 开始撰写前，在内部检查是否仍有会改变项目类型或核心方向的关键缺口；没有关键缺口后立即开始，不要为了问完而问完。"
].join("\n");

const CORE_KNOWLEDGE_SOURCES = [
  {
    id: "product-opportunity-execution-standard",
    title: "产品机会分析执行标准 v3.1",
    path: path.join(process.cwd(), "knowledge/product-opportunity-execution-standard.md")
  },
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
  onDelta?: (delta: string) => void;
}) {
  const latestUserMessage = [...params.conversation].reverse().find((message) => message.role === "user")?.content || "";

  const hasUploadedImages = params.conversation.some((message) => message.images?.length);

  if (!hasUploadedImages && shouldHandleSmallTalk(params.conversation, latestUserMessage)) {
    const answer = buildSmallTalkReply(latestUserMessage);
    params.onDelta?.(answer);
    return {
      answer,
      sources: [],
      images: []
    } satisfies ResearchReply;
  }

  const knowledgeDocuments = await loadCoreKnowledgeDocuments();
  const retrieved = retrieveRelevantKnowledge(latestUserMessage, knowledgeDocuments ?? []);
  // Every substantive research answer is grounded with current web evidence.
  // Small talk has already returned above, so this does not waste a lookup on greetings.
  const webEvidence = await collectResearchWebEvidence(
    buildWebResearchQuery(params.conversation, latestUserMessage)
  );
  const executionStandardLoaded = knowledgeDocuments.some(
    (document) => document.id === "product-opportunity-execution-standard"
  );
  const completionParams = {
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    temperature: 0.55,
    maxCompletionTokens: 16000,
    messages: [
      {
        role: "system" as const,
        content: buildResearchSystemPrompt(
          retrieved.map((item) => ({ title: item.title, excerpt: item.chunk })),
          webEvidence.sources,
          webEvidence.images.length
        )
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
  };
  let answer: string;
  if (params.onDelta) {
    const firstResult = await streamChatCompletion(completionParams, params.onDelta);
    answer = firstResult.content;
    let finishReason = firstResult.finishReason;
    let continuationCount = 0;
    while (finishReason === "length" && continuationCount < 4) {
      continuationCount += 1;
      const continuationResult = await streamChatCompletion(
        {
          ...completionParams,
          messages: [
            ...completionParams.messages,
            { role: "assistant" as const, content: answer },
            {
              role: "user" as const,
              content: [
                "上一段回复因为单次输出长度上限被截断。",
                "请从刚才停止的位置直接继续，补齐尚未完成的策划案。",
                "不要重复已经输出的标题、段落或内容，不要添加‘续写’之类的说明。",
                "完成全部剩余章节后正常收尾。"
              ].join("\n")
            }
          ]
        },
        params.onDelta
      );
      answer += continuationResult.content;
      finishReason = continuationResult.finishReason;
    }
  } else {
    answer = await callChatCompletion(completionParams);
  }

  return {
    answer,
    sources: [
      ...new Set([
        ...(executionStandardLoaded ? ["产品机会分析执行标准 v3.1"] : []),
        ...retrieved.map((item) => item.title),
        ...webEvidence.sources
      ])
    ],
    images: webEvidence.images
  } satisfies ResearchReply;
}

function buildWebResearchQuery(conversation: ResearchConversationMessage[], latestUserMessage: string) {
  const projectContext = conversation
    .filter((message) => message.role === "user")
    .slice(-8)
    .map((message) => message.content)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const text = projectContext || latestUserMessage;
  const terms: string[] = [];
  const brandPatterns = [
    /(?:为|给)([\u4e00-\u9fa5A-Za-z0-9-]{2,12})(?:设计|做|开发|策划)/g,
    /(?:品牌|公司|客户)(?:名称)?(?:是|为|叫)?[：:\s]*([\u4e00-\u9fa5A-Za-z0-9-]{2,16})/g
  ];
  for (const pattern of brandPatterns) {
    for (const match of text.matchAll(pattern)) terms.push(match[1]);
  }
  const productTerms = [
    "空调", "冰箱", "洗衣机", "电视", "显示屏", "屏幕", "家电", "汽车", "座椅", "头盔", "耳机",
    "音箱", "手机", "电脑", "机器人", "咖啡机", "净水器", "热水器", "厨电", "家具", "灯具", "医疗设备",
    "工业设备", "消费电子", "智能家居", "穿戴设备", "包装", "品牌", "PLC", "可编程逻辑控制器"
  ];
  productTerms.forEach((term) => { if (text.includes(term)) terms.push(term); });
  for (const match of text.matchAll(/\b[A-Z][A-Z0-9-]{1,14}\b/g)) terms.push(match[0]);
  for (const match of text.matchAll(/[「『“"]([^」』”"]{2,24})[」』”"]/g)) terms.push(match[1]);
  if (!terms.length) {
    const fallback = text
      .replace(/(?:请|帮我|我要|我想|希望|需要|给我|寻找|提供|生成|输出|撰写|策划|研究|相关|一些|一下|图片|链接|来源|数据)/g, " ")
      .replace(/[^\u4e00-\u9fa5A-Za-z0-9-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (fallback) terms.push(fallback.slice(0, 40));
  }
  return [...new Set(terms)].join(" ").slice(0, 100) || latestUserMessage.slice(0, 100);
}

export async function reviseResearchDocument(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  originalContent: string;
  originalOutline: string;
  modifiedOutline: string;
  changes: string[];
}) {
  return callChatCompletion({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    temperature: 0.25,
    messages: [
      {
        role: "system",
        content: [
          "你是品物创新的资深策划案编辑。",
          "用户已经在思维导图中修改了策划案结构。你的任务是对原策划案做增量编辑，而不是重写一份新报告。",
          "必须逐项对照结构差异：新增节点只在对应位置补写必要内容；删除节点只删除对应内容；改名节点调整对应标题和必要表述；移动节点只调整其归属与衔接。",
          "所有未被差异清单影响的标题、观点、数据、来源、措辞和段落应尽可能逐字保留。",
          "若新增节点缺少事实依据，只能基于原文已有信息做谨慎扩展，并标明需要补充的证据，不得虚构数据、品牌事实或网址。",
          "保持原文的 Markdown 层级、专业语气和报告完整性。",
          "只输出修改后的完整策划案正文，不要输出修改说明、前言、对比表或代码围栏。"
        ].join("\n")
      },
      {
        role: "user",
        content: [
          "【原策划案】",
          params.originalContent,
          "",
          "【原始导图结构】",
          params.originalOutline,
          "",
          "【修改后导图结构】",
          params.modifiedOutline,
          "",
          "【结构差异清单】",
          ...params.changes.map((change, index) => `${index + 1}. ${change}`)
        ].join("\n")
      }
    ]
  });
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

      const extension = path.extname(source.path).toLowerCase();
      const text = extension === ".pdf"
        ? await extractPdfText(source.path)
        : extension === ".md" || extension === ".txt"
          ? await fs.readFile(source.path, "utf8")
          : await extractDocxText(source.path);
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
  }>,
  webSources: ResearchWebSource[] = [],
  webImageCount = 0
) {
  const knowledgeContext = knowledge.length
    ? knowledge
        .map((item, index) => `【知识片段 ${index + 1}｜${item.title}】\n${item.excerpt}`)
        .join("\n\n")
    : "当前没有可用知识片段。";
  const webContext = webSources.length
    ? webSources.map((source, index) => [
        `【网络证据 W${index + 1}｜${source.title}】`,
        `网址：${source.url}`,
        `摘要：${source.snippet || "搜索结果未提供摘要，请仅使用标题能够支持的有限判断。"}`
      ].join("\n")).join("\n\n")
    : "当前未检索到可验证的网络证据。";

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
    "核心执行范本（正式项目最高优先级）：",
    "- 正式项目统一遵循 STEP 0–6：项目类型识别 → 项目认知 → 行业机会洞察 → 用户价值与行为研究 → 竞争机会分析 → 产品机会结论 → 品牌机会融合与产品语言转译。",
    "- 所有分析都必须服务于“推导产品机会成立的合理性”，不得停留在描述行业或罗列信息。",
    "- 内部遵循“洞察分析 → 变量提炼 → 产品机会推导 → 最终结论”，每一步都要检查后续结论所需信息是否已由前文形成。",
    "- 内部区分事实型、趋势型和策略型判断：事实不得创造；趋势必须由多个信号交叉验证；策略必须说明依据与不确定性。",
    "- 关键证据不足时，应明确说明结论暂不成立并指出待补资料，不能强行生成确定结论。",
    "- 每个关键数据必须形成“要证明的观点 → 数据、机构名称及可验证 URL → 对产品机会或行动的结论”的证据链。",
    "- 最终报告隐藏内部变量表、承接检查表和机械模板，不得出现【变量名】占位符，只呈现自然、专业、可汇报的观点、分析和结论。",
    "- C端重点分析情绪价值、场景体验、品牌认同与传播；B端重点分析效率、安全、操作确定性、系统协同、运维成本与专业可信；B/C项目同时兼顾两者。",
    "- B端用户研究不得惯性地只研究采购者，必须判断被行业忽视但可能决定差异化机会的核心角色。",
    "- 竞争分析不仅研究直接竞品，还要研究抬高用户判断标准的跨行业认知型竞品。",
    "",
    PROJECT_DISCOVERY_PROTOCOL,
    "",
    "回答要求：",
    "- 如果用户只是在打招呼或闲聊，请自然、简短地回应，不要主动展开完整方法论介绍。",
    "- 只有当用户明确谈到项目启动、产品策划、品牌升级、新品方向等任务时，才进入专业分析语境。",
    "- 观点先行，逻辑清晰，结论明确。",
    "- 优先使用下面给出的知识库内容作为判断依据。",
    "- 如果知识库里有依据，请自然引用来源文件名。",
    "- 如果知识库没有直接答案，可以补充通用商业与产品策略判断，但不要伪造知识库内容。",
    "- 网络证据只能用于其标题与摘要能够直接支持的判断；不得把搜索摘要扩写成未经证实的事实。",
    "- 使用网络证据中的数据、趋势或事实时，在对应句末标注 [W1]、[W2] 等来源编号；同一结论可交叉引用多个来源。",
    "- 对所有有实际内容的问题，都应自然使用可用的网络资料：链接紧跟其支持的文字，不要等用户再次索要来源。",
    "- 不得编造网址、机构、数据或引用编号。没有网络证据支撑的策略判断应明确写成判断或建议，不要伪装成事实。",
    webImageCount > 0
      ? `- 平台已经成功取得 ${webImageCount} 张相关网络资料图片，并会自动插入到引用其来源的对应段落附近。这是已经发生的程序事实。你不得说“不能抓取网页图片”“无法展示图片”“只能提供链接”或任何相反表述。不要把图片说成由你生成。`
      : "- 本次检索暂未返回可展示的网络图片。不得讨论或判断平台能力，尤其禁止说‘不能从网上抓取图片’‘无法展示图片’‘只能提供链接’。如用户明确索要图片，只能客观表述‘本次检索暂未返回可展示附图’，并继续正常回答其他内容。",
    "- 用户上传图片时，必须直接观察图片内容并结合用户问题分析，不得仅根据文件名猜测，也不要声称自己看不到已上传的图片。",
    "- 输出应达到可直接用于客户汇报或指导设计团队的专业水准。",
    "- 输出完整策划案时使用清晰稳定的 Markdown 层级：一个总标题、一级章节、二级分析模块、三级观点；每个模块用项目符号明确列出关键发现、证据结论与策略行动。",
    "- 标题必须表达结论性含义，避免只写“分析”“研究”等空泛标题；项目符号应包含足够语义，使其单独进入思维导图后仍能被理解。",
    "- 保持“项目认知 → 行业与用户洞察 → 竞争机会 → 产品机会 → 品牌与设计转译”的逻辑路径，不要把不同层级的事实、判断和策略混在同一列表。",
    "",
    `仅当用户明确希望一次性填写表单时，提供项目表单：${PROJECT_BRIEF_LINK}`,
    "",
    "以下是当前可用的核心知识库片段：",
    knowledgeContext,
    "",
    "以下是本次实时检索到的网络证据：",
    webContext
  ].join("\n");
}
