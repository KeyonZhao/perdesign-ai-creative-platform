# 品物AI设计工作站

面向工业设计师、产品设计师和外观设计工作室的本地网页工作台。上传一张产品图，填写 AIHubMix API Key 和变款要求，也可以额外上传参考图并调整参考权重。系统会先用大脑模型分析产品图、参考图和需求并生成英文生图 Prompt，再用图片编辑模型批量生成外观方案。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`，默认访问口令是 `8888`。

## AIHubMix API Key

在左侧 `AIHubMix API Key` 输入框填写自己的 Key。Key 会保存在当前浏览器的 `localStorage`，不会写入数据库或服务端环境变量。前端只请求本项目的 Next.js API 路由，由后端中转到 AIHubMix。

## 参考图和参考权重

`产品图` 是必须上传的主图，用来保持产品品类、结构比例和视角。`参考图` 是可选输入，用来参考 CMF、材质、纹理、细节层级和整体设计语言。

参考权重范围为 `0%` 到 `100%`。权重越高，大脑模型越会强调参考图的视觉语言；即使权重较高，系统提示词仍会要求保留产品图的结构、比例和视角。

## 修改访问密码

复制 `.env.example` 为 `.env.local`，修改：

```txt
NEXT_PUBLIC_APP_LOCK_PASSWORD=8888
```

访问密码只是交付客户时的轻量门槛，不是强安全系统。

## 修改模型列表

模型配置在 `lib/models.ts`：

- `brainModels`：用于提示词优化、图片理解和批量 Prompt 生成。
- `imageModels`：用于图片编辑生成，必须支持 `/v1/images/edits`。

## 修改系统提示词

核心提示词文件在项目根目录：

```txt
爆款原创重构设计师.txt
```

后端每次生成前都会读取它。如果文件不存在，前端会显示缺失提示。

## 部署到 Vercel

1. 推送项目到 Git 仓库。
2. 在 Vercel 导入项目。
3. 在环境变量中设置 `NEXT_PUBLIC_APP_LOCK_PASSWORD`。
4. 部署完成后访问域名，输入口令进入工作台。

图片生成最长可能运行较久，`/app/api/generate/route.ts` 已设置 `runtime = "nodejs"` 和 `maxDuration = 300`。不同 Vercel 套餐的超时限制可能不同。

## 常见报错

- `AIHubMix API Key 无效或权限不足`：检查 Key、余额和模型权限。
- `当前模型不存在或暂不可用`：到 `lib/models.ts` 更换模型 ID。
- `大脑模型没有返回可识别的 JSON 数组`：更换支持图片理解的模型，或降低生成数量后重试。
- `当前生图模型不支持图片编辑接口`：选择支持 image edit 的模型。
- `缺少 爆款原创重构设计师.txt`：确认根目录存在该文件。
- `图片 URL 下载失败`：第三方临时图像链接不可用，重新生成即可。

## 功能检查清单

- 密码锁会把解锁状态保存到本地浏览器。
- API Key、模型、需求、数量、尺寸、质量、参考权重会保存到本地浏览器。
- 上传图片会在前端预览，并以 Base64 Data URL 发送给后端。
- 前端不直接请求 AIHubMix。
- 后端会统一把图片结果转换成 Base64 Data URL。
- 单张生成失败不会影响其他方案。
- ZIP 会包含 PNG 图片、`prompts.json` 和 `README.txt`。
