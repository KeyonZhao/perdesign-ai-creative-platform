import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAccount, login } from "../lib/accounts";
import { POST as generate } from "../app/api/generate/route";
import { POST as optimize } from "../app/api/optimize-prompt/route";
import { buildStructureDesignInstruction } from "../lib/structure-design";

const nativeFetch = globalThis.fetch;
const environment = { ...process.env };
const image = "data:image/png;base64,c3RydWN0dXJl";
const reference = "data:image/png;base64,cmVmZXJlbmNl";
let token = "";
before(async () => {
  process.env.PINWU_ACCOUNT_MODE = "accounts";
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.VERCEL;
  delete process.env.PINWU_PRIVATE_BLOB_TOKEN;
  delete process.env.PINWU_APP_ORIGIN;
  process.env.PINWU_LOCAL_DATA_DIR = await mkdtemp(path.join(tmpdir(), "pinwu-structure-test-"));
  process.env.PERDESIGN_IMAGE_API_KEY = "test-only";
  process.env.PERDESIGN_CHAT_API_KEY = "test-only";
  process.env.PERDESIGN_IMAGE_BASE_URL = "https://example.test/v1";
  process.env.PERDESIGN_CHAT_BASE_URL = "https://example.test/v1";
  await createAccount("structure-test", "结构图测试", "test-password-123456");
  token = (await login("structure-test", "test-password-123456", "test-ip")).token;
});
afterEach(() => { globalThis.fetch = nativeFetch; });
after(() => { process.env = environment; });

function request(route: string, payload: object) {
  return new Request(`http://localhost:3001${route}`, {
    method: "POST",
    headers: { origin: "http://localhost:3001", cookie: `pinwu_session=${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}
const payload = {
  imageApiKey: "server-managed", imageApiBaseUrl: "https://example.test/v1",
  imageModel: "gpt-image-2", productInputMode: "structure", imageBase64: image,
  referenceImageBase64s: [reference], innovationLevel: 100,
  requirement: "保持镜头外露，设计完整外壳。", count: 1, size: "1024x1024", quality: "auto"
};

test("structure optimizer API passes image role, fixed packaging and 300-character limit", async () => {
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const content = body.messages[1].content;
    assert.match(content[0].text, /是内部结构图/);
    assert.match(content[0].text, /创新度100%只控制外壳造型/);
    assert.match(content[0].text, /不能擅自移动、缩小、删除或替换内部组件/);
    assert.match(body.messages[0].content, /最多300个字符/);
    assert.equal(content[1].image_url.url, image);
    assert.equal(content[2].image_url.url, reference);
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "保留器件布局与镜头视野，围绕结构设计连贯的新外壳。" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
  };
  const response = await optimize(request("/api/optimize-prompt", {
    apiKey: "server-managed", baseUrl: "https://example.test/v1", model: "test-model",
    productInputMode: "structure", productImageBase64: image, referenceImageBase64s: [reference], innovationLevel: 100
  }));
  assert.equal(response.status, 200);
  assert.match((await response.json()).optimizedPrompt, /保留器件布局/);
});

for (const model of ["gpt-image-2", "gpt-image-2.5-sunburst", "gemini-3-pro-image"]) {
  test(`structure generation sends source and reference in order for ${model}`, async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://example.test/v1/images/edits");
      const body = init?.body as FormData;
      const prompt = String(body.get("prompt"));
      assert.match(prompt, /结构图模式/);
      assert.match(prompt, /保持镜头外露/);
      assert.doesNotMatch(prompt, /Innovation level is extreme|Preserve the source product/);
      const images = body.getAll("image") as Blob[];
      assert.equal(images.length, 2);
      assert.equal(await images[0].text(), "structure");
      assert.equal(await images[1].text(), "reference");
      return Response.json({ id: "structure-job", status: "queued" });
    };
    const response = await generate(request("/api/generate", { ...payload, imageModel: model }));
    assert.equal(response.status, 202);
    assert.equal((await response.json()).jobId, "structure-job");
  });
}

test("ApiMart transport also carries structure semantics and both images", async () => {
  process.env.PERDESIGN_IMAGE_BASE_URL = "https://example.test/apimart/v1";
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.match(body.prompt, /结构图模式/);
      assert.deepEqual(body.image_urls, [image, reference]);
      return Response.json({ id: "structure-job", status: "queued" });
    };
    assert.equal((await generate(request("/api/generate", payload))).status, 202);
  } finally {
    process.env.PERDESIGN_IMAGE_BASE_URL = "https://example.test/v1";
  }
});

test("legacy product and sketch submissions keep their original instructions", async () => {
  for (const sketch of [false, true]) {
    globalThis.fetch = async (_url, init) => {
      const prompt = String((init?.body as FormData).get("prompt"));
      assert.doesNotMatch(prompt, /结构图模式/);
      assert.match(prompt, sketch ? /产品线稿草图/ : /Preserve the source product/);
      return Response.json({ id: "legacy-job", status: "queued" });
    };
    const response = await generate(request("/api/generate", {
      ...payload, productInputMode: undefined, innovationLevel: 0,
      imageBase64: sketch ? undefined : image, sketchImageBase64: sketch ? image : undefined
    }));
    assert.equal(response.status, 202);
  }
});

test("all innovation levels preserve internal packaging, including zero", () => {
  for (const level of [0, 30, 50, 70, 100]) {
    const prompt = buildStructureDesignInstruction(level);
    assert.match(prompt, /不能擅自移动、缩小、删除或替换内部组件/);
    assert.match(prompt, /设计全新、完整的产品外壳/);
    assert.match(prompt, /不宣称已完成尺寸、干涉或可制造性验证/);
  }
});
