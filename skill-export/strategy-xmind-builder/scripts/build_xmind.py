#!/usr/bin/env python3
import argparse
import json
import uuid
import zipfile
from pathlib import Path


def topic(node):
    result = {"id": str(node.get("id") or uuid.uuid4().hex), "class": "topic", "title": str(node["title"])}
    if node.get("detail"):
        result["notes"] = {"plain": {"content": str(node["detail"])}}
    if node.get("tag"):
        result["labels"] = [str(node["tag"])]
    children = node.get("children") or []
    if children:
        result["children"] = {"attached": [topic(child) for child in children]}
    return result


def main():
    parser = argparse.ArgumentParser(description="Build an editable modern XMind file from tree JSON")
    parser.add_argument("input")
    parser.add_argument("--out", required=True)
    parser.add_argument("--sheet-title")
    args = parser.parse_args()
    source = Path(args.input)
    tree = json.loads(source.read_text(encoding="utf-8"))
    sheet_id = "sheet-" + uuid.uuid4().hex
    content = [{
        "id": sheet_id,
        "class": "sheet",
        "title": args.sheet_title or tree["title"],
        "rootTopic": topic(tree),
        "topicPositioning": "right",
    }]
    metadata = {"creator": {"name": "strategy-xmind-builder", "version": "1.0"}, "activeSheetId": sheet_id}
    manifest = {"file-entries": {"content.json": {}, "metadata.json": {}, "manifest.json": {}}}
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("content.json", json.dumps(content, ensure_ascii=False, separators=(",", ":")))
        zf.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False, separators=(",", ":")))
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, separators=(",", ":")))
    print(out.resolve())


if __name__ == "__main__":
    main()
