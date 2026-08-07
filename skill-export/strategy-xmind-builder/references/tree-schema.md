# Tree JSON Schema

## Canonical structure

```json
{
  "id": "root",
  "title": "Project argument panorama",
  "detail": "One-sentence description of the whole reasoning task.",
  "tag": "Research to definition",
  "children": [
    {
      "id": "stage-01-demand",
      "title": "01 | Demand clarification: why was this request raised?",
      "detail": "Separate explicit form requests from latent business goals.",
      "tag": "Research start",
      "children": []
    }
  ]
}
```

## Field rules

- `id`: required, unique, stable, lowercase ASCII slug preferred.
- `title`: required, non-empty, normally 8–40 Chinese characters or equivalent.
- `detail`: optional but expected for L0–L2 and claims requiring evidence.
- `tag`: optional role label, not a replacement for the title.
- `children`: optional ordered array. Ordering must reflect reasoning or priority.

## Depth roles

- L0: complete research object.
- L1: argument stages or major strategic modules.
- L2: analysis dimensions within one stage.
- L3: independent claims.
- L4+: evidence, examples, triggers, functions, actions, risks, or countermeasures.

## XMind mapping

- `title` → topic title.
- `detail` → plain topic note.
- `tag` → topic label.
- `children` → attached child topics.

## Minimum structural expectations for long plans

- 5–9 top-level branches.
- At least 4 meaningful levels.
- Normally 80–180 topics; very comprehensive plans may exceed 200.
- No duplicate IDs.
- No empty titles.
- No branch with more than 12 direct children unless it is a deliberate index.
- At least 60% of L1–L2 nodes should have explanatory `detail`.

## Content ledger traceability

Add an optional `source` object during authoring when useful:

```json
"source": {
  "section": "3.2",
  "paragraphs": [188, 211],
  "priority": "core"
}
```

The build script ignores unknown fields, so traceability metadata can remain in JSON without affecting XMind.
