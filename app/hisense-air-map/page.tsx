"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileUp, Focus, Minus, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import styles from "./page.module.css";

type MapNode = { id: string; title: string; detail?: string; tag?: string; children?: MapNode[] };

const initialMap: MapNode = {
  id: "root", title: "海信空气感知屏空调", tag: "核心提案", detail: "用显示科技，让家的好空气一眼可见。屏幕不是附加硬件，而是空调理解、表达与管理空气的界面。",
  children: [
    { id: "why", title: "为什么机会成立", tag: "机会判断", detail: "高端空调的价值正从参数走向体验，但空气与算法能力天然不可见，市场缺少把价值讲清楚的界面。", children: [
      { id: "why-industry", title: "行业角色正在升级", detail: "家电从单一执行设备，变为家庭系统中的状态理解、方案推荐与空间体验终端。", children: [
        { id: "why-trend", title: "屏幕化趋势的本质", children: [
          { id: "why-trend-1", title: "从执行命令到理解状态" }, { id: "why-trend-2", title: "从机械控制到智能决策" }, { id: "why-trend-3", title: "从单机功能到家庭系统" }
        ]},
        { id: "why-benchmark", title: "跨行业已完成用户教育", children: [
          { id: "why-car", title: "智能汽车：屏幕是状态中枢", detail: "高端感来自信息组织与系统掌控感。" },
          { id: "why-fridge", title: "智能冰箱：屏幕管理家庭信息", detail: "可借鉴中枢逻辑，但必须聚焦空气而非泛化为家庭平板。" },
          { id: "why-speaker", title: "语音与中控：轻交互分工", detail: "语音负责命令，屏幕负责反馈，图形负责理解。" }
        ]}
      ]},
      { id: "why-air", title: "空气是“强需求、弱感知”", detail: "用户每天感受空气，却难看见原因；温湿度、洁净度、气流、新风、噪音和能耗共同影响舒适。", children: [
        { id: "why-hidden", title: "高端能力被隐藏", children: [
          { id: "hidden-1", title: "新风与净化难验证" }, { id: "hidden-2", title: "AI 控温过程不可解释" }, { id: "hidden-3", title: "柔风与气流难传播" }, { id: "hidden-4", title: "节能要等账单才有感知" }
        ]},
        { id: "why-result", title: "战略作用：三化", children: [
          { id: "why-visible", title: "可感知化：看见正在发生什么" }, { id: "why-explain", title: "可解释化：理解为什么这样运行" }, { id: "why-share", title: "可传播化：把体验变成演示画面" }
        ]}
      ]},
      { id: "why-window", title: "差异化窗口仍然存在", detail: "行业多为小屏、灯显与状态栏。率先做大屏不等于领先，率先定义屏幕为何存在才可能抢占认知。" }
    ]},

    { id: "user", title: "用户真正购买什么", tag: "用户价值", detail: "目标不是让用户因屏幕购买，而是让中高端家庭获得“空气被照顾”的确定感。", children: [
      { id: "user-profile", title: "目标家庭", children: [
        { id: "user-home", title: "重视家居整体质感与品牌品位" }, { id: "user-pay", title: "愿为健康、舒适、安静与设计付费" }, { id: "user-family", title: "关注老人、孩子、宠物的空气健康" }, { id: "user-smart", title: "接受智能，但拒绝复杂操作" }
      ]},
      { id: "user-conflicts", title: "三组核心矛盾", children: [
        { id: "conflict-value", title: "花钱买了高端功能，却持续感知不到", children: [
          { id: "translate-value", title: "解法：从显示参数转为显示价值", detail: "不止显示 26℃、52%、PM2.5 12，而是表达“适合睡眠”“已完成循环净化”“建议新风 15 分钟”。" }
        ]},
        { id: "conflict-complex", title: "功能越丰富，学习成本越高", children: [
          { id: "translate-language", title: "解法：把参数翻译成生活建议" }
        ]},
        { id: "conflict-disturb", title: "希望智能，又不想多一个打扰源", children: [
          { id: "translate-restraint", title: "解法：该出现时出现，该消失时消失" }
        ]}
      ]},
      { id: "user-outcome", title: "最终体验承诺", children: [
        { id: "outcome-see", title: "我能一眼判断空气好不好" }, { id: "outcome-know", title: "我知道空调正在做什么" }, { id: "outcome-easy", title: "我不必研究复杂参数" }, { id: "outcome-safe", title: "我更放心给家人使用" }
      ]}
    ]},

    { id: "definition", title: "产品应该被如何定义", tag: "战略转译", detail: "“大屏空调”只是形式，“空气可视化空调”才是机会。", children: [
      { id: "definition-role", title: "四重角色升级", children: [
        { id: "role-ac", title: "空调：制冷制热设备 → 空气管理终端" }, { id: "role-screen", title: "屏幕：显示硬件 → 空气状态界面" }, { id: "role-user", title: "用户：调参数 → 选择空气方案" }, { id: "role-brand", title: "品牌：硬件制造 → 家庭空气体验管理" }
      ]},
      { id: "definition-proposition", title: "核心主张", children: [
        { id: "prop-main", title: "让看不见的好空气，被看见、被理解、被管理" }, { id: "prop-comm", title: "传播表达：看见好空气，才知道家真的舒适" }
      ]},
      { id: "definition-boundary", title: "屏幕存在的边界", children: [
        { id: "no-entertain", title: "不做娱乐终端", detail: "用户不会站在空调前看视频，空间、视角和声音都不成立。" },
        { id: "no-remote", title: "不做放大版遥控器", detail: "基础参数与控制已有遥控器、App 和语音，不能支撑溢价。" },
        { id: "no-decoration", title: "不做科技感装饰", detail: "炫酷光效会带来审美疲劳、夜间打扰、功耗与廉价感。" },
        { id: "boundary-principle", title: "原则：克制、可信、聪明、融入空间" }
      ]}
    ]},

    { id: "experience", title: "价值如何被体验到", tag: "体验系统", detail: "屏幕只做与空气相关、能降低理解成本并建立长期信任的事。", children: [
      { id: "functions", title: "五类核心功能", children: [
        { id: "func-state", title: "1. 空气状态可视化", children: [
          { id: "state-content", title: "舒适度 / 温湿度 / 洁净度 / CO₂ / 新风" }, { id: "state-expression", title: "空气状态图谱优先，数值退居第二层" }, { id: "state-language", title: "用舒适、偏闷、偏干、需通风等自然语言" }
        ]},
        { id: "func-ai", title: "2. AI 空气管家建议", children: [
          { id: "ai-advice", title: "给出下一步：新风、舒润、送风、睡眠、维护" }, { id: "ai-tone", title: "短、像管家、不焦虑、不频繁打扰" }, { id: "ai-control", title: "可一键接受或忽略，自动决策可解释" }
        ]},
        { id: "func-flow", title: "3. 空间气流可视化", children: [
          { id: "flow-path", title: "显示送风路径、循环覆盖与人体避风区域" }, { id: "flow-value", title: "把柔风、无风感、环抱风持续可感知" }
        ]},
        { id: "func-calendar", title: "4. 家庭空气健康日历", children: [
          { id: "calendar-log", title: "舒适时长、睡眠评分、滤网、节能、季节记录" }, { id: "calendar-language", title: "用生活语言解释趋势，避免过度数据化" }
        ]},
        { id: "func-home", title: "5. 全屋空气入口", children: [
          { id: "home-devices", title: "联动多台空调、新风、净化、除湿与加湿设备" }, { id: "home-boundary", title: "只管理空气与舒适，不成为万能中控" }
        ]}
      ]},
      { id: "info-architecture", title: "三层内容架构", children: [
        { id: "ia-now", title: "第一层：空气状态｜一眼看懂现在" }, { id: "ia-next", title: "第二层：空气建议｜让用户少思考" }, { id: "ia-long", title: "第三层：空气记录｜让价值持续可见" }
      ]},
      { id: "interaction", title: "交互分工与距离逻辑", children: [
        { id: "interaction-devices", title: "遥控器做快捷控制，App 做深度设置，语音做即时命令，屏幕做状态与决策" },
        { id: "distance-far", title: "远看：一眼知道空气状态" }, { id: "distance-pass", title: "经过：看到简短建议" }, { id: "distance-near", title: "靠近：进入详细操作" }, { id: "distance-sleep", title: "睡眠：自动弱化存在感" }
      ]},
      { id: "visual", title: "视觉语言", children: [
        { id: "visual-ring", title: "空气环：表达整体舒适度" }, { id: "visual-line", title: "气流线：表达送风路径与柔风" }, { id: "visual-map", title: "空气地图：表达空间与全屋状态" }, { id: "visual-cmf", title: "CMF：低饱和、隐藏黑区、熄屏仍高级" }
      ]}
    ]},

    { id: "portfolio", title: "如何落到产品组合", tag: "产品路线", detail: "采用“一大一小、一明一隐”：公共空间展示与管理，私密空间安静守护。", children: [
      { id: "airview", title: "客厅柜机｜AirView 家庭空气中枢屏", children: [
        { id: "airview-role", title: "角色：空气管理中心 + 高端科技识别符号" }, { id: "airview-form", title: "形态：7–12 英寸纵向一体屏" }, { id: "airview-focus", title: "重点：空气状态、气流、新风、全屋联动" }, { id: "airview-design", title: "设计：远看可识别，近看可交互，不像电视或平板" }
      ]},
      { id: "sleepview", title: "卧室挂机｜SleepView 睡眠空气隐显屏", children: [
        { id: "sleep-role", title: "角色：睡前安心确认 + 夜间低打扰守护" }, { id: "sleep-form", title: "形态：3–7 英寸或隐藏式小屏" }, { id: "sleep-focus", title: "重点：睡眠舒适、防直吹、醒后建议" }, { id: "sleep-design", title: "设计：柔光、自动息屏、可完全关闭" }
      ]},
      { id: "airlens", title: "探索概念｜AirLens 隐形空气光幕", children: [
        { id: "airlens-role", title: "半透材质与隐藏显示，熄屏形成完整材质面" }, { id: "airlens-fit", title: "适合高端、状态表达优先的产品" }, { id: "airlens-risk", title: "风险：信息承载、成本、结构工艺与清晰度平衡" }
      ]},
      { id: "tiers", title: "三档技术配置", children: [
        { id: "tier-flagship", title: "旗舰：全功能空气感知屏", detail: "温湿度、PM2.5、CO₂、可选 VOC、人体与环境光感知、AI、气流、全屋联动、能耗与滤网管理。" },
        { id: "tier-high", title: "高配：空气状态屏", detail: "保留温湿度、空气质量、核心运行状态、简短建议、场景与睡眠低打扰。" },
        { id: "tier-basic", title: "基础：隐形空气提示窗", detail: "用较低成本保留舒适/闷/干/净化、温度、息屏和维护提醒。" }
      ]}
    ]},

    { id: "scenario", title: "在什么场景证明价值", tag: "生活验证", children: [
      { id: "scene-living", title: "客厅会客", children: [{ id: "scene-living-q", title: "问题：多人聚集，空气闷但原因不明" }, { id: "scene-living-v", title: "价值：识别 CO₂ 与空气变化，建议并展示新风过程" }]},
      { id: "scene-child", title: "儿童活动", children: [{ id: "scene-child-q", title: "问题：家长担心直吹、温差与洁净度" }, { id: "scene-child-v", title: "价值：标识活动区、舒适区、避风与洁净状态" }]},
      { id: "scene-sleep", title: "夜间睡眠", children: [{ id: "scene-sleep-q", title: "问题：怕光、怕风、怕温度波动" }, { id: "scene-sleep-v", title: "价值：睡前确认、入睡息屏、夜间曲线、醒后建议" }]},
      { id: "scene-rain", title: "梅雨除湿", children: [{ id: "scene-rain-q", title: "问题：体感黏闷但难判断湿度变化" }, { id: "scene-rain-v", title: "价值：说明除湿进程与舒适区形成" }]},
      { id: "scene-heat", title: "高温节能", children: [{ id: "scene-heat-q", title: "问题：舒适与省电之间难权衡" }, { id: "scene-heat-v", title: "价值：解释 AI 调节与节能趋势" }]}
    ]},

    { id: "business", title: "如何形成商业闭环", tag: "增长与防守", children: [
      { id: "brand", title: "海信为什么有资格做", children: [
        { id: "brand-display", title: "用户已有“海信 = 显示科技”的认知资产" }, { id: "brand-link", title: "显示科技可自然连接空气管理" }, { id: "brand-position", title: "不拼奢华或冷峻 AI，建立“空气可视化科技”路径" }
      ]},
      { id: "store", title: "门店如何把价值讲清", children: [
        { id: "store-shift", title: "从讲匹数、能效、价格，转向讲空气体验" }, { id: "demo-air", title: "演示 1：空气从不可见到可见" }, { id: "demo-wind", title: "演示 2：风不直吹" }, { id: "demo-care", title: "演示 3：儿童 / 老人安心" }, { id: "demo-sleep", title: "演示 4：睡前可见、睡后隐退" }
      ]},
      { id: "commercial-value", title: "五类商业收益", children: [
        { id: "cv-diff", title: "形成门店第一眼显性差异" }, { id: "cv-value", title: "让高端功能从“有但不显”变得可感" }, { id: "cv-sales", title: "提升销售解释与转化效率" }, { id: "cv-brand", title: "建立海信空气可视化认知标签" }, { id: "cv-series", title: "延展到新风、净化、除湿与全屋系统" }
      ]},
      { id: "risks", title: "四类风险与对策", children: [
        { id: "risk-gimmick", title: "噱头风险", children: [{ id: "risk-gimmick-fix", title: "对策：功能、传播、演示全部围绕空气" }]},
        { id: "risk-cost", title: "成本增加但溢价不足", children: [{ id: "risk-cost-fix", title: "对策：柜机旗舰优先，挂机隐显，三档分级" }]},
        { id: "risk-night", title: "卧室屏幕打扰", children: [{ id: "risk-night-fix", title: "对策：环境光感、息屏、可关闭、低动效、不弹窗" }]},
        { id: "risk-trust", title: "信息不准损害信任", children: [{ id: "risk-trust-fix", title: "对策：可靠校准、趋势和建议表达、AI 可解释、不夸大" }]}
      ]},
      { id: "moat", title: "难复制的不是屏幕硬件", children: [
        { id: "moat-system", title: "空气状态可视化体系" }, { id: "moat-translation", title: "参数到生活语言的转译能力" }, { id: "moat-dual", title: "柜机与挂机差异化策略" }, { id: "moat-ui", title: "高端克制的 UI 与产品语言" }, { id: "moat-demo", title: "门店演示系统与品牌叙事" }
      ]},
      { id: "success", title: "最终成立条件", children: [
        { id: "success-use", title: "长期愿用：不是短暂注意的卖点" }, { id: "success-trust", title: "持续可信：数据与体感基本一致" }, { id: "success-price", title: "支撑溢价：用户看得见多花钱的理由" }, { id: "success-series", title: "可系列化：成为长期产品语言资产" }
      ]}
    ]}
  ]
};

