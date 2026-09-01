import type { CreativeDivergenceRequest, DivergenceStyleId } from "./types";

export type FreeExplorationConcept = {
  concept: string;
  instruction: string;
};

export type DivergenceStyleOption = {
  id: DivergenceStyleId;
  label: string;
  description: string;
  prompt: string;
};

export const DIVERGENCE_STYLES: DivergenceStyleOption[] = [
  {
    id: "precision",
    label: "精密科技",
    description: "几何秩序与精密细节",
    prompt: "精密科技风格：严谨的几何秩序、清晰的结构层级、精确分件、细腻技术细节与克制的高品质 CMF。"
  },
  {
    id: "soft",
    label: "柔和融合",
    description: "连续曲面与亲和体验",
    prompt: "柔和融合风格：连续完整的曲面、自然柔顺的线面过渡、温和比例与更具亲和力的人机体验。"
  },
  {
    id: "dynamic",
    label: "动态运动",
    description: "方向张力与轻量结构",
    prompt: "动态运动风格：具有方向感和速度感的轮廓、富有张力的线面、轻量化结构与富有节奏的细节组织。"
  },
  {
    id: "minimal",
    label: "硬朗机甲",
    description: "切削体块与装甲层次",
    prompt: "硬朗机甲风格：将产品原有功能骨架转化为具有保护性、装配逻辑与量产依据的硬朗结构语言，而不是把产品直接变成机器人、车辆或武器。整体采用低重心、稳定有力的比例，以及楔形、梯形、六边形和多边形等切削几何；保持主表面完整，通过宽倒角、折面转折和 V 形、X 形、Y 形或斜向线建立明确的受力方向与强烈明暗层次。结构按照深色内骨架或底盘、主体承载体块、外层装甲面板与局部护角依次组织，利用包边、悬浮面板、嵌套框架、凹入式功能岛和精确分缝形成清晰层级。屏幕、接口、散热格栅、提手、脚垫、紧固件和防护结构必须与真实功能、散热、维护、握持或抗冲击需求对应，不得作为无意义装饰。CMF 以石墨黑、深灰、枪灰、银灰或冷白为主体，结合哑光工程塑料、细纹金属、橡胶防护件与局部高光黑玻璃，仅用橙色、红色、荧光绿或冷蓝作小面积警示、状态灯和结构强调。整体呈现坚固、精密、专业、战术化但可制造的产品气质。避免随机堆叠装甲片、密集螺丝与散热孔、汽车零件拼贴、无功能灯带、人脸化造型、武器化、过度变形、赛博朋克霓虹和杂乱科幻细节。"
  },
  {
    id: "professional",
    label: "专业工具",
    description: "可靠结构与功能表达",
    prompt: "专业工具风格：可靠耐用的结构表达、明确的功能分区、合理防护与操作细节，以及专业可信的材质搭配。"
  },
  {
    id: "signature",
    label: "医疗亲和",
    description: "柔和洁净与安心体验",
    prompt: "医疗亲和风格：将专业医疗设备的可靠结构用柔和、克制且非压迫性的方式表达。采用稳定简洁的整体比例、连续包覆式壳体、圆角矩形、椭圆与圆形等基础几何，通过大圆角和顺滑曲率形成完整轮廓；使用内嵌功能岛、环形层级、浅凹面和细窄分色带清楚组织屏幕、按钮、接口与操作区域，功能层级明确但不堆叠装饰。CMF 以温润医疗白和浅灰为主体，仅用低饱和薄荷绿、医疗蓝、淡紫或柔和粉作小面积识别色，深灰只用于屏幕、底座与高频接触区；半透明或轻透材质仅用于观察窗、储液仓、防护罩等具有明确功能依据的部位。按钮少而清晰，表面平整、易清洁，整体传达洁净、安心、专业可信与温和亲近。避免卡通玩具感、婴童化、过度圆胖、无功能的软萌造型、复杂分缝、裸露机械、尖锐攻击性、高饱和配色以及全白无层次。"
  },
  {
    id: "modern-minimal",
    label: "现代简约",
    description: "完整主形与克制秩序",
    prompt: "现代简约风格：以完整、安静、易理解的产品主形为核心，通过圆柱、圆角矩形、椭圆或简洁几何体建立清晰比例，优先保留大面积连续表面和干净轮廓。减少不必要的体块切割、装饰线与外露结构，将屏幕、按键、旋钮、出入口、散热和操作区域集中收纳为少量内嵌功能岛、深色玻璃界面或精确开口；分缝沿真实装配边界组织，细窄且克制。线面关系采用柔和大圆角、顺滑曲率与少量明确直线，主次体块层级简洁，细节少而准确。CMF 以温润白、浅灰、银色、深灰和黑色为主，结合细腻哑光塑料、喷砂或拉丝金属与局部高光玻璃，通过明度和质感差异建立层次，仅允许一个小面积低饱和识别色。整体呈现轻盈、理性、精致、日常且不过时的现代产品气质。避免全白无层次、医疗器械化、过度圆胖、廉价家电感、大量按钮、复杂分色、无意义装饰缝、机械堆砌和夸张科技灯效。"
  },
  {
    id: "industrial-rugged",
    label: "工业硬朗",
    description: "金属体块与设备秩序",
    prompt: "工业硬朗风格：以稳定、耐用、可维护的设备属性为核心，采用竖直或横向展开的方整体、厚实矩形体块、清晰平面和有控制的宽倒角建立可靠比例。外壳、框架、门板、底座与功能模块应形成明确的承载关系和装配秩序，大面积金属面保持完整，通过黑色功能带、嵌入式控制面板、把手、检修门、通风区域和精确分缝组织操作层级。结构表达必须服务于承重、防护、散热、清洁、检修和长期使用，不隐藏必要的设备属性，也不把功能件装饰化。CMF 以不锈钢银、拉丝铝、枪灰、石墨黑和深灰为主，搭配耐磨喷涂金属、细纹工程塑料、橡胶支撑与局部黑玻璃，仅用少量冷蓝、绿色或橙色作为状态和安全提示。整体呈现专业、坚固、冷静、精确并具有工程可信度的工业设备气质。避免机甲装甲、军用武器化、汽车零件拼贴、随机折面、密集螺丝、无功能散热孔、RGB 灯效、赛博朋克装饰和笨重失衡的比例。"
  },
  {
    id: "future-sci-fi",
    label: "未来科幻",
    description: "悬浮界面与前瞻科技",
    prompt: "未来科幻风格：从新型交互、智能感知和高度集成的技术体验出发塑造前瞻造型，而不是依靠科幻装饰堆砌。采用连续流线壳体、悬浮或嵌套体块、环形与胶囊形结构、薄边框和被切开的完整曲面，形成轻盈、精准且具有速度感的轮廓；使用大面积深色玻璃界面、隐藏式传感器、无缝触控区、环形状态界面和少量有功能依据的光带，表达设备的感知、反馈、连接或运行状态。结构分缝、接口和紧固方式尽量隐藏或整合，功能区域通过材质、透光和层级自然显现。CMF 以冷白、银灰、钛灰、石墨黑为主体，结合细腻金属、哑光复合材料、烟熏半透明件和局部高光玻璃，使用青蓝、冷绿或橙色作为极少量动态状态光。整体呈现智能、轻量、精密、流动和可信赖的近未来产品气质，同时保持真实人机关系、制造工艺与产品品类。避免飞船化、车辆化、机器人脸谱、武器造型、赛博朋克霓虹、遍布全身的灯带、碎片化机械细节、无意义透明结构和脱离功能的幻想造型。"
  }
];

