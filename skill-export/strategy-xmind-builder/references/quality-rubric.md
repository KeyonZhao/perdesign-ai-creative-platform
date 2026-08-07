# Quality Rubric

Score the work before producing XMind.

| Dimension | Weight | Passing condition |
|---|---:|---|
| Source coverage | 25 | Core claims, evidence, scenes, strategies, and risks have no material omissions. |
| Argument completeness | 25 | The conclusion follows from upstream research; the map does not start with the answer. |
| Parent-child logic | 20 | Direct children are accurately summarized by their parent and siblings use one dimension. |
| Node writing | 10 | Titles state claims; notes hold evidence and boundaries; vague noun labels are rare. |
| XMind integrity | 15 | Full hierarchy, notes, labels, order, and topic count survive packaging. |
| Scanability | 5 | Top-level stages show the whole reasoning process and branches have manageable breadth. |

## Hard failure conditions

- The map is a renamed table of contents.
- Product definition appears before available demand, problem, audience, scene, and competitor research.
- Major proposed features cannot be traced to upstream evidence.
- The tree has duplicate IDs or empty titles.
- The XMind package is invalid or loses topics.
- Total score is below 85.
- Argument completeness, parent-child logic, or XMind integrity scores below 80% of their own weight.

## Manual audit sample

Audit all L0–L2 nodes. Then sample at least:

- every core-priority branch;
- all stage outputs;
- all product functions;
- all risk-countermeasure pairs;
- 20% of leaf topics, minimum 15 leaves.

For every sampled node, record pass/fail for summary, same-dimension, information gain, source grounding, and title quality.

## Coverage reconciliation

Compare the content ledger with the final JSON:

- `core`: 100% represented;
- `important`: at least 90% represented or explicitly merged;
- `supplementary`: include when it improves explanation; omission is allowed;
- invented factual claims: 0.