const STORAGE_KEY = "hisense-air-mindmap-v1";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function walk(node: MapNode, fn: (node: MapNode, parent?: MapNode) => void, parent?: MapNode) {
  fn(node, parent); node.children?.forEach((child) => walk(child, fn, node));
}
function updateNode(root: MapNode, id: string, patch: Partial<MapNode>): MapNode {
  if (root.id === id) return { ...root, ...patch };
  return { ...root, children: root.children?.map((child) => updateNode(child, id, patch)) };
}
function removeNode(root: MapNode, id: string): MapNode {
  return { ...root, children: root.children?.filter((child) => child.id !== id).map((child) => removeNode(child, id)) };
}
function countNodes(root: MapNode) { let n = 0; walk(root, () => n++); return n; }

export default function HisenseAirMap() {
  const [tree, setTree] = useState<MapNode>(initialMap);
  const [selectedId, setSelectedId] = useState("root");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["scenario"]));
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(.78);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setTree(JSON.parse(saved)); } catch {} }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(tree)); }, [tree]);

  const selected = useMemo(() => { let found = tree; walk(tree, (node) => { if (node.id === selectedId) found = node; }); return found; }, [tree, selectedId]);
  const matches = useMemo(() => { const ids = new Set<string>(); const term = query.trim().toLowerCase(); if (!term) return ids; walk(tree, (node, parent) => { if (`${node.title} ${node.detail || ""}`.toLowerCase().includes(term)) { ids.add(node.id); if (parent) ids.add(parent.id); } }); return ids; }, [tree, query]);

  const toggle = (id: string) => setCollapsed((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const addChild = () => {
    const id = `custom-${Date.now()}`;
    setTree((old) => updateNode(old, selectedId, { children: [...(selected.children || []), { id, title: "新观点", detail: "点击右侧编辑说明" }] }));
    setCollapsed((old) => { const next = new Set(old); next.delete(selectedId); return next; }); setSelectedId(id);
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(tree, null, 2)], { type: "application/json" }); const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "海信空气感知屏-思维导图.json"; a.click(); URL.revokeObjectURL(a.href);
  };
  const importFile = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { setTree(JSON.parse(String(reader.result))); setSelectedId("root"); } catch { alert("文件格式无法识别"); } }; reader.readAsText(file); };

  return <main className={styles.app}>
    <header className={styles.header}>
      <div className={styles.brand}><div className={styles.mark}>A</div><div><p>HISENSE AIR INTERFACE</p><h1>空气感知屏 · 战略思维导图</h1></div></div>
      <div className={styles.toolbar}>
        <label className={styles.search}><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索观点或关键词"/>{query && <button onClick={() => setQuery("")}><X size={14}/></button>}</label>
        <button onClick={() => setZoom((z) => Math.max(.42, z - .08))} aria-label="缩小"><Minus size={17}/></button><span className={styles.zoom}>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((z) => Math.min(1.25, z + .08))} aria-label="放大"><Plus size={17}/></button>
        <button onClick={() => setZoom(.78)} title="适应视图"><Focus size={17}/></button><button onClick={download} title="导出"><Download size={17}/></button><button onClick={() => fileRef.current?.click()} title="导入"><FileUp size={17}/></button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => importFile(e.target.files?.[0])}/>
      </div>
    </header>

    <section className={styles.context}>
      <div><span>核心判断</span><strong>“大屏空调”只是产品形式，“空气可视化空调”才是产品机会。</strong></div>
      <p>从机会判断 → 用户矛盾 → 产品定义 → 体验系统 → 产品路线 → 场景验证 → 商业闭环</p>
    </section>

    <div className={styles.workspace}>
      <div className={styles.canvas} onClick={() => sidebarOpen || setSidebarOpen(true)}>
        <div className={styles.mapWrap} style={{ transform: `scale(${zoom})` }}>
          <TreeNode node={tree} depth={0} collapsed={collapsed} toggle={toggle} selectedId={selectedId} select={(id) => { setSelectedId(id); setSidebarOpen(true); }} matches={matches} querying={Boolean(query.trim())}/>
        </div>
      </div>

      <aside className={`${styles.inspector} ${sidebarOpen ? styles.open : ""}`}>
        <div className={styles.inspectorTop}><div><p>NODE EDITOR</p><h2>编辑观点</h2></div><button onClick={() => setSidebarOpen(false)}><X size={18}/></button></div>
        <label>节点标题<textarea value={selected.title} rows={3} onChange={(e) => setTree((old) => updateNode(old, selectedId, { title: e.target.value }))}/></label>
        <label>逻辑说明<textarea value={selected.detail || ""} rows={7} placeholder="补充论据、解释或执行要求…" onChange={(e) => setTree((old) => updateNode(old, selectedId, { detail: e.target.value }))}/></label>
        <label>节点标签<input value={selected.tag || ""} placeholder="如：机会判断" onChange={(e) => setTree((old) => updateNode(old, selectedId, { tag: e.target.value }))}/></label>
        <div className={styles.actions}><button className={styles.primary} onClick={addChild}><Plus size={16}/> 添加子观点</button><button disabled={selectedId === "root"} onClick={() => { setTree((old) => removeNode(old, selectedId)); setSelectedId("root"); }}><Trash2 size={16}/> 删除</button></div>
        <div className={styles.note}><strong>逻辑提示</strong><p>每个子节点应回答父节点的“为什么、是什么、怎么做或如何验证”，从而保持可归纳关系。</p></div>
        <div className={styles.stats}><span>{countNodes(tree)} 个观点</span><button onClick={() => { if (confirm("恢复初始导图？你的编辑将被覆盖。")) { setTree(clone(initialMap)); setSelectedId("root"); localStorage.removeItem(STORAGE_KEY); } }}><RotateCcw size={14}/> 恢复原版</button></div>
      </aside>
    </div>
  </main>;
}