function resolveQuadrantStyles(styleIds: DivergenceStyleId[]) {
  const selectedStyles = Array.from(new Set(styleIds))
    .slice(0, 4)
    .map((styleId) => DIVERGENCE_STYLES.find((style) => style.id === styleId))
    .filter((style): style is DivergenceStyleOption => Boolean(style));

  if (selectedStyles.length === 1) {
    return Array.from({ length: 4 }, () => selectedStyles[0]);
  }
  if (selectedStyles.length === 2) {
    return [selectedStyles[0], selectedStyles[0], selectedStyles[1], selectedStyles[1]];
  }
  if (selectedStyles.length === 3) {
    const repeatedStyle = selectedStyles[Math.floor(Math.random() * selectedStyles.length)];
    return [...selectedStyles, repeatedStyle];
  }
  return selectedStyles;
}

export function buildCreativeDivergencePrompt({
  productName,
  request
}: {
  productName?: string;
  request: CreativeDivergenceRequest;
}) {
  const quadrantStyles = resolveQuadrantStyles(request.styleIds || []);
  const quadrantNames = ["左上象限", "右上象限", "左下象限", "右下象限"];
  const quadrantStyleInstruction = quadrantStyles.length === 4
    ? [
        "四个象限必须分别严格执行以下风格，不得把多种风格混合成同一款方案：",
        ...quadrantStyles.map((style, index) => `${quadrantNames[index]}：${style.prompt}`)
      ].join("\n")
    : "";
  const referenceWeight = Math.max(0, Math.min(100, Math.round(request.referenceWeight ?? 50)));
  const referenceWeightInstruction = referenceWeight <= 25
    ? "轻度参考：仅借鉴配色、材质和少量细节气质，主体造型仍以原始产品方案为主。"
    : referenceWeight <= 55
      ? "中度参考：明显吸收参考图的线面关系、体块节奏、结构层级、CMF 与细节语言，同时保持原产品的品类、功能和核心识别。"
      : referenceWeight <= 80
        ? "强度参考：系统迁移参考图的造型语法、比例节奏、结构分区、曲面转折、CMF 和细节组织，但不得照搬参考产品的完整轮廓与专属零件。"
        : "极强参考：在不改变原产品品类、核心功能、人机关系和必要接口的前提下，最大化风格一致性，使四款方案都清晰呈现参考图的完整设计语言；仍禁止复制参考产品本身。";
  const styleInstruction = request.referenceImage
    ? `第二张输入图片是风格参考图，参考风格权重为 ${referenceWeight}%。${referenceWeightInstruction} 只提取其中适合当前产品的造型语言、线面关系、体块节奏、结构层级、细节组织、材质、配色与表面处理，并转化为当前产品自己的设计语言。不得复制参考图的产品品类、完整外形、功能结构、按钮接口、品牌标识或特定零件。四个象限都采用该参考图所传达的设计风格。`
    : quadrantStyleInstruction;

  if (!styleInstruction) {
    throw new Error("请选择 1 至 4 种创意风格，或上传一张风格参考图。");
  }

  const prompt = [
    productName?.trim() ? `产品名称：${productName.trim()}。` : "",
    "第一张输入图片是需要进行创意发散的原始产品设计方案，是最终设计主体。",
    styleInstruction,
    `基于原始方案进行高质量工业设计创新发散。准确识别并保持原产品的品类、核心功能、必要结构、人机关系与使用方式，不得变成其他产品，也不得简单复制原造型。

在一张图中呈现四款完整方案，采用等大的四象限构图，每个象限一款产品三分之四视角效果图。严格按照上述四象限风格分配进行设计；即使某些象限采用相同风格，也必须分别从整体轮廓与比例、主次体块与曲面、结构分区与功能细节、品牌特征与 CMF 等方向形成明显不同的完整设计。

每款方案都要系统推敲整体轮廓、体块关系、线面转折、装配分缝、功能细节和 CMF，使造型、结构与细节形成统一的设计语言。差异必须来自造型架构和设计逻辑，不能只更换颜色、材质、装饰纹理或局部零件。创新应大胆但符合真实结构、制造工艺与量产逻辑，避免汽车零件式拼贴、无功能装饰、无关结构、机械堆砌和过度科幻。

画面采用统一尺度、统一视角、统一摄影棚灯光和干净浅色背景，四款产品完整显示且互不遮挡，专业 KeyShot 级产品渲染，真实材质，细节清晰。四个象限之间不使用分割线、边框或卡片底板；不要方案代号、标题、说明文字、品牌 Logo、水印及任何字符。`
  ].filter(Boolean).join("\n");

  return {
    prompt,
    quadrantStyleLabels: request.referenceImage
      ? Array.from({ length: 4 }, () => "风格参考图")
      : quadrantStyles.map((style) => style.label)
  };
}

