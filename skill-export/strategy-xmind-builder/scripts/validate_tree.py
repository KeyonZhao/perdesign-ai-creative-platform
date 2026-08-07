#!/usr/bin/env python3
import argparse
import json
import re
from collections import Counter
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Audit strategic mind-map tree structure")
    parser.add_argument("input")
    parser.add_argument("--report")
    parser.add_argument("--min-topics", type=int, default=50)
    args = parser.parse_args()
    tree = json.loads(Path(args.input).read_text(encoding="utf-8"))
    ids, titles, errors, warnings, stats = [], [], [], [], {"topic_count": 0, "leaf_count": 0, "max_depth": 0, "detail_count": 0, "wide_nodes": []}

    def walk(node, depth=0, path="root"):
        stats["topic_count"] += 1
        stats["max_depth"] = max(stats["max_depth"], depth)
        node_id = str(node.get("id", "")).strip()
        title = str(node.get("title", "")).strip()
        if not node_id:
            errors.append(f"Missing id at {path}")
        if not title:
            errors.append(f"Missing title at {path}")
        ids.append(node_id)
        titles.append(re.sub(r"\s+", "", title).lower())
        if node.get("detail"):
            stats["detail_count"] += 1
        children = node.get("children") or []
        if not isinstance(children, list):
            errors.append(f"children is not an array at {path}")
            return
        if len(children) > 12:
            stats["wide_nodes"].append({"id": node_id, "title": title, "children": len(children)})
            warnings.append(f"Wide branch ({len(children)} children): {title}")
        if not children:
            stats["leaf_count"] += 1
        for i, child in enumerate(children):
            walk(child, depth + 1, f"{path}/{i}")

    walk(tree)
    duplicate_ids = [k for k, v in Counter(ids).items() if k and v > 1]
    if duplicate_ids:
        errors.append("Duplicate ids: " + ", ".join(duplicate_ids[:20]))
    duplicate_titles = [k for k, v in Counter(titles).items() if k and v > 1]
    if duplicate_titles:
        warnings.append(f"Duplicate normalized titles: {len(duplicate_titles)}")
    top_count = len(tree.get("children") or [])
    if top_count < 5:
        warnings.append(f"Only {top_count} top-level branches; long strategic maps normally need 5–9")
    if stats["topic_count"] < args.min_topics:
        warnings.append(f"Only {stats['topic_count']} topics; expected at least {args.min_topics}")
    if stats["max_depth"] < 4:
        warnings.append(f"Maximum depth is {stats['max_depth']}; meaningful long-form maps normally reach 4+")
    detail_ratio = stats["detail_count"] / max(stats["topic_count"], 1)
    if detail_ratio < 0.18:
        warnings.append(f"Low note coverage: {detail_ratio:.0%}")
    score = 100
    score -= min(50, len(errors) * 15)
    score -= min(25, len(warnings) * 3)
    stats.update({"top_level_count": top_count, "detail_ratio": round(detail_ratio, 3), "duplicate_title_count": len(duplicate_titles)})
    report = {"score": max(0, score), "errors": errors, "warnings": warnings, "stats": stats}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.report:
        Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if errors or score < 85:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
