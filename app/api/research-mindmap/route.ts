import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { streamChatCompletion } from "@/lib/aihubmix";
import { resolveProviderConfig } from "@/lib/provider";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  content: z.string().min(280).max(160_000)
});

type RawNode = { title?: unknown; label?: unknown; children?: unknown };
type MindMapNode = { id: string; label: string; detail?: string; tag?: string; children: MindMapNode[] };

let mindMapRequestQueue: Promise<void> = Promise.resolve();
const MIND_MAP_ANALYSIS_VERSION = "argument-v2";
const mindMapResultCache = new Map<string, { tree: MindMapNode; nodeCount: number; quality: ReturnType<typeof validateStrategicMap>; analysisMode: "ai"; analysisVersion: string }>();

export async function POST(request: Request) {
  const queuedRequest = mindMapRequestQueue.then(() => handleMindMapRequest(request));
  mindMapRequestQueue = queuedRequest.then(() => undefined, () => undefined);
  return queuedRequest;
}

async function handleMindMapRequest(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const provider = resolveProviderConfig(payload, "chat");
    const cacheKey = createHash("sha256").update(`${MIND_MAP_ANALYSIS_VERSION}\n${payload.model}\n${payload.content}`).digest("hex");
    const cached = mindMapResultCache.get(cacheKey);
    if (cached) return NextResponse.json({ ...cached, cached: true });
    const mapSource = await buildMindMapSource(payload.content, {
      ...provider,
      model: payload.model,
      signal: request.signal
    });
    const tree = buildStrategicLedgerMap(mapSource, payload.content);
    const nodeCount = countNodes(tree);
    const quality = validateStrategicMap(tree);
    if (!quality.passed) {
      throw new Error("导图分阶段重构结果的信息层级不足，请重新生成。");
    }
    const result = { tree, nodeCount, quality, analysisMode: "ai" as const, analysisVersion: MIND_MAP_ANALYSIS_VERSION };
    mindMapResultCache.set(cacheKey, result);
    if (mindMapResultCache.size > 12) mindMapResultCache.delete(mindMapResultCache.keys().next().value!);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "策划案导图重构失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const STAGED_MAP_DEFINITIONS = [
  { title: "01｜需求整理：重新定义研究任务", pattern: /需求|目标|背景|诉求|约束|任务|客户|项目/i },
  { title: "02｜问题研究：识别必须解决的矛盾", pattern: /问题|矛盾|痛点|不足|失败|挑战|风险|原因/i },
  { title: "03｜人群分析：明确谁会使用与购买", pattern: /用户|人群|角色|家庭|购买|消费者|老人|儿童|孩子/i },
  { title: "04｜场景研究：定位价值发生的情境", pattern: /场景|触发|使用|空间|客厅|卧室|睡眠|门店|夜间/i },
  { title: "05｜竞品分析：判断市场空白与参照", pattern: /竞品|竞争|市场|行业|品牌|参照|趋势|卡萨帝|COLMO/i },
  { title: "06｜机会收敛：筛选可成立的产品机会", pattern: /机会|筛选|推导|差异|排除|价值|成立|优先|窗口/i },
  { title: "07｜产品定义与策略：形成落地闭环", pattern: /产品|功能|形态|交互|商业|执行|路线|方案|策略|设计|风险|成本/i }
];

type LedgerEntry = {
  stage: string;
  dimension: string;
  type: string;
  object: string;
  judgment: string;
  support: string;
  direction: string;
  priority: string;
};

type DocumentBlock = {
  headings: string[];
  text: string;
  order: number;
  detail?: string;
  tag?: string;
  priority?: string;
};

type ThemeBlueprint = { label: string; pattern: RegExp };
type StageBlueprint = { title: string; pattern: RegExp; themes: ThemeBlueprint[]; output: string };