export function buildFreeExplorationPrompt({
  productName,
  concepts
}: {
  productName?: string;
  concepts: FreeExplorationConcept[];
}) {
  if (concepts.length !== 4) throw new Error("自由探索需要四条完整设计路线。");
  const quadrantNames = ["左上象限", "右上象限", "左下象限", "右下象限"];
  const routeInstructions = concepts.map(
    (concept, index) => `${quadrantNames[index]}｜${concept.concept}：${concept.instruction}`
  );
  const prompt = [
    productName?.trim() ? `产品名称：${productName.trim()}。` : "",
    "第一张输入图片是当前产品设计方案，也是唯一的产品主体。请严格执行下面已经完成策略分析的四条设计路线，不要自行改题、合并路线或重新选择方向。",
    ...routeInstructions,
    "四条路线都必须保留原产品的品类、核心功能、人机关系、必要接口以及最具辨识度的产品家族基因，但应从整体轮廓、比例、主次体块、结构组织、交互方式、细节逻辑与 CMF 形成有真实产品价值的明显差异。差异不能只靠换色、纹理、装饰件或表面贴图。所有方案必须符合真实结构、制造工艺和量产逻辑。",
    "在一张图中呈现四款完整方案，采用等大的四象限构图：左上、右上、左下、右下各一款。统一尺度、统一三分之四视角、统一摄影棚灯光和干净浅色背景，产品完整显示且互不遮挡，专业工业设计效果图，真实材质，细节清晰。不要分割线、边框、卡片底板、方案代号、标题、说明文字、品牌 Logo、水印或任何字符。"
  ].filter(Boolean).join("\n");

  return {
    prompt,
    quadrantStyleLabels: concepts.map((concept) => concept.concept)
  };
}
