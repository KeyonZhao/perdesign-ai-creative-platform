---
name: strategy-xmind-builder
description: Read long planning, strategy, product, innovation, research, proposal, DOCX, or PDF documents and transform them into high-quality editable XMind mind maps with a complete evidence-to-conclusion argument chain. Use when Codex is asked to read a 策划案/方案/研究报告 and output an XMind file, strategic mind map, logic map, product opportunity map, or a deep hierarchical map that must go beyond copying document chapters.
---

# Strategy XMind Builder

Produce one validated `.xmind` file. Do not build a website unless the user separately requests one.

## Required resources

- Read [references/argument-method.md](references/argument-method.md) before designing the tree.
- Read [references/tree-schema.md](references/tree-schema.md) before writing map JSON.
- Read [references/quality-rubric.md](references/quality-rubric.md) before validation.
- Read [references/hisense-example.md](references/hisense-example.md) when the input concerns product innovation, brand strategy, user research, or competitive strategy.

## Workflow

Follow every gate in order. Never jump from the document directly to XMind.

### 1. Extract the whole document

Run:

```bash
python scripts/extract_document.py INPUT --out WORKDIR/extracted.json --markdown WORKDIR/extracted.md
```

Use the workspace-bundled Python runtime when available. Read the entire extracted Markdown, including tables. Confirm paragraph, heading, and table counts. If extraction is incomplete, fix extraction before continuing.

### 2. Build a content ledger

Create `content-ledger.md` with one record per important information unit:

- source location;
- information type: demand, problem, audience, scene, competitor, evidence, opportunity, product, execution, business, or risk;
- one-sentence claim;
- supporting evidence/examples;
- object affected;
- causal input and output;
- priority: core, important, supplementary.

Merge repeated claims but preserve their separate evidence. Do not invent facts or citations.

### 3. Design the argument blueprint

Create `argument-blueprint.md` before writing node JSON. Default to:

1. Demand clarification
2. Problem research
3. Audience analysis
4. Scenario research
5. Competitor and cross-industry analysis
6. Opportunity synthesis
7. Product definition and strategy

Adapt labels to the source, but preserve the progression from evidence to conclusion. Each stage must state its research question, analysis dimensions, key claims, evidence, and stage output.

### 4. Author the tree JSON

Create `mindmap.json` using the schema in `references/tree-schema.md`.

Hard rules:

- Never copy the source table of contents as the map structure.
- Never begin with the final product definition when the source contains upstream research.
- Make every child logically summarizable by its parent.
- Keep siblings on one classification dimension.
- Write claims as titles, not vague category nouns.
- Put reasons, evidence, examples, boundaries, and actions in `detail`.
- Trace every proposed feature to a problem, user job, scene, or competitive opportunity.
- Preserve important risks and countermeasures.
- Target 4–7 meaningful levels and normally 80–180 nodes for a long planning document. Use fewer only when the source is short.

### 5. Validate the tree

Run:

```bash
python scripts/validate_tree.py WORKDIR/mindmap.json --report WORKDIR/tree-report.json
```

Fix all errors. Review warnings manually. Then audit at least every L0–L3 parent and all high-priority branches against the content ledger. Do not accept a score below 85.

### 6. Build and validate XMind

Run:

```bash
python scripts/build_xmind.py WORKDIR/mindmap.json --out OUTPUT.xmind
python scripts/validate_xmind.py OUTPUT.xmind
```

The XMind must preserve titles, details as topic notes, tags as labels, ordering, and full hierarchy.

### 7. Final coverage gate

Before delivery, verify:

- all core source claims appear in the ledger and map;
- the map visibly explains why the conclusion follows;
- no major branch is a chapter-title collage;
- stage outputs bridge to the next stage;
- product functions trace back to evidence;
- business value and risk controls are present when the source contains them;
- the `.xmind` file opens structurally and its topic count matches the JSON.

Return only the `.xmind` file as the primary deliverable. Mention node count and top-level argument stages briefly. Do not return intermediate files unless requested.

## Stop conditions

Stop and ask the user only when the source file is missing, unreadable, password-protected, or so incomplete that the requested reasoning cannot be grounded. Do not stop for ordinary ambiguity; make conservative, explicit structural judgments and continue.