function TreeNode({ node, depth, collapsed, toggle, selectedId, select, matches, querying }: { node: MapNode; depth: number; collapsed: Set<string>; toggle: (id: string) => void; selectedId: string; select: (id: string) => void; matches: Set<string>; querying: boolean }) {
  const hasChildren = Boolean(node.children?.length); const isCollapsed = collapsed.has(node.id) && !querying; const relevant = !querying || matches.has(node.id) || depth === 0;
  if (!relevant) return null;
  return <div className={`${styles.branch} ${depth === 0 ? styles.rootBranch : ""}`}>
    <div className={`${styles.nodeRow} ${depth > 0 ? styles.connected : ""}`}>
      <button className={`${styles.node} ${styles[`depth${Math.min(depth, 4)}`]} ${selectedId === node.id ? styles.selected : ""} ${querying && matches.has(node.id) ? styles.match : ""}`} onClick={(e) => { e.stopPropagation(); select(node.id); }}>
        {node.tag && <small>{node.tag}</small>}<span>{node.title}</span>{node.detail && <i>{node.detail}</i>}
      </button>
      {hasChildren && <button className={styles.collapse} onClick={() => toggle(node.id)} aria-label={isCollapsed ? "展开" : "收起"}>{isCollapsed ? <ChevronRight size={15}/> : <ChevronDown size={15}/>}</button>}
    </div>
    {hasChildren && !isCollapsed && <div className={styles.children}>{node.children!.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} collapsed={collapsed} toggle={toggle} selectedId={selectedId} select={select} matches={matches} querying={querying}/>)}</div>}
  </div>;
}
