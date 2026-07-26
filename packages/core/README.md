# @xl0/lovely-notebook

Jupyter notebook operations and agent tool definitions, without the agent. This is the shared
core behind [`@xl0/pi-lovely-notebook`](https://www.npmjs.com/package/@xl0/pi-lovely-notebook)
(pi extension) and [`@xl0/lovely-notebook-mcp`](https://www.npmjs.com/package/@xl0/lovely-notebook-mcp)
(MCP server). Use it directly to expose the same notebook tools in your own harness.

Ships built ESM plus types for node, and the TypeScript source for bun (the `bun` export
condition picks it up). `typebox` is a peer dependency.

```bash
npm add @xl0/lovely-notebook typebox    # or: bun add ...
```

## Tool descriptors

Each tool is one `{ name, description, params, run }` object. `params` is a typebox schema you
can hand to a provider as-is; `run` does the work.

```ts
import { notebookSummaryTool, notebookEditCellTool, notebookToolGuidelines } from "@xl0/lovely-notebook"

const content = await notebookSummaryTool.run({ path: "analysis.ipynb" })
// [{ type: "text", text: "<meta nbformat=4.5 kernel=python3 cells=12 />\n..." }]

await notebookEditCellTool.run({
  path: "analysis.ipynb",
  cellId: "ffd208cf",
  edits: [{ oldText: "lr=1e-3", newText: "lr=3e-4" }]
})
```

Descriptors: `notebookSummaryTool`, `notebookCreateTool`, `notebookReadCellTool`,
`notebookWriteCellTool`, `notebookChangeCellTypeTool`, `notebookEditCellTool`,
`notebookInsertTool`, `notebookDeleteTool`, `notebookMoveTool`, `notebookMergeTool`,
`notebookClearOutputsTool`, `notebookReadOutputTool`, `notebookReadCellAttachmentTool`.

Runners return `NotebookToolContent` — an array of `{type:"text"}` / `{type:"image", data,
mimeType}`, MCP-shaped and structurally compatible with pi. Images come back as raw base64 at
original size: capping or resizing is your adapter's job.

One more export exists for adapters: `notebookToolGuidelines`, model-facing notes about selectors
and tool semantics, worth surfacing once in your prompt or server instructions.

Paths are used as given — resolve them against whatever your host calls the working directory
before calling a runner. Notebook files are not locked either, so if your host runs tools
concurrently, serialize calls per file.

## Notebook API

`notebook.ts` is pure and I/O-light — useful on its own for notebook munging:

```ts
import { loadNotebook, saveNotebook, summarizeNotebook, insertCell } from "@xl0/lovely-notebook"

const nb = await loadNotebook("analysis.ipynb")
insertCell(nb, 0, { type: "markdown", source: "# Results" })
await saveNotebook("analysis.ipynb", nb)
```

Also exported: `parseNotebook`, `createNotebook`, `formatNotebookSummary`, `readCellAtIndex`,
`resolveCellIndex`, `sliceCellSource`, `writeCellSource`, `changeCellType`, `editCellSource`,
`applyExactSourceEdits`, `deleteCell`, `moveCell`, `mergeCell`, `clearCellOutputs`,
`readCellOutput`, `readCellAttachment`, `extractDataUriImages`, `normalizeSource`.

Behavior worth knowing:

- nbformat 4 only; cell types `code`, `markdown`, `raw`. Anything else is rejected on parse.
- Cell helpers take 0-based indexes. Selector (`cellId` vs `index`) resolution lives in the
  tool layer.
- Parsing normalizes to typed internal shapes — source becomes one `string`, outputs and
  attachments become typed unions/bundles. Unknown output fields survive the roundtrip.
- Saving writes Jupyter-style JSON: source split back to `string[]`, 1-space indent, trailing
  newline.
- Cell ids are never invented. A notebook without ids stays without ids, and inserted cells get
  an id only if the notebook already uses ids or is `nbformat_minor >= 5`.

Source, tests, and design notes: https://github.com/xl0/pi-lovely-notebook