const STRATEGIC_STAGE_BLUEPRINTS: StageBlueprint[] = [
  {
    title: "01｜需求整理：客户为什么提出这个需求",
    pattern: /需求|客户|目标|背景|差异|高端|趋势|约束|项目认知|诉求/,
    themes: [
      { label: "显性需求：客户明确要求的产品形式", pattern: /显性|客户|必须|要求|目标|大屏|屏幕/ },
      { label: "隐性诉求：形式背后的差异化与商业目标", pattern: /隐性|差异|高端|溢价|传播|品牌|识别|话题/ },
      { label: "需求约束：创新不能反噬长期体验", pattern: /约束|成本|融入|打扰|长期|结构|研发|风险|不能|边界/ }
    ],
    output: "阶段输出：把形式任务改写为“证明创新存在的正当性”"
  },
  {
    title: "02｜问题研究：真正需要解决的矛盾",
    pattern: /问题|矛盾|痛点|误区|失败|不足|不可见|难感知|复杂|界面|触点/,
    themes: [
      { label: "品类矛盾：重要体验难以被直接理解", pattern: /品类|空气|不可见|不舒服|原因|温度|湿度|洁净|气流|噪音/ },
      { label: "价值矛盾：高端能力“有但不显”", pattern: /高端|价值|感知|验证|新风|净化|除菌|柔风|节能|AI/ },
      { label: "界面矛盾：现有触点各有能力缺口", pattern: /界面|触点|遥控|App|语音|灯显|面板|操作|复杂/ },
      { label: "失败假设：看似创新但无法长期成立", pattern: /误区|失败|娱乐|遥控器|装饰|噱头|看电视|炫酷|廉价/ }
    ],
    output: "阶段输出：锁定必须被解决、且值得付费的核心问题"
  },
  {
    title: "03｜人群分析：谁会使用、购买并受影响",
    pattern: /用户|人群|家庭|购买|消费者|老人|儿童|孩子|宠物|高端家庭|任务/,
    themes: [
      { label: "基础画像：品质家庭的购买标准已经升级", pattern: /画像|装修|品质|付费|品牌|高端|设计感|生活品质/ },
      { label: "家庭角色：不同成员带来不同关注", pattern: /家庭|孩子|儿童|老人|宠物|成员|家人/ },
      { label: "用户任务：从判断状态到确认结果", pattern: /任务|判断|理解|决策|确认|回报|知道|安心/ },
      { label: "使用张力：既期待智能又拒绝复杂与打扰", pattern: /张力|复杂|黑箱|打扰|焦虑|科技感|主动智能|学习/ }
    ],
    output: "阶段输出：明确用户真正购买的价值与理由"
  },
  {
    title: "04｜场景研究：价值在什么情境中成立",
    pattern: /场景|情境|触发|时机|地点|行为|旅程|任务|现有方案|验证|成功信号|客厅|卧室|睡眠|门店|办公|户外/,
    themes: [
      { label: "场景触发：问题在特定时间、地点与条件下发生", pattern: /触发|时间|地点|条件|时机|发生|客厅|卧室|门店|办公|户外/ },
      { label: "角色与行为：用户当前如何完成任务", pattern: /角色|行为|任务|使用|操作|流程|旅程|家庭|儿童|老人|员工|客户/ },
      { label: "场景问题：现有做法为什么不足", pattern: /问题|不足|失败|障碍|麻烦|痛点|焦虑|不便|无法|难以/ },
      { label: "验证价值：机会应在场景中产生可观察改变", pattern: /验证|价值|改善|减少|提升|完成|结果|反馈|可见|可感知/ },
      { label: "成功信号：用结果判断方案是否真正成立", pattern: /成功|信号|指标|标准|确认|采用|持续|高频|转化|满意/ }
    ],
    output: "阶段输出：用高频情境验证价值是否真实发生"
  },
  {
    title: "05｜竞品分析：市场标准与空白在哪里",
    pattern: /竞品|竞争|市场|行业|海尔|美的|格力|卡萨帝|COLMO|汽车|冰箱|中控|品牌位置/,
    themes: [
      { label: "直接竞品：能力趋同但价值表达仍弱", pattern: /直接竞品|海尔|美的|格力|卡萨帝|COLMO|空调行业/ },
      { label: "跨行业参照：其他屏幕正在抬高用户标准", pattern: /汽车|冰箱|中控|音箱|跨行业|Family Hub|座舱/ },
      { label: "可借鉴：学习信息组织与系统掌控感", pattern: /可借鉴|状态中枢|信息管理|组织|反馈|分工/ },
      { label: "不可照搬：必须守住品类相关性", pattern: /不可照搬|不能泛化|不是|边界|复杂座舱|家庭平板/ },
      { label: "品牌机会：把既有认知转化为进入理由", pattern: /海信|品牌|显示科技|位置|认知资产|产品语言/ }
    ],
    output: "阶段输出：形成市场空白、借鉴边界与品牌机会判断"
  },
  {
    title: "06｜机会收敛：从证据推导产品机会",
    pattern: /机会|筛选|推导|排除|收敛|标准|差异化窗口|核心主张|产品机会/,
    themes: [
      { label: "筛选标准：同时满足用户、品类、品牌与商业", pattern: /筛选|标准|用户价值|品类相关|品牌合理|商业持续/ },
      { label: "核心推导链：每个结论都能回溯前置证据", pattern: /推导|不可见|难懂|不可知|空间不同|显示资产|因此|导向/ },
      { label: "排除方向：主动舍弃无法长期成立的方案", pattern: /排除|不做|娱乐|万能中控|炫技|装饰|噱头/ },
      { label: "产品机会：把能力转化为可理解、可持续的价值", pattern: /机会|可视化|生活语言|行动建议|长期记录|管理系统/ }
    ],
    output: "阶段输出：得到经过筛选、能够自然导向产品定义的机会"
  },
  {
    title: "07｜产品定义与创新策略：形成完整落地闭环",
    pattern: /产品|定义|功能|形态|交互|方案|概念|商业|风险|执行|组合|配置|门店|体验|主张|设计/,
    themes: [
      { label: "为什么机会成立：行业变化与品类特征共同支撑", pattern: /为什么.*成立|行业角色|屏幕化|不可见|战略作用|差异化窗口|用户教育/ },
      { label: "用户真正购买什么：把洞察转化为体验承诺", pattern: /用户真正|购买|目标家庭|核心矛盾|体验承诺|安心|确定感/ },
      { label: "产品如何定义：明确角色、主张与边界", pattern: /产品定义|角色升级|核心主张|屏幕存在|边界|不做|定义为/ },
      { label: "价值如何体验：建立功能、内容与交互体系", pattern: /核心功能|可视化|管家建议|气流|健康日历|全屋|内容架构|交互分工|视觉语言/ },
      { label: "如何落到产品组合：区分场景、形态与配置", pattern: /柜机|挂机|产品组合|概念|AirView|SleepView|AirLens|配置|旗舰|高配|基础/ },
      { label: "如何证明价值：用关键场景完成体验验证", pattern: /场景证明|会客|儿童活动|夜间睡眠|梅雨|高温|验证价值/ },
      { label: "如何形成商业闭环：品牌、门店与收益协同", pattern: /商业|门店|收益|品牌|溢价|演示|系列化|销售|资格/ },
      { label: "风险与对策：让长期信任成为成立条件", pattern: /风险|对策|打扰|不准|成本|信任|成立条件|长期愿用|持续可信/ }
    ],
    output: "阶段输出：形成产品角色、功能体验、产品组合、商业与风险闭环"
  }
];

