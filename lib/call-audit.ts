import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { query } from "./account-db";
import { accountError, AccountError, requireAccount, requireSameOrigin, type Account } from "./accounts";
import { emergencyMode, ownsEmergencyResource, attachEmergencyResource } from "./emergency-access";

type Context = { user: Account; taskId: string; feature: string; calls: string[] };
const globalAudit = globalThis as typeof globalThis & { pinwuAuditContext?: AsyncLocalStorage<Context> };
const context = globalAudit.pinwuAuditContext ||= new AsyncLocalStorage<Context>();
const features: Record<string, string> = {
  "/api/generate": "图片生成", "/api/free-chat": "自由对话", "/api/research-chat": "策划对话",
  "/api/research-title": "策划标题", "/api/research-mindmap": "思维导图", "/api/research-revise": "策划修订",
  "/api/optimize-prompt": "AI 撰写提示词", "/api/divergence-plan": "创意发散分析",
  "/api/design-description": "设计说明", "/api/video/generate": "视频生成", "/api/upscale": "高清放大",
  "/api/tripo/generate": "图片转 3D", "/api/tripo/convert": "3D 格式转换"
};

export function withAccount(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      requireSameOrigin(request);
      const user = await requireAccount(request);
      const pathname = new URL(request.url).pathname;
      // Explicit incident mode: authenticated work continues without a single DB query.
      // Signed, browser-bound receipts retain ownership checks for newly created tasks.
      if (emergencyMode()) {
        const family=pathname.split("/").slice(0,-1).join("/");
        if(pathname.endsWith("/status")) {
          const body=request.method==="GET"?Object.fromEntries(new URL(request.url).searchParams):await request.clone().json();
          const resource=`${family}:${body.jobId||body.taskId||""}`;
          if(!ownsEmergencyResource(request,user.id,resource))throw new AccountError("此任务不是当前临时工作区创建的，请重新提交。",403);
        }
        if(pathname==="/api/tripo/model"&&!ownsEmergencyResource(request,user.id,new URL(request.url).searchParams.get("url")||""))throw new AccountError("无权读取此模型。",403);
        const response=await handler(request);
        if(response.ok&&response.headers.get("content-type")?.includes("application/json")) {
          const result=await response.clone().json().catch(()=>null);
          const jobId=result?.jobId||result?.taskId;
          if(jobId&&!pathname.endsWith("/status")) {
            const taskFamily=pathname.endsWith("/generate")&&pathname!=="/api/generate"?family:pathname.endsWith("/convert")?family:pathname;
            attachEmergencyResource(response,request,user.id,`${taskFamily}:${jobId}`);
          }
          if(result?.modelUrl)attachEmergencyResource(response,request,user.id,result.modelUrl);
        }
        response.headers.set("Cache-Control","no-store");
        return response;
      }
      const taskId = randomUUID();
      const scope: Context = { user, taskId, feature: features[pathname] || pathname, calls: [] };
      let ownedCallId: string | undefined;
      if (pathname.endsWith("/status")) {
        const body = request.method === "GET" ? Object.fromEntries(new URL(request.url).searchParams) : await request.clone().json();
        const jobId = body.jobId || body.taskId;
        const family = pathname.split("/").slice(0, -1).join("/");
        const routeFeature = features[family] || features[`${family}/generate`];
        const [call] = await query("SELECT id FROM account_calls WHERE job_id=$1 AND user_id=$2 AND (feature=$3 OR feature=$4)", [jobId, user.id, routeFeature, family === "/api/tripo" ? "3D 格式转换" : routeFeature]);
        if (!call) throw new AccountError("此任务不属于当前账号，或是登录系统上线前的历史任务。", 403);
        ownedCallId = call.id;
      }
      // The legacy 3D download proxy accepts a URL, so require an owned result URL.
      if (pathname === "/api/tripo/model") {
        const url = new URL(request.url).searchParams.get("url") || "";
        const [call] = await query("SELECT id FROM account_calls WHERE user_id=$1 AND error=$2 AND status='succeeded'", [user.id, `artifact:${url}`]);
        if (!call) throw new AccountError("无权读取此模型。", 403);
      }
      return await context.run(scope, async () => {
        const response = await handler(request);
        if (response.headers.get("content-type")?.includes("application/json")) {
          const result = await response.clone().json().catch(() => null);
          if (result) {
            const id = ownedCallId || scope.calls.at(-1);
            if (id) {
              const jobId = result.jobId || result.taskId;
              if (jobId && !ownedCallId) await query("UPDATE account_calls SET job_id=$1,status='pending' WHERE id=$2", [String(jobId), id]);
              if (ownedCallId || !jobId) {
                if (result.imageBase64 || result.videoUrl || result.modelUrl) {
                  await query("UPDATE account_calls SET status='succeeded',finished_at=$1 WHERE id=$2", [new Date().toISOString(), id]);
                  // Metadata-only accounting: images are returned to the user's browser,
                  // never copied to the database, local server disk, or Blob storage.
                  // Store non-image output links without downloading untrusted URLs.
                  if (result.modelUrl || result.videoUrl) await query("UPDATE account_calls SET error=$1 WHERE id=$2", [`artifact:${result.modelUrl || result.videoUrl}`, id]);
                } else if (!response.ok || ["failed", "cancelled"].includes(result.status)) {
                  await query("UPDATE account_calls SET status='failed',error=$1,finished_at=$2 WHERE id=$3", [safeError(result.error || "任务失败"), new Date().toISOString(), id]);
                }
              }
            }
          }
        }
        response.headers.set("X-Pinwu-Task-Id", taskId);
        response.headers.set("Cache-Control", "no-store");
        return response;
      });
    } catch (error) { return accountError(error); }
  };
}

