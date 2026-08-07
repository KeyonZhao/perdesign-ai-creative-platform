import fs from "node:fs";
import vm from "node:vm";
import JSZip from "jszip";

const sourcePath = new URL("./app/hisense-air-map/page.tsx", import.meta.url);
const outputPath = new URL("./海信屏幕空调创新论证全景.xmind", import.meta.url);
const jsonOutputPath = new URL("./海信屏幕空调创新论证全景.json", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");
const start = source.indexOf("const productMap:");
const end = source.indexOf("const STORAGE_KEY", start);
if (start < 0 || end < 0) throw new Error("无法定位导图数据");

const dataCode = source
  .slice(start, end)
  .replace("const productMap: MapNode =", "const productMap =")
  .replace("const initialMap: MapNode =", "const initialMap =")
  .concat("\ninitialMap;");
const tree = vm.runInNewContext(dataCode);
fs.writeFileSync(jsonOutputPath, JSON.stringify(tree, null, 2));

const topic = (node) => {
  const result = {
    id: node.id,
    class: "topic",
    title: node.title,
  };
  if (node.detail) {
    result.notes = { plain: { content: node.detail } };
  }
  if (node.tag) {
    result.labels = [node.tag];
  }
  if (node.children?.length) {
    result.children = { attached: node.children.map(topic) };
  }
  return result;
};

const sheetId = "hisense-air-strategy-sheet";
const content = [{
  id: sheetId,
  class: "sheet",
  title: "海信屏幕空调创新论证全景",
  rootTopic: topic(tree),
  topicPositioning: "right",
}];
const metadata = {
  creator: { name: "Codex", version: "1.0" },
  activeSheetId: sheetId,
};
const manifest = {
  "file-entries": {
    "content.json": {},
    "metadata.json": {},
    "manifest.json": {},
  },
};

const zip = new JSZip();
zip.file("content.json", JSON.stringify(content));
zip.file("metadata.json", JSON.stringify(metadata));
zip.file("manifest.json", JSON.stringify(manifest));
const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.writeFileSync(outputPath, buffer);
console.log(outputPath.pathname);
