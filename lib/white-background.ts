import type { GenerationResult } from "./types";

export const WHITE_BACKGROUND_PROMPT = "仅将输入图片的背景替换为纯白色（#FFFFFF），生成单张产品白底图。保留原产品的造型、结构、比例、配色、材质、标识和所有可见细节，以及原拍摄视角和主体位置；不要重新设计、增删零件或把产品本身变白。移除背景场景与无关道具，产品孔洞中的背景也需去除，细小结构和透明部件边缘自然干净。保持原图宽高比和主体完整性，不裁切、不拉伸；主体原本被裁切时不要臆造缺失部分。背景无渐变、纹理、场景或新增文字，仅在产品接地处保留轻微自然接触阴影。";

export function buildWhiteBackgroundGeneration(result: GenerationResult) {
  if (!result.imageBase64 || result.assetType === "video" || result.assetType === "model3d") {
    throw new Error("请选择一张可用图片生成白底图。");
  }
  return {
    productImage: { name: `${result.title || "原图"}.png`, dataUrl: result.imageBase64 },
    requirement: WHITE_BACKGROUND_PROMPT,
    metadataDescription: "生成白底图：保留产品外观，将背景替换为纯白。",
    innovationLevel: 0,
    count: 1,
    generationType: "white-background" as const,
    // Do not append product redesign, sketch, or structure mode instructions.
    useExactPrompt: true,
    sizeOverride: "auto"
  };
}
