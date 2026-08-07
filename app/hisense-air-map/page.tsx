"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileUp, Focus, Minus, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import styles from "./page.module.css";

type MapNode = { id: string; title: string; detail?: string; tag?: string; children?: MapNode[] };

const productMap: MapNode = {
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

const initialMap: MapNode = {
  id: "research-root",
  title: "海信屏幕空调创新论证全景",
  tag: "研究到定义",
  detail: "从客户提出的“大屏需求”出发，经过问题重构、人群洞察、场景验证、竞争参照与机会收敛，最终推导出“空气可视化空调”的产品定义。",
  children: [
    {
      id: "stage-01-demand", title: "01｜需求整理：客户为什么提出加屏", tag: "研究起点", detail: "先区分客户说出的产品形式与真正希望解决的商业问题，避免直接把“大屏”当作答案。", children: [
        { id: "demand-explicit", title: "显性需求：空调必须增加屏幕", children: [
          { id: "demand-screen", title: "希望以大屏强化科技感" },
          { id: "demand-trend", title: "判断带屏家电是未来趋势" },
          { id: "demand-gap", title: "空调大屏产品较少，存在形式差异" },
          { id: "demand-premium", title: "面向卡萨帝、COLMO 式中高端用户" }
        ]},
        { id: "demand-latent", title: "隐性诉求：屏幕只是实现手段", children: [
          { id: "latent-recognition", title: "在同质化市场建立第一眼识别" },
          { id: "latent-premium", title: "让新品看起来更高端、更智能" },
          { id: "latent-language", title: "形成区别于海尔、美的、格力的产品语言" },
          { id: "latent-topic", title: "增加溢价理由与传播话题" }
        ]},
        { id: "demand-constraints", title: "需求约束：屏幕不能反噬体验", children: [
          { id: "constraint-cost", title: "增加硬件、结构、传感器与研发成本" },
          { id: "constraint-home", title: "必须融入家居，不能像贴了一块平板" },
          { id: "constraint-night", title: "卧室不能形成光线与信息打扰" },
          { id: "constraint-long", title: "新鲜感退去后仍要有使用价值" }
        ]},
        { id: "demand-output", title: "阶段输出：把任务从“设计一块屏”改写为“证明屏幕存在的正当性”", detail: "研究不再询问屏幕能放什么内容，而是询问它能解决哪一种传统界面无法解决的高端价值表达问题。" }
      ]
    },
    {
      id: "stage-02-problem", title: "02｜问题研究：真正的矛盾在哪里", tag: "问题定义", detail: "空调正在售卖越来越多不可见的舒适、健康和算法能力，但用户日常只能看见温度、模式与风速。", children: [
        { id: "problem-category", title: "品类矛盾：空气重要但不可见", children: [
          { id: "problem-multi", title: "舒适由温度、湿度、洁净度、气流、噪音、新风共同决定" },
          { id: "problem-feel", title: "用户能感觉“不舒服”，却难判断原因" },
          { id: "problem-action", title: "不知道问题来自闷、干、直吹、温差还是污染" }
        ]},
        { id: "problem-value", title: "价值矛盾：高端能力“有但不显”", children: [
          { id: "problem-fresh", title: "新风量与换气过程难形成直观判断" },
          { id: "problem-clean", title: "净化、除菌与自清洁日常难验证" },
          { id: "problem-ai", title: "AI 控温做了什么无法被解释" },
          { id: "problem-flow", title: "柔风、无风感与送风覆盖难持续呈现" },
          { id: "problem-energy", title: "节能效果往往到账单出现时才被感知" }
        ]},
        { id: "problem-interface", title: "界面矛盾：现有触点各有缺口", children: [
          { id: "interface-panel", title: "机身灯显：信息过少，只能报参数" },
          { id: "interface-remote", title: "遥控器：适合快捷控制，不适合解释空间状态" },
          { id: "interface-app", title: "App：信息丰富但打开成本高、层级深" },
          { id: "interface-voice", title: "语音：命令快捷，但无法承载复杂可视信息" }
        ]},
        { id: "problem-failure", title: "三条失败假设", children: [
          { id: "failure-entertainment", title: "娱乐屏失败：电视、手机、平板已有更好体验" },
          { id: "failure-remote", title: "大遥控器失败：重复既有控制，无法支撑溢价" },
          { id: "failure-decoration", title: "装饰屏失败：短期吸睛，长期打扰并显得廉价" }
        ]},
        { id: "problem-output", title: "阶段输出：核心问题是高端空气价值不可见、不可懂、不可持续感知" }
      ]
    },
    {
      id: "stage-03-people", title: "03｜人群分析：谁会为这件事买单", tag: "用户洞察", detail: "目标用户不是科技发烧友，而是愿为品质生活付费、希望智能系统替家庭减少判断负担的中高端家庭。", children: [
        { id: "people-profile", title: "基础画像", children: [
          { id: "people-home", title: "装修投入较高，要求家电匹配空间质感" },
          { id: "people-quality", title: "购买标准从耐用升级为生活品质" },
          { id: "people-pay", title: "愿为健康、舒适、安静、设计与智能付费" },
          { id: "people-brand", title: "重视品牌表达与产品体现的家庭品位" }
        ]},
        { id: "people-family", title: "家庭关系带来的关注", children: [
          { id: "people-child", title: "有孩子：关注洁净、温差、直吹与活动区舒适" },
          { id: "people-old", title: "有老人：关注操作简单、怕冷怕风与健康提示" },
          { id: "people-pet", title: "有宠物：关注异味、换气与无人时空气状态" },
          { id: "people-sleep", title: "卧室使用：关注静音、弱光、整夜稳定和不打扰" }
        ]},
        { id: "people-jobs", title: "用户要完成的任务", children: [
          { id: "job-judge", title: "快速判断：现在空气好不好" },
          { id: "job-understand", title: "理解原因：为什么会闷、干、冷或不舒服" },
          { id: "job-decide", title: "减少决策：下一步应该开新风、除湿还是调风" },
          { id: "job-confirm", title: "获得确认：机器正在正确照顾家人" },
          { id: "job-prove", title: "感知回报：多花的钱确实创造了价值" }
        ]},
        { id: "people-tensions", title: "购买与使用张力", children: [
          { id: "tension-function", title: "想要功能丰富，但不想学习复杂模式" },
          { id: "tension-smart", title: "想要主动智能，但不接受黑箱决策" },
          { id: "tension-tech", title: "想要科技感，但不希望家里多一个注意力中心" },
          { id: "tension-health", title: "重视健康，但不希望界面制造焦虑" }
        ]},
        { id: "people-output", title: "阶段输出：用户购买的是“空气被照顾的确定感”，不是屏幕本身" }
      ]
    },
    {
      id: "stage-04-scenes", title: "04｜场景研究：价值在何时成立", tag: "情境验证", detail: "用高频生活场景检查屏幕是否真的能降低理解成本、解释机器行为并提升安心，而不是只在发布会与门店里好看。", children: [
        { id: "research-scene-living", title: "客厅会客：多人导致闷与空气下降", children: [
          { id: "living-trigger", title: "触发：人数增加、CO₂ 上升、温度分布变化" },
          { id: "living-question", title: "用户问题：为什么开着空调仍然闷" },
          { id: "living-proof", title: "验证价值：识别变化、建议新风、展示循环过程" }
        ]},
        { id: "research-scene-child", title: "儿童活动：健康与直吹焦虑", children: [
          { id: "child-trigger", title: "触发：孩子在地面或局部区域持续活动" },
          { id: "child-question", title: "用户问题：温湿度、洁净与风向是否合适" },
          { id: "child-proof", title: "验证价值：活动区舒适、避风与空气状态可视" }
        ]},
        { id: "research-scene-sleep", title: "夜间睡眠：需要守护但拒绝打扰", children: [
          { id: "sleep-trigger", title: "触发：入睡、深夜温度变化与晨起" },
          { id: "sleep-question", title: "用户问题：整夜是否稳定、会不会着凉或被光打扰" },
          { id: "sleep-proof", title: "验证价值：睡前确认、入睡隐退、晨起复盘" }
        ]},
        { id: "research-scene-rain", title: "梅雨除湿：过程慢且难感知", children: [
          { id: "rain-trigger", title: "触发：高湿、黏闷、衣物与墙面潮湿" },
          { id: "rain-question", title: "用户问题：除湿是否有效、多久进入舒适区" },
          { id: "rain-proof", title: "验证价值：显示湿度趋势与舒适区形成" }
        ]},
        { id: "research-scene-energy", title: "高温节能：舒适与省电难权衡", children: [
          { id: "energy-trigger", title: "触发：持续高温与长时间运行" },
          { id: "energy-question", title: "用户问题：AI 调节是否真的更省" },
          { id: "energy-proof", title: "验证价值：解释运行策略并反馈节能趋势" }
        ]},
        { id: "scene-output", title: "阶段输出：屏幕价值必须贯穿“发现状态—理解原因—接受建议—确认结果”" }
      ]
    },
    {
      id: "stage-05-competition", title: "05｜竞品分析：市场已经做到哪一步", tag: "竞争参照", detail: "既看空调行业的直接竞争，也看汽车、冰箱和智能中控如何塑造用户对高端屏幕的判断标准。", children: [
        { id: "competition-direct", title: "直接竞品：能力趋同，表达仍弱", children: [
          { id: "direct-brands", title: "海尔 / 卡萨帝 / 美的 / COLMO / 格力" },
          { id: "direct-common", title: "共同重点：舒适风、新风健康、AI、能效、静音、全屋互联" },
          { id: "direct-display", title: "显示形态：以小屏、灯显与状态栏为主" },
          { id: "direct-gap", title: "空白：尚未普遍建立“屏幕为什么存在”的系统答案" }
        ]},
        { id: "competition-car", title: "智能汽车：屏幕形成系统掌控感", children: [
          { id: "car-learn", title: "可借鉴：状态、能耗、安全与建议的组织能力" },
          { id: "car-limit", title: "不可照搬：空调交互频率更低，不能做复杂座舱" }
        ]},
        { id: "competition-fridge", title: "智能冰箱：家电屏可承担家庭管理", children: [
          { id: "fridge-learn", title: "可借鉴：长期记录、家庭信息与设备协同" },
          { id: "fridge-limit", title: "不可照搬：空调必须聚焦空气，不能泛化成家庭平板" }
        ]},
        { id: "competition-control", title: "语音与中控屏：交互触点应分工", children: [
          { id: "control-voice", title: "语音负责低成本即时命令" },
          { id: "control-app", title: "App 负责远程与复杂设置" },
          { id: "control-screen", title: "机身屏负责空间状态反馈与决策解释" }
        ]},
        { id: "competition-brand", title: "品牌位置：海信有独特进入理由", children: [
          { id: "brand-casarte", title: "卡萨帝偏奢华生活与高端套系" },
          { id: "brand-colmo", title: "COLMO 偏理性、冷峻与 AI 科技" },
          { id: "brand-hisense", title: "海信可连接显示科技与空气科技" }
        ]},
        { id: "competition-output", title: "阶段输出：竞争壁垒不在屏幕尺寸，而在信息体系、转译能力与品牌叙事" }
      ]
    },
    {
      id: "stage-06-synthesis", title: "06｜机会收敛：从证据推导产品机会", tag: "分析结论", detail: "将需求、人群、场景与竞争证据交叉，筛选同时具备用户价值、品类相关性、品牌合理性和商业持续性的方向。", children: [
        { id: "synthesis-criteria", title: "机会筛选的四个标准", children: [
          { id: "criteria-user", title: "用户价值：减少理解与决策负担" },
          { id: "criteria-category", title: "品类相关：只围绕空气、舒适与健康" },
          { id: "criteria-brand", title: "品牌合理：发挥海信显示技术认知" },
          { id: "criteria-business", title: "商业持续：可溢价、可演示、可分级、可系列化" }
        ]},
        { id: "synthesis-chain", title: "核心推导链", children: [
          { id: "chain-1", title: "空气能力不可见 → 高端价值难感知" },
          { id: "chain-2", title: "参数复杂难懂 → 需要生活语言翻译" },
          { id: "chain-3", title: "AI 行为不可知 → 需要状态反馈与决策解释" },
          { id: "chain-4", title: "公共与私密空间不同 → 柜机和挂机必须分化" },
          { id: "chain-5", title: "海信拥有显示资产 → 有资格定义空气可视化" }
        ]},
        { id: "synthesis-reject", title: "排除的方向", children: [
          { id: "reject-video", title: "排除娱乐大屏：与品类无关且有更好替代" },
          { id: "reject-control", title: "排除万能中控：边界过宽且使用动机不足" },
          { id: "reject-light", title: "排除纯视觉炫技：无法形成长期价值与信任" }
        ]},
        { id: "synthesis-opportunity", title: "收敛出的产品机会", children: [
          { id: "opportunity-visible", title: "把空气状态与气流变得可见" },
          { id: "opportunity-readable", title: "把技术参数变成生活语言" },
          { id: "opportunity-action", title: "把 AI 判断变成可接受的行动建议" },
          { id: "opportunity-long", title: "用记录让高端价值持续被感知" },
          { id: "opportunity-system", title: "从单机屏幕延展为空气管理系统" }
        ]},
        { id: "synthesis-output", title: "阶段输出：应定义“空气可视化空调”，而不是“大屏空调”", detail: "屏幕硬件只是承载形式，真正的产品是空气状态表达、建议、记录与全屋协同构成的交互系统。" }
      ]
    },
    { ...productMap, id: "stage-07-product", title: "07｜产品定义与创新策略：海信空气感知屏空调", tag: "推导结果" }
  ]
};

const STORAGE_KEY = "hisense-air-mindmap-v2";
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["stage-01-demand", "stage-02-problem", "stage-03-people", "stage-04-scenes", "stage-05-competition", "stage-06-synthesis", "stage-07-product", "scenario"]));
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(.78);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef({ pointerId: -1, startX: 0, startY: 0, originX: 0, originY: 0 });

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
  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, input, textarea, label")) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || dragRef.current.pointerId !== event.pointerId) return;
    setPan({ x: dragRef.current.originX + event.clientX - dragRef.current.startX, y: dragRef.current.originY + event.clientY - dragRef.current.startY });
  };
  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current.pointerId = -1;
    setIsPanning(false);
  };

  return <main className={styles.app}>
    <header className={styles.header}>
      <div className={styles.brand}><div className={styles.mark}>A</div><div><p>HISENSE AIR INTERFACE</p><h1>空气感知屏 · 战略思维导图</h1></div></div>
      <div className={styles.toolbar}>
        <label className={styles.search}><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索观点或关键词"/>{query && <button onClick={() => setQuery("")}><X size={14}/></button>}</label>
        <button onClick={() => setZoom((z) => Math.max(.42, z - .08))} aria-label="缩小"><Minus size={17}/></button><span className={styles.zoom}>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((z) => Math.min(1.25, z + .08))} aria-label="放大"><Plus size={17}/></button>
        <button onClick={() => { setZoom(.78); setPan({ x: 0, y: 0 }); }} title="适应视图"><Focus size={17}/></button><button onClick={download} title="导出"><Download size={17}/></button><button onClick={() => fileRef.current?.click()} title="导入"><FileUp size={17}/></button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => importFile(e.target.files?.[0])}/>
      </div>
    </header>

    <section className={styles.context}>
      <div><span>核心判断</span><strong>“大屏空调”只是产品形式，“空气可视化空调”才是产品机会。</strong></div>
      <p>从机会判断 → 用户矛盾 → 产品定义 → 体验系统 → 产品路线 → 场景验证 → 商业闭环</p>
    </section>

    <div className={styles.workspace}>
      <div className={`${styles.canvas} ${isPanning ? styles.panning : ""}`} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
        <div className={styles.panHint}>按住空白处拖动视角</div>
        <div className={styles.mapWrap} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
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
