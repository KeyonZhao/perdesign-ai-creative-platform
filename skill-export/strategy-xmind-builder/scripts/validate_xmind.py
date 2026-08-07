#!/usr/bin/env python3
import argparse
import json
import zipfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Validate an XMind package and count topics")
    parser.add_argument("input")
    args = parser.parse_args()
    path = Path(args.input)
    required = {"content.json", "metadata.json", "manifest.json"}
    with zipfile.ZipFile(path) as zf:
        names = set(zf.namelist())
        missing = required - names
        if missing:
            raise SystemExit("Missing XMind entries: " + ", ".join(sorted(missing)))
        content = json.loads(zf.read("content.json"))
        metadata = json.loads(zf.read("metadata.json"))
        json.loads(zf.read("manifest.json"))
    if not isinstance(content, list) or not content or "rootTopic" not in content[0]:
        raise SystemExit("Invalid content.json sheet structure")
    count = 0
    notes = 0
    labels = 0

    def walk(node):
        nonlocal count, notes, labels
        count += 1
        notes += int(bool(node.get("notes")))
        labels += len(node.get("labels") or [])
        for child in (node.get("children") or {}).get("attached", []):
            walk(child)

    walk(content[0]["rootTopic"])
    if metadata.get("activeSheetId") != content[0].get("id"):
        raise SystemExit("activeSheetId does not match the sheet")
    print(json.dumps({"file": str(path.resolve()), "topics": count, "notes": notes, "labels": labels, "valid": True}, ensure_ascii=False))


if __name__ == "__main__":
    main()
