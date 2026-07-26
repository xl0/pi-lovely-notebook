# Pi notebook monorepo

Tools for safe `.ipynb` inspection and editing, exposed as a Pi extension and as a
local stdio MCP server over one shared core.

## Layout

Bun workspace (`workspaces: ["packages/*"]`), three independently published `@xl0` packages:

- `packages/core` — `@xl0/lovely-notebook`: notebook JSON logic + adapter-neutral tool layer.
  No Pi/MCP imports; only runtime dep is `typebox` (peer).
- `packages/pi` — `@xl0/pi-lovely-notebook`: Pi extension adapter; core + Pi peers.
- `packages/mcp` — `@xl0/lovely-notebook-mcp`: stdio MCP server; core + MCP SDK + typebox.

Thin adapters keep the Pi and MCP dependency trees isolated. Root `package.json` sets
`pi.extensions: ["./packages/pi/extensions"]` so Pi sessions in this repo dogfood the extension.

Root `README.md` is the project entry point; each package carries its own npm-facing
`README.md` + `LICENSE` (MIT) and full npm metadata, plus `bun run release` to publish it.

## Core

`packages/core/src/notebook.ts` — pure notebook JSON operations, no I/O beyond load/save.

- nbformat 4 only; cell types `code`, `markdown`, `raw`.
- On parse everything is normalized to typed internal shapes: source to one `string`,
  metadata to a typed object, attachments to typed MIME bundles, outputs to a typed union
  (unknown output fields preserved). Save writes Jupyter-style JSON back:
  source as `string[]`, 1-space indent, trailing newline.
- Helpers take 0-based indexes only; selector resolution lives in the tool layer.
- Id policy: no-id notebooks stay no-id, missing ids are never backfilled, inserted cells
  get ids only when the notebook already uses ids or `nbformat_minor >= 5`.
- Summary format: one `meta` line, then a pseudo-XML `<cell>` element per cell (with `atts=`,
  `n_exec` when present, `id` only when stored) containing its source preview and one `<output>`
  element per output MIME variant. Elements self-close only when genuinely empty (image-only
  output variants), so preview text that looks like markup — Python reprs such as
  `<module.Class>` are the common case — cannot be read as structure. Containment is why output
  elements carry no `cell_id`.
- `notebook_read_cell_output` on a rich output with no `mime` uses the same element shape, one
  `<output mime=...>` per variant; image and empty variants self-close, which also tells the
  model an image existed under `includeImages: false`.
- `outputIndex` is optional: omitted means the cell's only output, and more than one output is an
  error naming the count, never a silent pick. 94% of output-bearing cells in the fixtures and
  the lovely-tensors/lovely-numpy notebooks have exactly one output.
- Two conventions, deliberately distinct: pseudo-XML elements for structure, `[...]` notes for
  inline or appended annotations (`[image: mime/type]`, `[N more lines]`, `[Image omitted: ...]`)
  that never claim to contain anything.
- Previews (source and output alike) are bounded three ways: 5 lines with a `[N more lines]`
  marker, 500 chars per line, and `data:` image URIs replaced by `[image: mime/type]` — one
  embedded image is a single line, so the line cap alone does not bound it. `sourceLines` still
  counts raw source, so `lines=` stays consistent with read pagination.

`packages/core/src/tools.ts` — runners + typebox schemas; `src/index.ts` re-exports both.

- Each tool exports one `{ name, description, params, run }` descriptor; adapters and tests
  use that single symbol.
- Schemas are colocated with their runner and never shared. String enums go through a local
  `StringEnum` helper so providers see `type: "string"` + `enum` rather than `anyOf`/`const`.
- `mutateNotebook(path, mutate)` consolidates load → mutate → save.
- `applyExactSourceEdits` follows pi's edit tool: unique matches, no empty `oldText`, no overlaps,
  must change something. No whitespace-fuzzy fallback (pi has one; we stay exact).
- Runners return `NotebookToolContent` (`{type:"text"}` / `{type:"image", data, mimeType}`),
  MCP-shaped and structurally Pi-compatible. Images are raw base64; resizing/capping is
  an adapter concern.
- Also exported for adapters: `notebookToolGuidelines`. Paths are used as given; resolving them
  is the adapter's job, since each host defines cwd differently.

Tools: `notebook_summary`, `notebook_create`, `notebook_read_cell`, `notebook_write_cell`,
`notebook_change_cell_type`, `notebook_edit_cell`, `notebook_insert`, `notebook_delete`,
`notebook_move`, `notebook_merge`, `notebook_clear_outputs`, `notebook_read_cell_output`,
`notebook_read_cell_attachment`. All are single-cell and accept `cellId` or 0-based `index`
(`notebook_insert.index = -1` appends).