function safeError(value: unknown) { return String(value).replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 1000); }
function bodyMetadata(body: RequestInit["body"]) {
  let data: any = {};
  if (body instanceof FormData) data = { model: body.get("model"), prompt: body.get("prompt") };
  else if (typeof body === "string") { try { data = JSON.parse(body); } catch { /* non-JSON upload */ } }
  const message = Array.isArray(data.messages) ? [...data.messages].reverse().find((m: any) => m.role === "user")?.content : "";
  const text = Array.isArray(message) ? message.filter((v: any) => v.type === "text").map((v: any) => v.text).join("\n") : message;
  return { model: String(data.model || data.model_version || data.type || "unknown"), prompt: String(data.prompt || data.input?.prompt || text || "").replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g, "[图片内容不保存]").slice(0, 1000), stream: Boolean(data.stream) };
}

/** Every upstream attempt gets its own UUID, including retries and fallback models. */
export async function auditedFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const scope = context.getStore();
  if (!scope || (init.method || "GET").toUpperCase() !== "POST") return fetch(input, init);
  const url = new URL(String(input));
  if (!url.hostname.endsWith(".65535.space") && url.hostname !== "65535.space" && !url.hostname.endsWith("tripo3d.ai")) return fetch(input, init);
  const id = randomUUID();
  const agent = `Pinwu/1.0 call/${id}`;
  const metadata = bodyMetadata(init.body);
  const headers = new Headers(init.headers);
  headers.set("User-Agent", agent);
  const started = Date.now();
  await query("INSERT INTO account_calls(id,user_id,task_id,feature,provider,model,endpoint,user_agent,prompt,status,started_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'started',$10)", [id, scope.user.id, scope.taskId, scope.feature, url.hostname.endsWith("65535.space") ? "65535" : "tripo", metadata.model, `${url.origin}${url.pathname}`, agent, metadata.prompt, new Date(started).toISOString()]);
  scope.calls.push(id);
  try {
    const response = await fetch(input, { ...init, headers });
    const requestId = response.headers.get("x-request-id") || response.headers.get("request-id");
    await query("UPDATE account_calls SET request_id=$1,http_status=$2,status=$3,latency_ms=$4 WHERE id=$5", [requestId, response.status, response.ok ? "accepted" : "failed", Date.now() - started, id]);
    if (!metadata.stream || !response.ok) {
      const data = await response.clone().json().catch(() => null);
      if (!requestId && typeof data?.request_id === "string") await query("UPDATE account_calls SET request_id=$1 WHERE id=$2", [data.request_id, id]);
      const chat = url.pathname.endsWith("/chat/completions");
      await query("UPDATE account_calls SET status=$1,finished_at=$2,error=$3 WHERE id=$4", [response.ok ? chat ? "succeeded" : "accepted" : "failed", new Date().toISOString(), response.ok ? null : safeError(data?.error?.message || data?.error || `HTTP ${response.status}`), id]);
      return response;
    }
    if (!response.body) return response;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let streamError = "";
    const finish = async (status: string) => query("UPDATE account_calls SET status=$1,finished_at=$2,latency_ms=$3,error=$4 WHERE id=$5", [status, new Date().toISOString(), Date.now() - started, streamError || null, id]);
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) { await finish(streamError ? "failed" : "succeeded"); controller.close(); return; }
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n"); pending = (lines.pop() || "").slice(-64000);
          for (const line of lines) { try { const event = JSON.parse(line.replace(/^data:\s*/, "")); if (event.error) streamError = safeError(event.error.message || event.error); } catch { /* keepalive */ } }
          controller.enqueue(value);
        } catch (error) { streamError = safeError(error instanceof Error ? error.message : error); await finish("interrupted"); controller.error(error); }
      },
      async cancel() { streamError = "客户端中断，费用待账单核对"; await reader.cancel(); await finish("interrupted"); }
    });
    return new Response(stream, { status: response.status, headers: response.headers });
  } catch (error) {
    await query("UPDATE account_calls SET status='interrupted',finished_at=$1,error=$2 WHERE id=$3", [new Date().toISOString(), safeError(error instanceof Error ? error.message : error), id]);
    throw error;
  }
}
