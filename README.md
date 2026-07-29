# 品物AI设计工作站

面向工业设计师、产品设计师和外观设计工作室的 AI 创意工作台。支持产品原图、设计草图和参考图输入，可批量生成外观方案、局部修改、多视图、场景图和设计说明。

## 本地运行

```bash
npm install
npm run dev
```

打开终端显示的本地地址，例如 `http://localhost:3000`。平台认证码由产品内部统一管理。

## AI 服务配置

复制 `.env.example` 为 `.env.local`，填写服务端环境变量：

```txt
PERDESIGN_CHAT_BASE_URL=https://api2.65535.space/v1
PERDESIGN_CHAT_API_KEY=your_chat_api_key_here
PERDESIGN_IMAGE_BASE_URL=https://api2.65535.space/v1
PERDESIGN_IMAGE_API_KEY=your_image_api_key_here
TRIPO_API_KEY=your_tripo_api_key_here
# 可选，默认使用 P1-20260311
TRIPO_MODEL=P1-20260311
```

真实 API Key 只由 Next.js 服务端读取，不会进入前端代码、浏览器存储或 Git 仓库。前端统一请求本项目的 API 路由，再由服务端转发到 OpenAI 兼容供应商。

## 输入图片与创新度

`产品原图` 和 `设计草图` 二选一，用来定义产品结构或草图设计意图；上传后会锁定当前类型，删除图片后才可切换。`参考图` 是可选输入，用来参考 CMF、材质、纹理、细节层级和整体设计语言。

创新度范围为 `0%` 到 `100%`，从结构延续逐步过渡到自由创新。

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
3. 在 Vercel 项目环境变量中设置 `PERDESIGN_CHAT_BASE_URL`、`PERDESIGN_CHAT_API_KEY`、`PERDESIGN_IMAGE_BASE_URL`、`PERDESIGN_IMAGE_API_KEY` 和 `TRIPO_API_KEY`。
4. 部署完成后访问域名，输入口令进入工作台。

图片生成使用异步任务模式，页面会持续查询任务状态并逐张展示结果。

## 常见报错

- `服务器尚未配置文本服务`：检查部署环境是否已设置 `PERDESIGN_CHAT_API_KEY`。
- `服务器尚未配置生图服务`：检查部署环境是否已设置 `PERDESIGN_IMAGE_API_KEY`。
- `服务器尚未配置 Tripo 3D 服务`：检查部署环境是否已设置 `TRIPO_API_KEY`。
- `API Key 无效或权限不足`：检查供应商 Key、余额和模型权限。
- `当前模型不存在或暂不可用`：到 `lib/models.ts` 更换模型 ID。
- `大脑模型没有返回可识别的 JSON 数组`：更换支持图片理解的模型，或降低生成数量后重试。
- `当前生图模型不支持图片编辑接口`：选择支持 image edit 的模型。
- `缺少 爆款原创重构设计师.txt`：确认根目录存在该文件。
- `图片 URL 下载失败`：第三方临时图像链接不可用，重新生成即可。

## 功能检查清单

- 密码锁会把解锁状态保存到本地浏览器。
- 需求、数量、尺寸、质量和创新度会保存到本地浏览器，真实 API Key 仅保存在服务端环境变量中。
- 上传图片会在前端预览，并以 Base64 Data URL 发送给后端。
- 前端不直接请求第三方 AI 服务。
- 后端会统一把图片结果转换成 Base64 Data URL。
- 单张生成失败不会影响其他方案。
- ZIP 会包含 PNG 图片、`prompts.json` 和 `README.txt`。