const STAGE_OUTPUTS = [
  "阶段输出：把显性需求重定义为可验证的研究任务",
  "阶段输出：锁定产品必须解决的核心矛盾",
  "阶段输出：明确用户价值、购买理由与关键角色",
  "阶段输出：确定能够验证价值的高频使用情境",
  "阶段输出：形成可借鉴、不可照搬与市场空白判断",
  "阶段输出：筛选出同时满足用户、品牌与商业的机会",
  "阶段输出：形成产品角色、功能体验、商业与风险闭环"
];

function buildStrategicOutlineMap(content: string): MindMapNode {
  return buildStrategicMapFromBlocks(parseStrategicDocument(content), content);
}

function buildStrategicLedgerMap(mapSource: string, originalContent: string): MindMapNode {
  const ledgerBlocks: DocumentBlock[] = [];
  let order = 0;
  for (const entry of parseLedgerEntries(mapSource)) {
    const baseHeadings = [entry.stage, entry.dimension, entry.object].filter(Boolean);
    ledgerBlocks.push({
      headings: baseHeadings,
      text: entry.judgment,
      detail: [entry.support && `依据：${entry.support}`, entry.direction && `导向：${entry.direction}`].filter(Boolean).join("\n"),
      tag: entry.dimension || entry.type,
      priority: entry.priority,
      order: order++
    });
  }
  // The AI ledger is the reasoning authority. Source blocks only restore headings or examples
  // that may have been compressed during ledger deduplication.
  const sourceBlocks = parseStrategicDocument(originalContent).map((block) => ({
    ...block,
    order: order + block.order
  }));
  return buildStrategicMapFromBlocks([...ledgerBlocks, ...sourceBlocks], originalContent);
}

function buildStrategicMapFromBlocks(blocks: DocumentBlock[], content: string): MindMapNode {
  let sequence = 0;
  const makeId = () => `mindmap-strategic-${sequence++}`;
  const stages = STRATEGIC_STAGE_BLUEPRINTS.map((stage) => {
    const stageBlocks = blocks.filter((block) => stage.pattern.test(blockContext(block)));
    const assigned = new Map<number, { themeIndex: number; score: number }>();
    for (const block of stageBlocks) {
      stage.themes.forEach((theme, themeIndex) => {
        const score = semanticMatchScore(block, theme.pattern);
        const current = assigned.get(block.order);
        if (score > 0 && (!current || score > current.score)) assigned.set(block.order, { themeIndex, score });
      });
    }

    const themeNodes: MindMapNode[] = stage.themes.flatMap((theme, themeIndex) => {
      const matches = stageBlocks
        .filter((block) => assigned.get(block.order)?.themeIndex === themeIndex)
        .sort((a, b) => strategicBlockScore(b) - strategicBlockScore(a) || a.order - b.order)
        .filter((block, index, list) => list.findIndex((candidate) => makeJudgmentLabel(candidate.text) === makeJudgmentLabel(block.text)) === index)
        .slice(0, 6)
        .sort((a, b) => a.order - b.order);
      if (!matches.length) return [];
      const grouped = groupStrategicBlocks(matches);
      const children: MindMapNode[] = [];
      for (const [heading, items] of grouped.slice(0, 4)) {
        const leaves = items.slice(0, 4).map((item) => ({
          id: makeId(),
          label: makeJudgmentLabel(item.text),
          ...(item.detail ? { detail: item.detail } : {}),
          ...(item.tag ? { tag: item.tag } : {}),
          children: buildBlockEvidenceChildren(item, makeId)
        }));
        if (!leaves.length) continue;
        if (grouped.length === 1 || items.length === 1 || isRedundantHeading(heading, theme.label)) children.push(...leaves);
        else children.push({ id: makeId(), label: makeJudgmentLabel(heading), children: leaves });
      }
      return [{ id: makeId(), label: theme.label, tag: "分析维度", children }];
    });
    themeNodes.push({ id: makeId(), label: buildStageOutputLabel(stage, stageBlocks), tag: "阶段输出", children: [] });
    return { id: makeId(), label: stage.title, detail: stage.output, tag: "论证阶段", children: themeNodes };
  });

  return {
    id: "root",
    label: inferStrategicRootTitle(content),
    children: stages
  };
}

