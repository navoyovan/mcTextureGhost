---
trigger: model_decision
description: Optional Graphify navigation for unfamiliar cross-file dependencies and architecture questions.
---

## Graphify

- For known-file edits, go directly to source. Use Graphify for unfamiliar relationships when `graphify-out/graph.json` exists and its CLI or MCP tools are available.
- Prefer scoped queries: `graphify query "<question>"` / `query_graph`, `graphify path "<A>" "<B>"` / `shortest_path`, or `graphify explain "<concept>"` / `get_node`. Check the installed tool's help/schema before using unfamiliar options.
- Treat graph results and `graphify-out/wiki/index.md` as navigation hints, not source authority. Verify relevant source and contracts before editing. Read `GRAPH_REPORT.md` only for broad reviews or when scoped queries are insufficient.
- If the graph or tooling is unavailable, use targeted source search immediately. Do not repeatedly probe, install tools, or regenerate the graph just to complete a small edit.
- After a completed batch of code changes, refresh an existing graph once with `graphify update .` if the installed CLI supports it. Confirm its behavior and any API/network costs first; report a skipped or failed refresh rather than blocking the task. Documentation-only changes do not require a refresh.
- Keep generated graphs and caches untracked; `.gitignore` owns their exclusions. Do not load the entire graph into context.