Notable tool semantics: read returns raw source only (metadata is summary-only); markdown
`data:` URI images become `[image: mime/type]` markers plus image content; type changes clear
fields invalid for the target type; merge requires an adjacent same-type cell and keeps the
anchor id.

## Adapters

`packages/pi/extensions/notebook/index.ts`

- Table-driven registration: one `notebookTools` entry per core tool holding label, prompt
  snippet, render style; names/descriptions come from the core descriptors.
- Shared tool semantics live once as namespaced guidelines on `notebook_summary`.
- Relative paths resolve against `ctx.cwd`. No `@`-mention stripping (pi's own path tools still
  do it via `stripAtPrefix`; current models don't need it).
- Every tool runs under `withFileMutationQueue(normalizedPath, ...)` — reads too, since Pi
  executes tools in parallel.
- Write/edit capture source before mutation and return diff details rendered with Pi's
  standard source diff UI.
- `resolveContentImages` runs core images through Pi's `resizeImage`; unresizable ones become
  `[Image omitted: ...]` notes.

`packages/mcp/src/server.ts` (`bun packages/mcp/src/server.ts`, or the `lovely-notebook-mcp` bin)

- Low-level SDK `Server` with `tools/list`/`tools/call`; typebox schemas pass through verbatim
  as `inputSchema`, args checked with `Value.Check`; failures return `isError` text.
- One global promise-chain queue: every tool call runs to completion before the next starts.
  Calls are short single-file read-parse-writes, so this costs nothing and preserves call order.
- Relative paths resolve against the server process startup cwd.
- No resizer: images above 4MB base64 become omission notes.

## Tests and tooling

- `bun test` at root: 84 tests, green.
- `packages/core/test/notebook-core.test.ts` covers parse/validation, pure ops, formatting,
  load/save roundtrips. One `notebook-*.tool.test.ts` per tool, one
  `notebook-*.workflow.test.ts` per multi-step flow.
- `packages/pi/test/` covers the resize/omission seam and source diffs;
  `packages/mcp/test/file-queue.test.ts` covers realpath/symlink serialization.
- Fixtures in `packages/core/test/fixtures/`, including `subtly-corrupt-images.ipynb`
  (valid-looking PNG base64 with undecodable IDAT) to pin the raw-vs-omitted image split.
- `bun run tool -- <tool-name> '<json-args>'` prints raw tool output without launching Pi.
- `bun run check` = `tsgo --noEmit` + `biome check`. Biome 2.4.14, git-aware, 140 cols, tabs,
  LF, semicolons as needed. tsconfig is strict (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, ...) and uses `bun-types`.

## Dependency handling

- Pi core packages stay in `peerDependencies` at `"*"` per Pi package docs; registry
  `pi-coding-agent`/`pi-tui` `^0.80.10` sit in devDependencies for typechecking.
- `bun run link:pi` overlays `node_modules/@earendil-works/*` with symlinks to
  `../pi-mono/packages/*` using raw `rm`+`ln -s` (npm link cannot parse bun workspace trees).
  Rerun after `bun install`.
- `bunfig.toml` pins `linker = "hoisted"` so that overlay has one target location.
- `typebox` is pinned to exactly `1.1.38` — the version pi bundles. Hoisting then unifies it
  with the linked pi-mono packages; a different root version makes `bun install` attempt nested
  installs inside the read-only link targets.

## Decisions

ADRs in `docs/adr/`. Core stays pure and adapter-free; publish core once and keep Pi/MCP thin.
Notebook JSON is parsed directly, no nbformat dependency. Tools are one-cell-at-a-time with dual
cellId/index selectors. Outputs are preserved on mutation. No `NotebookSession` abstraction —
`mutateNotebook` covers the only real backend (disk).

## Gaps

- Verification: tests, direct Pi tool calls on a copied fixture, `bun run tool` smoke runs, a
  stub-`ExtensionAPI` registration check, and a full pass of all 13 tools through Claude Code
  against the MCP server (reads, mutations, images, attachments, error paths, concurrent calls).
  The server is registered with Claude Code at local scope for dogfooding, not in the repo.
- Not published to npm yet; READMEs already document the npm install paths. Publish core first
  so the `^0.1.0` core dep in the Pi/MCP packages resolves.
- Pi surfaces raw schema-validator messages instead of friendly allowed-value hints.
- Save always renormalizes notebook JSON formatting, even when it only aims to match Jupyter.
- No-id notebooks depend on index selectors.
- Execution is not implemented; see `PLAN.md`.