function validateStrategicMap(tree: MindMapNode) {
  const nodeCount = countNodes(tree);
  const depth = treeDepth(tree);
  const stageOutputs = tree.children.filter((stage) =>
    stage.children.some((child) => child.label.startsWith("阶段输出："))
  ).length;
  const emptyLabels = countEmptyLabels(tree);
  const deepNodeCount = countNodesAtOrBelowDepth(tree, 4);
  // 节点数量只用于诊断，不作为质量门槛。短但原子化的论证不应被迫拆分或补水。
  const passed = tree.children.length === 7 && depth >= 3 && stageOutputs === 7 && emptyLabels === 0;
  return {
    passed,
    score: passed ? 90 : 0,
    nodeCount,
    depth,
    deepNodeCount,
    stageOutputs,
    emptyLabels
  };
}

function countNodesAtOrBelowDepth(node: MindMapNode, targetDepth: number, depth = 0): number {
  return (depth >= targetDepth ? 1 : 0) + node.children.reduce(
    (sum, child) => sum + countNodesAtOrBelowDepth(child, targetDepth, depth + 1),
    0
  );
}

function treeDepth(node: MindMapNode): number {
  return 1 + Math.max(0, ...node.children.map(treeDepth));
}

function countEmptyLabels(node: MindMapNode): number {
  return (node.label.trim() ? 0 : 1) + node.children.reduce((sum, child) => sum + countEmptyLabels(child), 0);
}

function parseStrategicDocument(content: string): DocumentBlock[] {
  const headings: string[] = [];
  const blocks: DocumentBlock[] = [];
  let order = 0;
  for (const rawLine of content.split("\n")) {
    const raw = rawLine.trim();
    if (!raw) continue;
    const headingMatch = raw.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingTitle = cleanRootLabel(headingMatch[2]);
      if (level >= 2 && headingTitle.length >= 7) {
        blocks.push({ headings: headings.filter(Boolean), text: headingTitle, order: order++ });
      }
      headings.length = level - 1;
      headings[level - 1] = headingTitle;
      continue;
    }
    if (/^(?:---+|参考[:：]?\s*https?:\/\/|https?:\/\/)/i.test(raw)) continue;
    const cleaned = cleanNodeText(raw.replace(/^[-*•>\s]+/, "").replace(/^\d+[.)、]\s*/, ""));
    if (cleaned.length < 7) continue;
    const sentences = cleaned.length > 105
      ? cleaned.split(/(?<=[。；！？])\s*/).filter((part) => part.length >= 7).slice(0, 3)
      : [cleaned];
    for (const sentence of sentences) {
      blocks.push({ headings: headings.filter(Boolean), text: sentence, order: order++ });
    }
  }
  return blocks;
}

function blockContext(block: DocumentBlock) {
  return `${block.headings.join(" ")} ${block.text}`;
}

function semanticMatchScore(block: DocumentBlock, pattern: RegExp) {
  let score = 0;
  if (pattern.test(block.text)) score += 4;
  const nearest = block.headings.at(-1) || "";
  if (pattern.test(nearest)) score += 3;
  if (pattern.test(block.headings.join(" "))) score += 1;
  return score;
}

function strategicBlockScore(block: DocumentBlock) {
  let score = 0;
  if (/核心|最高|P0/i.test(block.priority || "")) score += 9;
  else if (/重要|高|P1/i.test(block.priority || "")) score += 6;
  if (/结论|核心|关键|建议|机会|必须|不应|不能|应该|定义|价值|风险|对策/.test(block.text)) score += 5;
  if (block.text.length >= 12 && block.text.length <= 72) score += 3;
  if (/例如|参考|页面|网站|https/i.test(block.text)) score -= 3;
  return score;
}

function buildBlockEvidenceChildren(block: DocumentBlock, makeId: () => string): MindMapNode[] {
  if (!block.detail) return [];
  const parentLabel = makeJudgmentLabel(block.text);
  const evidence = block.detail
    .split("\n")
    .filter((line) => /^依据[:：]/.test(line.trim()))
    .flatMap((line) => line.replace(/^依据[:：]\s*/, "").split(/[；。](?=\S)/))
    .map((line) => makeJudgmentLabel(cleanNodeText(line)))
    .filter((line) => isVisibleEvidence(line, parentLabel))
    .slice(0, 3)
    .map((line) => ({ id: makeId(), label: line, tag: "支持信息", children: [] }));
  const direction = block.detail
    .split("\n")
    .find((line) => /^导向[:：]/.test(line.trim()))
    ?.replace(/^导向[:：]\s*/, "") || "";
  if (
    /核心|最高|P0/i.test(block.priority || "") &&
    direction.length >= 8 &&
    direction.length <= 88 &&
    isVisibleEvidence(direction, parentLabel)
  ) {
    evidence.push({ id: makeId(), label: makeJudgmentLabel(direction), tag: "推导结果", children: [] });
  }
  return evidence;
}

