import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildWhiteBackgroundGeneration, WHITE_BACKGROUND_PROMPT } from "../lib/white-background";
import { submitAsyncImageEdit } from "../lib/aihubmix";

const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
const source = {
  id: "original", title: "产品原图", prompt: "原来的创新设计指令",
  imageBase64: "data:image/png;base64,c291cmNl"
};

test("white background creates one isolated edit without mutating the source", () => {
  const snapshot = { ...source };
  const request = buildWhiteBackgroundGeneration(source);
  assert.deepEqual(source, snapshot);
  assert.equal(request.productImage.dataUrl, source.imageBase64);
  assert.equal(request.count, 1);
  assert.equal(request.innovationLevel, 0);
  assert.equal(request.useExactPrompt, true);
  assert.equal(request.sizeOverride, "auto");
  assert.equal(request.generationType, "white-background");
  assert.match(request.metadataDescription, /白底图/);
  assert.match(request.requirement, /#FFFFFF/);
  assert.match(request.requirement, /不要重新设计/);
  assert.match(request.requirement, /保持原图宽高比/);
  assert.doesNotMatch(request.requirement, /原来的创新设计指令/);
  assert.equal("referenceImages" in request, false);
});

test("empty, video, and model inputs cannot start a white-background job", () => {
  assert.throws(() => buildWhiteBackgroundGeneration({ ...source, imageBase64: undefined }), /请选择一张/);
  assert.throws(() => buildWhiteBackgroundGeneration({ ...source, assetType: "video" }), /请选择一张/);
  assert.throws(() => buildWhiteBackgroundGeneration({ ...source, assetType: "model3d" }), /请选择一张/);
});

for (const model of ["gpt-image-2", "gpt-image-2.5-sunburst", "gemini-3-pro-image"]) {
  for (const apiMart of [false, true]) {
    test(`white background sends unchanged prompt and source: ${model}, ${apiMart ? "ApiMart" : "edits"}`, async () => {
      const request = buildWhiteBackgroundGeneration(source);
      let calls = 0;
      globalThis.fetch = async (_url, init) => {
        calls++;
        if (apiMart) {
          const body = JSON.parse(String(init?.body));
          assert.equal(body.prompt, WHITE_BACKGROUND_PROMPT);
          assert.equal(body.model, model);
          assert.deepEqual(body.image_urls, [source.imageBase64]);
          assert.equal(body.n, 1);
        } else {
          const body = init?.body as FormData;
          assert.equal(body.get("prompt"), WHITE_BACKGROUND_PROMPT);
          assert.equal(body.get("model"), model);
          assert.equal(body.getAll("image").length, 1);
          assert.equal(await (body.get("image") as Blob).text(), "source");
          assert.equal(body.get("size"), null);
        }
        return Response.json({ id: "white-background-job", status: "queued" });
      };
      const response = await submitAsyncImageEdit({
        baseUrl: apiMart ? "https://example.test/apimart/v1" : "https://example.test/v1",
        apiKey: "test-only", imageModel: model,
        inputImages: [request.productImage.dataUrl], hasProductImage: true,
        prompt: request.requirement, innovationLevel: request.innovationLevel,
        useExactPrompt: request.useExactPrompt, size: request.sizeOverride, quality: "auto"
      });
      assert.equal(response.jobId, "white-background-job");
      assert.equal(calls, 1);
    });
  }
}
