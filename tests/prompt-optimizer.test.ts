import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { optimizeUserPrompt, OPTIMIZED_PROMPT_MAX_CHARACTERS } from "../lib/aihubmix";

const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
const input = {
  baseUrl: "https://example.test/v1",
  apiKey: "test-only",
  model: "test-primary",
  productName: "巡检机器人",
  userPrompt: "只改为白色，保留原有结构和视角。",
  productImageBase64: "data:image/png;base64,dGVzdA=="
};

function stream(text: string, finish = "stop", error = false) {
  const chunks = [
    { choices: [{ delta: { content: text } }] },
    error ? { error: { message: "test stream interrupted" } } : { choices: [{ finish_reason: finish }] }
  ];
  return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n");
}

test("accepts concise output and retains original requirements and image for the model", async () => {
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.match(body.messages[0].content, /120至220字/);
    assert.match(body.messages[0].content, /最多300个字符/);
    assert.match(body.messages[1].content[0].text, /只改为白色，保留原有结构和视角/);
    assert.equal(body.messages[1].content[1].image_url.url, input.productImageBase64);
    return stream("仅将参考图中的巡检机器人外壳改为白色，保留原有结构、比例和视角，其余不变。");
  };
  assert.match(await optimizeUserPrompt(input), /其余不变/);
  assert.equal(calls, 1);
});

test("accepts exactly 300 Unicode characters including emoji", async () => {
  const text = "白".repeat(299) + "🎨";
  globalThis.fetch = async () => stream(text);
  assert.equal(await optimizeUserPrompt(input), text);
  assert.equal(Array.from(text).length, OPTIMIZED_PROMPT_MAX_CHARACTERS);
});

test("overlong output falls back instead of slicing away final constraints", async () => {
  let calls = 0;
  globalThis.fetch = async () => stream(++calls === 1 ? "白".repeat(301) : "改为白色，其余不变。");
  assert.equal(await optimizeUserPrompt(input), "改为白色，其余不变。");
  assert.equal(calls, 2);
});

test("rejects overlong results after the existing bounded attempts", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return stream("白".repeat(301)); };
  await assert.rejects(optimizeUserPrompt(input), /超过300字上限/);
  assert.equal(calls, 2);
});

test("rejects token-truncated results even when short enough", async () => {
  globalThis.fetch = async () => stream("白".repeat(100), "length");
  await assert.rejects(optimizeUserPrompt(input), /未完整生成/);
});

test("does not return a timed-out or errored partial prompt", async () => {
  globalThis.fetch = async () => stream("白".repeat(100), "stop", true);
  await assert.rejects(optimizeUserPrompt(input), /test stream interrupted/);
});