function isVisibleEvidence(value: string, parentLabel: string) {
  if (value.length < 8 || value === parentLabel || parentLabel.includes(value) || value.includes(parentLabel)) return false;
  return !/^(?:原文|该段|本段|材料|内容|账本|章节|来源|用于|支持|说明|路径|导向|待验证)/.test(value);
}

function buildStageOutputLabel(stage: StageBlueprint, blocks: DocumentBlock[]) {
  const candidates = blocks
    .map((block) => ({
      block,
      direction: block.detail?.split("\n").find((line) => /^导向[:：]/.test(line.trim()))?.replace(/^导向[:：]\s*/, "") || ""
    }))
    .filter(({ direction }) => direction.length >= 10 && direction.length <= 88)
    .filter(({ direction }) => !/^(?:用于|支持|并入|路径|本段|该段|待验证)/.test(direction))
    .sort((a, b) => strategicBlockScore(b.block) - strategicBlockScore(a.block));
  const direction = candidates[0]?.direction;
  return direction ? `阶段输出：${makeJudgmentLabel(direction)}` : stage.output;
}

function groupStrategicBlocks(blocks: DocumentBlock[]) {
  const groups = new Map<string, DocumentBlock[]>();
  for (const block of blocks) {
    const heading = block.headings.at(-1) || block.headings.at(-2) || "关键判断";
    const group = groups.get(heading) || [];
    if (!group.some((item) => makeJudgmentLabel(item.text) === makeJudgmentLabel(block.text))) group.push(block);
    groups.set(heading, group);
  }
  return [...groups.entries()];
}

function makeJudgmentLabel(value: string) {
  const cleaned = cleanNodeText(value)
    .replace(/^(?:结论|建议|判断|用户价值|设计建议)[:：]\s*/, "")
    .replace(/[。；]+$/, "");
  if (cleaned.length <= 58) return cleaned;
  const clauses = cleaned.split(/[。；，]/).filter(Boolean);
  const title = clauses.slice(0, 2).join("，");
  return `${title.slice(0, 58)}${title.length > 58 ? "…" : ""}`;
}

function isRedundantHeading(heading: string, theme: string) {
  const normalizedHeading = heading.replace(/^\d+(?:\.\d+)*\s*/, "");
  return normalizedHeading.length < 4 || theme.includes(normalizedHeading) || normalizedHeading.includes(theme.split("：")[0]);
}

function inferStrategicRootTitle(content: string) {
  const heading = content.split("\n")
    .map((line) => line.match(/^#\s+(.+)$/)?.[1])
    .find(Boolean);
  const clean = cleanRootLabel(heading || "产品创新战略").replace(/[：:].*$/, "");
  if (/论证全景$/.test(clean)) return clean.slice(0, 60);
  return `${clean.replace(/策划案|方案/g, "")}创新论证全景`.replace(/创新创新/g, "创新").slice(0, 60);
}

function buildStagedMindMap(mapSource: string, originalContent: string): MindMapNode {
  const entries = parseLedgerEntries(mapSource);
  const buckets = STAGED_MAP_DEFINITIONS.map(() => [] as LedgerEntry[]);
  for (const entry of entries) buckets[classifyLedgerEntry(entry)].push(entry);

  // A sparse category still receives the best unassigned semantic matches, but never fabricated content.
  for (let index = 0; index < buckets.length; index += 1) {
    if (buckets[index].length >= 3) continue;
    const extras = entries.filter((entry) =>
      STAGED_MAP_DEFINITIONS[index].pattern.test(
        `${entry.type} ${entry.object} ${entry.judgment} ${entry.support} ${entry.direction}`
      )
    );
    for (const entry of extras) {
      if (!buckets[index].includes(entry)) buckets[index].push(entry);
      if (buckets[index].length >= 3) break;
    }
  }

  let sequence = 0;
  const makeId = () => `mindmap-stage-${sequence++}`;
  const stageResults = STAGED_MAP_DEFINITIONS.map((definition, stageIndex) => {
    const groups = new Map<string, LedgerEntry[]>();
    for (const entry of buckets[stageIndex]) {
      const key = cleanNodeText(entry.object) || cleanNodeText(entry.type) || "关键判断";
      const group = groups.get(key) || [];
      if (!group.some((item) => item.judgment === entry.judgment)) group.push(entry);
      groups.set(key, group);
    }
    const themes = [...groups.entries()]
      .sort((a, b) => scoreGroup(b[1]) - scoreGroup(a[1]))
      .slice(0, 5)
      .map(([object, group]) => ({
        id: makeId(),
        label: object.slice(0, 42),
        children: group
          .sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority))
          .slice(0, 3)
          .map((entry) => ({
            id: makeId(),
            label: cleanNodeText(entry.judgment).slice(0, 72),
            children: buildEvidenceNodes(entry, makeId)
          }))
      }));
    themes.push({ id: makeId(), label: STAGE_OUTPUTS[stageIndex], children: [] });
    return { id: makeId(), label: definition.title, children: themes };
  });
  const firstLine = originalContent.split("\n").map((line) => cleanRootLabel(line)).find(Boolean);
  return {
    id: "root",
    label: (firstLine || "产品创新战略论证全景").slice(0, 72),
    children: stageResults
  };
}

