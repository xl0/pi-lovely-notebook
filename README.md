# lovely-notebook

Jupyter notebook tools for coding agents. An agent gets per-cell reads and edits of `.ipynb`
files instead of loading and rewriting the whole notebook JSON.

Why it matters: a real notebook is mostly base64 image blobs and output metadata. Reading the
file burns the context window on noise. These tools give the model a compact structural summary,
cell-scoped edits that preserve everything they don't touch, and images as actual images.

Same tools, three ways to consume them:

| Package | npm | Use |
| --- | --- | --- |
| [`packages/core`](packages/core) | `@xl0/lovely-notebook` | Library: notebook JSON ops + tool runners/schemas |
| [`packages/pi`](packages/pi) | `@xl0/pi-lovely-notebook` | [pi](https://pi.dev) extension |
| [`packages/mcp`](packages/mcp) | `@xl0/lovely-notebook-mcp` | Local stdio MCP server (Claude Code, or any MCP host) |

```bash
pi install npm:@xl0/pi-lovely-notebook                              # pi extension
claude mcp add lovely-notebook -- npx -y @xl0/lovely-notebook-mcp   # MCP server
```

Notebooks are nbformat 4 only. Every tool acts on one cell, selected by `cellId` or 0-based `index`.

## Tools

| Tool | Does |
| --- | --- |
| `notebook_summary` | Structure of the whole notebook: cells, ids, outputs, short previews |
| `notebook_create` | New empty notebook (refuses to overwrite) |
| `notebook_read_cell` | One cell's source, optionally line-sliced |
| `notebook_write_cell` | Replace one cell's source, optionally change its type |
| `notebook_edit_cell` | Exact string replacements inside one cell |
| `notebook_change_cell_type` | code / markdown / raw |
| `notebook_insert` | Insert a cell before or after an anchor (`index: -1` appends) |
| `notebook_delete` | Delete a cell |
| `notebook_move` | Move a cell relative to another |
| `notebook_merge` | Merge with the adjacent same-type cell |
| `notebook_clear_outputs` | Drop outputs, keep source and execution count |
| `notebook_read_cell_output` | One output, as text or image (index optional for single-output cells) |
| `notebook_read_cell_attachment` | One image pasted into a markdown cell, by its `attachment:` key |

Mutations preserve cell ids, metadata, and outputs. Notebooks without cell ids stay that way —
address their cells by index.

Attachments are images stored inside the `.ipynb` itself, keyed by filename — what Jupyter writes
when you paste an image into a markdown cell and reference it as `![](attachment:plot.png)`.

## What the model sees

`notebook_summary` renders the notebook as pseudo-XML headers with source and output previews,
so one call is enough to plan an edit:

```txt
<meta nbformat=4.5 kernel=python3 cells=12 />
<cell index="0" id="20735603" type="md" lines="1">
# 📜 IPython's history obsession
</cell>
<cell index="1" id="57d6942b" type="code" lines="3" outputs="0">
# |hide
import torch
import gc
</cell>
<cell index="3" id="ffd208cf" type="code" lines="2" outputs="1">
# |eval: false
torch.cuda.memory_allocated()
<output index="0" type="execute_result" mime="text/plain">
0
</output>
</cell>
```

Outputs nest inside their cell, and preview text sits inside the element that owns it — so a
line of output like `<lovely_tensors.repr_rgb.RGBProxy>` (a plain Python repr) can't be mistaken
for structure. A tag closes itself only when it really has no content, such as an image-only
output variant.

Previews are capped at 5 lines; the summary itself is paginated with `lineOffset`/`lineLimit`.
Images in outputs, attachments, and markdown `data:` URIs are returned as image content —
resized by pi, size-capped under MCP.

## Development

Requires [bun](https://bun.sh) — development runs straight off the TypeScript source.

```bash
bun install
bun test                 # 97 tests
bun run check            # tsgo --noEmit + biome
bun run tool -- notebook_summary '{"path":"nb.ipynb"}'   # run a tool without an agent
bun run link:pi          # symlink a local pi-mono checkout for development
```

Publishing builds: core emits ESM + `.d.ts`, the MCP server a single node bundle, so neither needs
bun installed to run. Bun consumers still get the source through the `bun` export condition. The
pi extension ships source only — pi is a bun app.

Pi loads the extension from this repo automatically (`pi.extensions` in the root
`package.json`), so a pi session started here dogfoods the working tree.

Architecture and non-obvious details: [CODE.md](CODE.md). Roadmap: [PLAN.md](PLAN.md).
Decisions: [docs/adr](docs/adr).

## Related projects

|  |  |
| --- | --- |
| [Pi Lovely Web](https://github.com/xl0/pi-lovely-web) | `web_search`, `web_fetch`, `web_image` tools |
| [Pi Lovely Dev Tools](https://github.com/xl0/pi-lovely-dev-tools) | interactive debugging helpers `/tool`, `/show-sysprompt`, `/show-context`, `/llm-stats` |
| [Pi Lovely Codex](https://github.com/xl0/pi-lovely-codex) | GPT fast mode and Codex-style `apply_patch` |
| [Pi Lovely IDE](https://github.com/xl0/pi-lovely-ide) | IDE integration |
| [Pi Lovely Config](https://github.com/xl0/pi-lovely-config) | scoped config helpers for Pi extensions |
| [Pi Lovely Comment](https://github.com/xl0/agent-files/tree/master/pi/packages/pi-lovely-comment) | open the last assistant message in your editor and sync edits back into the prompt |
| [Pi Lovely Rename](https://github.com/xl0/agent-files/tree/master/pi/packages/pi-lovely-rename) | automatic and manual session naming |

---

Like this work? [Hire me](https://alexey.work/cv?ref=pi-lovely-notebook)