function parseLedgerEntries(source: string): LedgerEntry[] {
  const seen = new Set<string>();
  const entries: LedgerEntry[] = [];
  for (const rawLine of source.split("\n")) {
    const line = rawLine.replace(/^[-*•\s]+/, "").trim();
    const parts = line.split(/[｜|]/).map(cleanNodeText);
    if (parts.length < 6 || /信息类型/.test(parts[0])) continue;
    const entry: LedgerEntry = parts.length >= 7
      ? {
          stage: parts[0], dimension: parts[1], type: parts[1], object: parts[2],
          judgment: parts[3], support: parts[4], direction: parts[5], priority: parts.slice(6).join("、")
        }
      : {
          stage: parts[0], dimension: parts[1], type: parts[0], object: parts[1],
          judgment: parts[2], support: parts[3], direction: parts[4], priority: parts.slice(5).join("、")
        };
    if (!entry.judgment || seen.has(entry.judgment)) continue;
    seen.add(entry.judgment);
    entries.push(entry);
  }
  return entries;
}

function buildLocalDocumentLedger(content: string) {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const entries: string[] = [];
  let section = "项目核心判断";
  let subsection = "关键结论";
  for (const raw of lines) {
    const heading = raw.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const title = cleanRootLabel(heading[2]);
      if (heading[1].length <= 2) section = title;
      else subsection = title;
      continue;
    }
    if (/^(?:---+|参考[:：]|https?:\/\/)/i.test(raw)) continue;
    const text = cleanNodeText(raw.replace(/^[-*•>\d.)、\s]+/, ""));
    if (text.length < 8 || text.length > 240) continue;
    const context = `${section} ${subsection} ${text}`;
    const type = inferLocalLedgerType(context);
    const object = cleanNodeText(subsection || section).slice(0, 42);
    const priority = /核心|关键|必须|结论|建议|机会|定义|风险/.test(context) ? "核心" : "重要";
    entries.push(`${type}｜${object}｜${text}｜来源于“${section}”章节的原文判断｜用于支撑${section}的阶段结论｜${priority}`);
  }
  return entries.slice(0, 420).join("\n");
}

function inferLocalLedgerType(text: string) {
  if (/用户|人群|家庭|购买|老人|儿童|孩子|消费者/.test(text)) return "用户";
  if (/场景|客厅|卧室|睡眠|夜间|空间|触发/.test(text)) return "场景";
  if (/竞品|竞争|市场|行业|品牌|趋势|卡萨帝|COLMO|海尔|美的/.test(text)) return "竞品市场";
  if (/风险|误区|失败|问题|矛盾|痛点|不足|挑战/.test(text)) return "问题矛盾";
  if (/机会|筛选|差异|价值|主张|推导/.test(text)) return "产品机会";
  if (/功能|产品|屏幕|交互|形态|设计|方案|策略|商业|执行|路线/.test(text)) return "产品策略";
  return "需求背景";
}

function classifyLedgerEntry(entry: LedgerEntry) {
  const type = entry.type;
  const all = `${type} ${entry.object} ${entry.judgment} ${entry.support} ${entry.direction}`;
  if (/用户|人群|角色|购买者|消费者/.test(type)) return 2;
  if (/场景|触发|情境|空间/.test(type)) return 3;
  if (/竞品|市场|行业|趋势/.test(type)) return 4;
  if (/机会|筛选|推导|差异|价值主张/.test(type)) return 5;
  if (/产品|功能|形态|交互|商业|执行|策略|方案|风险|成立条件/.test(type)) return 6;
  if (/问题|矛盾|痛点|挑战|原因/.test(type)) return 1;
  if (/需求|背景|目标|约束|任务/.test(type)) return 0;
  const matched = STAGED_MAP_DEFINITIONS.findIndex((definition) => definition.pattern.test(all));
  return matched >= 0 ? matched : 5;
}

function buildEvidenceNodes(entry: LedgerEntry, makeId: () => string): MindMapNode[] {
  const children: MindMapNode[] = [];
  const support = cleanNodeText(entry.support);
  const direction = cleanNodeText(entry.direction);
  if (support && support !== "待验证") children.push({ id: makeId(), label: `依据：${support}`.slice(0, 96), children: [] });
  if (direction && direction !== support) children.push({ id: makeId(), label: `导向：${direction}`.slice(0, 96), children: [] });
  if (!children.length) children.push({ id: makeId(), label: "证据状态：仍需在下一轮研究中验证", children: [] });
  return children;
}

function cleanNodeText(value: string) {
  return value.replace(/^【.*?】\s*/, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

function priorityScore(value: string) {
  if (/核心|最高|P0/i.test(value)) return 3;
  if (/重要|高|P1/i.test(value)) return 2;
  return 1;
}

function scoreGroup(entries: LedgerEntry[]) {
  return entries.length * 10 + Math.max(...entries.map((entry) => priorityScore(entry.priority)), 0);
}

function cleanRootLabel(value: string) {
  return value.replace(/^\s*(?:#{1,6}|[-*•]|\d+[.)、])\s*/, "").replace(/\*\*/g, "").trim();
}

async function buildMindMapSource(
  content: string,
  provider: { apiKey: string; baseUrl: string; model: string; signal?: AbortSignal }
) {
  // One document generation must result in at most one paid ledger request.
  // The complete original text is still parsed locally when the strategic tree is built.
  const representativeSource = buildRepresentativeSource(content, 11_000);
  const ledger = await buildContentLedger(representativeSource, "全文代表内容", provider);
  return [
    "【策划案内容账本｜单次分析】",
    "以下账本由全文的结构标题及首、中、尾代表内容建立；最终导图同时使用完整原文的本地结构解析补足信息。",
    ledger
  ].join("\n");
}

function buildRepresentativeSource(content: string, limit: number) {
  if (content.length <= limit) return content;
  const blocks = parseStrategicDocument(content);
  const seen = new Set<number>();
  const stageBudget = Math.floor((limit - 700) / STRATEGIC_STAGE_BLUEPRINTS.length);
  const sections: string[] = [];
  for (const stage of STRATEGIC_STAGE_BLUEPRINTS) {
    const candidates = blocks
      .filter((block) => stage.pattern.test(blockContext(block)))
      .sort((a, b) => strategicBlockScore(b) - strategicBlockScore(a) || a.order - b.order)
      .slice(0, 28);
    const selected: DocumentBlock[] = [];
    let used = 0;
    for (const block of candidates) {
      if (seen.has(block.order)) continue;
      const lineLength = block.text.length + block.headings.slice(-2).join(" > ").length + 5;
      if (used + lineLength > stageBudget && selected.length >= 6) continue;
      selected.push(block);
      seen.add(block.order);
      used += lineLength;
    }
    selected.sort((a, b) => a.order - b.order);
    sections.push([
      `【${stage.title}】`,
      ...selected.map((block) => `〔${block.headings.slice(-2).join(" > ") || "正文"}〕${block.text}`)
    ].join("\n"));
  }
  const result = `【全文高密度论证素材】\n${sections.join("\n\n")}`.slice(0, limit);
  return result.length > 1000 ? result : content.slice(0, limit);
}

async function buildContentLedger(
  chunk: string,
  label: string,
  provider: { apiKey: string; baseUrl: string; model: string; signal?: AbortSignal }
): Promise<string> {
  try {
    return (await streamMindMapCompletion({
      ...provider,
      temperature: 0.1,
      maxCompletionTokens: 4200,
      timeoutMs: 120_000,
      reasoningEffort: "low",
      messages: [
        { role: "system", content: CONTENT_LEDGER_SYSTEM_PROMPT },
        {
          role: "user",
          content: `这是策划案第 ${label} 段。请建立内容账本：\n\n${chunk}`
        }
      ]
    })).content;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!isLedgerRecoverableError(message)) throw error;
    throw new Error(`大模型未完成策划案分析：${message || "请求被中止"}`);
  }
}

function isContentPolicyError(message: string) {
  return /blocked by content policy|content policy|内容.{0,4}(?:策略|审核|拦截)/i.test(message);
}

function isLedgerRecoverableError(message: string) {
  return isContentPolicyError(message) || /abort|timeout|超时|响应时间过长/i.test(message);
}

async function streamMindMapCompletion(
  params: Parameters<typeof streamChatCompletion>[0]
) {
  let lastError: unknown;
  const retryDelays = [3_000, 7_000];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await streamChatCompletion(params, () => {});
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      if (isContentPolicyError(message)) throw error;
      if (/账户余额不足|insufficient\s+(?:balance|credit)/i.test(message)) throw error;
      const retryable = /拒绝当前请求|频率限制|返回 429|请求过于频繁|服务暂时不可用|接口请求失败|concurrency limit exceeded|too many simultaneous requests|rate limit/i.test(message);
      if (!retryable || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    }
  }
  throw lastError;
}

const CONTENT_LEDGER_SYSTEM_PROMPT = `你是战略策划论证架构师。把材料重构为有因果顺序的高密度内容账本，不复制目录，不补充外部事实。

每条必须严格输出七个字段：
论证阶段｜分析维度｜具体对象｜核心判断｜支持信息｜自然推导结果｜优先级

论证阶段只能选：01需求整理、02问题研究、03人群分析、04场景研究、05竞品分析、06机会收敛、07产品定义与策略。
分析维度必须从对应阶段选择：
- 01：显性需求、隐性诉求、需求约束；
- 02：品类矛盾、价值矛盾、界面矛盾、失败假设；
- 03：基础画像、家庭角色、用户任务、使用张力；
- 04：场景触发、角色与行为、场景问题、验证价值、成功信号；
- 05：直接竞品、跨行业参照、可借鉴、不可照搬、品牌机会；
- 06：筛选标准、核心推导链、排除方向、产品机会；
- 07：机会成立依据、用户购买价值、产品定义、功能与交互、产品组合、场景验证、商业闭环、风险与对策。

逻辑规则：
- 核心判断必须是可独立理解的事实或判断；具体对象是这组判断共同讨论的人、场景、矛盾、竞品、机会、功能或风险。
- 同一“阶段＋维度＋对象”下的判断必须属于同一分类标准，父级能够概括全部子项。
- 支持信息写原文中的数据、现象、案例、用户语言或明确边界；不得写“原文提到、用于支持、该段说明”等元话语。
- 自然推导结果写这条判断解释了什么、排除了什么或导向什么后续决策，必须能与下一阶段衔接。
- 功能和策略必须能回溯到需求、问题、用户、场景或竞品证据；风险必须对应控制策略；机会必须对应筛选依据。
- 合并真正重复的观点，但每个有独立信息增量的事实、场景、功能、限制或对策单独成条。确实不可拆分时允许只有1–2条，不为凑数注水。
- 优先级只能写“核心、重要、补充”。证据不足时在支持信息中明确“待验证”。

不要输出标题、说明、Markdown或序号，只输出上述七字段账本，每条一行。`;

function splitResearchDocument(content: string, maxChars: number) {
  const paragraphs = content.split(/\n{2,}|\n(?=#{1,6}\s|\d+[.、]|[一二三四五六七八九十]+、)/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) chunks.push(current);
      current = "";
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        chunks.push(paragraph.slice(offset, offset + maxChars));
      }
      continue;
    }
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [content];
}

const MIND_MAP_SYSTEM_PROMPT = `你是品物创新的资深产品战略架构师。你的唯一任务是把一份完整策划案重构成“可导航的论证模型”，而不是复制目录或压缩摘要。

必须遵守：
1. 先完整理解全文，再重排逻辑。隐藏原文章节编号，按因果和信息类型重新归类。
2. 根节点定义研究对象与最终任务。一级节点优先采用七阶段论证链：
   01｜需求整理 → 02｜问题研究 → 03｜人群分析 → 04｜场景研究 → 05｜竞品分析 → 06｜机会收敛 → 07｜产品定义与创新策略。
   原文确实缺少某阶段时可以合并，但不得直接从项目背景跳到产品结论。
3. 每个阶段内部形成闭环：输入/事实 → 分析维度 → 关键判断 → 支持证据或例子 → 阶段输出。阶段输出必须自然导向下一阶段。
4. 产品定义、功能、形态、交互、商业和风险必须能追溯到前面的需求、问题、用户、场景或竞品证据，不得凭空出现。
5. 层级职责：L0研究对象；L1阶段；L2分析维度；L3独立判断；L4-L6证据、触发、行动、功能或对策。核心内容达到4–6层，但只有出现独立信息增量时才拆分。
6. 父节点必须准确概括所有直接子节点；兄弟节点必须使用同一分类标准，尽量互斥且共同完整。禁止把人群、功能、风险混在同一层。
7. 节点标题必须是可独立理解的完整判断，避免“用户需求、行业趋势、竞品分析、风险”等空泛名词。优先使用8–28个汉字，必要时可到48字。
8. 原文中的数据、用户语言、案例、竞品信号、功能建议、风险与对策要保留为证据/行动节点。重复观点合并，不重复堆节点。
9. 只能基于策划案归纳和谨慎推导，不得虚构市场数据、用户事实、竞品能力或技术指标。原文证据不足时写成“待验证：……”节点。
10. 长策划案目标为70–140个有效节点；短策划案也应充分覆盖核心论证。每个阶段通常3–6个主题，每个主题2–6个判断。
11. 风险节点必须有控制策略；机会节点必须有筛选依据；商业价值必须有实现路径。

只输出合法 JSON，不要 Markdown、代码围栏、解释或前后缀。结构严格为：
{"title":"根节点标题","children":[{"title":"节点标题","children":[]}]}
每个节点只能使用 title 和 children 两个字段。`;

function extractJsonObject(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("导图服务没有返回有效结构。");
  return trimmed.slice(first, last + 1);
}

function normalizeNode(raw: RawNode, depth: number, nextId: () => string): MindMapNode {
  if (!raw || typeof raw !== "object") {
    throw new Error("导图节点结构无效。");
  }
  const value = typeof raw.title === "string" ? raw.title : typeof raw.label === "string" ? raw.label : "";
  const label = value.replace(/\s+/g, " ").trim().slice(0, depth === 0 ? 72 : 96);
  if (!label) throw new Error("导图中存在空白节点。");
  const children = depth < 6 && Array.isArray(raw.children)
    ? raw.children.slice(0, depth === 0 ? 9 : 10).map((child) => normalizeNode(child as RawNode, depth + 1, nextId))
    : [];
  return { id: depth === 0 ? "root" : nextId(), label, children };
}

function countNodes(node: MindMapNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}
