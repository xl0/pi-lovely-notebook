# Pi notebook monorepo

Goal: notebook tools for safe `.ipynb` inspection and editing, exposed both as a Pi package and as a local MCP server over a shared core.

## Current state

- Repo is a bun workspace monorepo (`workspaces: ["packages/*"]`):
  - `packages/core` (`@xl0/lovely-notebooks`): publishable notebook JSON logic + adapter-neutral tool layer; only runtime dep is `typebox` (peer)
  - `packages/pi` (`@xl0/pi-lovely-notebooks`): publishable Pi adapter; depends on core plus Pi peers
  - `packages/mcp` (`@xl0/lovely-notebooks-mcp`): publishable local stdio MCP adapter; depends on core, `@modelcontextprotocol/sdk`, and `typebox`
- All three packages install independently under the `@xl0` npm scope; thin adapters keep Pi and MCP dependency trees isolated.
- Root `package.json` keeps `pi.extensions: ["./packages/pi/extensions"]` so Pi sessions in this repo load the extension for dogfooding.
- Dependency handling:
  - imported Pi core packages stay in `peerDependencies` with `"*"` ranges in `packages/pi` per Pi package docs; registry `pi-coding-agent` and `pi-tui` `^0.80.10` packages sit in devDependencies for typechecking
  - `bun run link:pi` overlays `node_modules/@earendil-works/*` with symlinks to `../pi-mono/packages/*` (npm link cannot parse bun workspace trees, so the script does raw `rm`+`ln -s`; rerun after `bun install`)
  - `bunfig.toml` pins `linker = "hoisted"` (flat node_modules) so the link overlay has one target location
  - `typebox` is pinned to `1.1.38` exactly (core devDep, `packages/mcp` dep, peer `"*"` in core and `packages/pi`): matches the version pi bundles, so the extension develops against what it runs on, and hoisting unifies with the linked pi-mono packages' exact pin (a different root version makes `bun install` try nested installs inside the read-only link targets)
  - root devDependencies hold only repo-wide tooling (`biome`, `tsgo`, `bun-types`) plus core for `scripts/`; `bun-types` because tests import `bun:test` and helpers use Bun APIs
- Pi extension entry: `packages/pi/extensions/notebook/index.ts`.
  - table-driven registration: one `notebookTools` entry per core tool holding label, prompt snippet, and render style; tool names/descriptions come from core descriptors
  - every notebook tool has compact TUI call rendering that shows selected args; summary has a collapsed text preview with expand hint
  - shared notebook-tool semantics live once on `notebook_summary` as namespaced guidelines (`notebookToolGuidelines` from core)
  - path normalization via core `normalizeNotebookPath`: strips leading `@`, resolves relative paths against `ctx.cwd`
  - mutation tools (per core `mutates` flag) run under `withFileMutationQueue(normalizedPath, ...)` for correctness under Pi's parallel tool execution
  - write/edit capture cell source before mutation and return Pi-local diff details rendered with Pi's standard source diff UI
  - `resolveContentImages` resizes raw core images through Pi's `resizeImage`; unresizable images become `[Image omitted: ...]` notes
- MCP server: `packages/mcp/src/server.ts` (run `bun packages/mcp/src/server.ts`, or the `lovely-notebooks-mcp` bin under bun).
  - low-level SDK `Server` with `tools/list`/`tools/call` handlers; typebox schemas are passed through verbatim as `inputSchema`
  - args validated with typebox `Value.Check`; validation failures and thrown tool errors return `isError` text results
  - per-file promise-chain queue serializes mutations (MCP hosts may call tools concurrently), canonicalizes existing paths through `realpath`, and removes idle queue entries
  - relative paths resolve against the MCP server process startup cwd inherited from its launcher
  - no image resizer in the MCP build: images above 4MB base64 are replaced with omission notes
- Pure notebook logic lives in `packages/core/src/notebook.ts`.
  - exported functions: parseNotebook, loadNotebook, saveNotebook, createNotebook, summarizeNotebook, formatNotebookSummary, readCellAtIndex, resolveCellIndex, sliceCellSource, writeCellSource, changeCellType, editCellSource, applyExactSourceEdits, insertCell, deleteCell, moveCell, mergeCell, clearCellOutputs, readCellOutput, readCellAttachment, extractDataUriImages, normalizeSource
  - `readCellsById` and `readCellRange` removed from public interface (unused by any tool)
  - tool-layer selectors resolve to 0-based cell indexes at the boundary; core mutation/read helpers operate on indexes only
  - display-data MIME splitting/normalization is centralized in one internal helper shared by output summaries and output reads
- Shared tool runners + schemas live in `packages/core/src/tools.ts`; `src/index.ts` re-exports tools + notebook core as the package entry.
  - string-valued enum parameters use a local `StringEnum` helper so providers see `type: "string"` plus `enum`, not `anyOf`/`const` unions
  - index parameters are schema-bounded as non-negative integers, except `notebook_insert.index` also accepts `-1` for append
  - each params schema/type is colocated with its matching runner; no schemas are shared across tools
  - each tool exports a `{ name, description, mutates, params, run }` descriptor; adapters and tests use one public symbol per tool
  - runners return core-local `NotebookToolContent` (`{type:"text"}` / `{type:"image", data, mimeType}`), MCP-shaped and structurally Pi-compatible
  - core returns images raw (base64, unresized); resizing/capping is an adapter concern
  - `notebookToolGuidelines` and `normalizeNotebookPath(rawPath, cwd)` are exported for adapters
  - internal `mutateNotebook(path, mutate)` helper consolidates load → mutate → save for all mutation runners
  - selection helpers keep cellId/index validation, resolution, and confirmation text formatting in the tool layer
- Implemented tools:
  - `notebook_summary({ path, lineOffset?, lineLimit? })`
  - `notebook_create({ path, language? })`
  - `notebook_read_cell({ path, cellId?|index?, lineOffset?, lineLimit?, includeImages? })`
  - `notebook_write_cell({ path, cellId?|index?, type?, source })`
  - `notebook_change_cell_type({ path, cellId?|index?, type })`
  - `notebook_edit_cell({ path, cellId?|index?, edits })`
  - `notebook_insert({ path, cellId?|index?, direction, type, source })`
  - `notebook_delete({ path, cellId?|index? })`
  - `notebook_move({ path, cellId?|index?, targetCellId?|targetIndex?, direction })`
  - `notebook_merge({ path, cellId?|index?, direction })`
  - `notebook_clear_outputs({ path, cellId?|index? })`
  - `notebook_read_cell_output({ path, cellId?|index?, outputIndex, mime?, includeImages? })`
  - `notebook_read_cell_attachment({ path, cellId?|index?, key })`
- Current notebook support:
  - parse notebook JSON directly; require `nbformat === 4` and cell types `code`, `markdown`, or `raw`
  - create/overwrite an empty nbformat 4.5 notebook with `metadata.language_info.name`, defaulting to `python3`
  - source is normalized to one internal `string`; save serializes source back to Jupyter-style `string[]`
  - cell metadata is normalized to a typed JSON object internally
  - attachment containers are normalized to typed MIME bundles internally; attachment MIME values remain JSON values
  - code-cell outputs are normalized to typed output unions internally and validated for known nbformat output types; unknown output fields are preserved on save
  - summarize kernel/language/cells via one `meta` line plus one pseudo-XML cell header per cell; formatted summary supports optional line offset/limit pagination
  - summary/read omit `id` when the notebook cell has no stored id
  - code cell summary headers include `n_exec` only when execution count is present
  - summary preview is raw source text after each cell header, hard-limited to 5 lines; when truncated, it ends with a final `[N more lines]` line
  - summary now includes per-output pseudo-XML headers after each cell preview; output headers include `cell_id` when present, else `cell_index`, use 0-based output indices, rich outputs are flattened to one header per MIME variant, and only text-like variants include up to 5 preview lines
  - read one cell by id or 0-based index, optionally slicing source by line offset/limit; truncated reads append `[N more lines. Use offset=M to continue.]`
  - read tool text output is raw cell source only; cell metadata is only visible through `notebook_summary`
  - source mutation tools are explicitly cell-scoped by name: `notebook_read_cell`, `notebook_write_cell`, `notebook_edit_cell`
  - mutation tools accept id selectors for cells that have ids, and 0-based index selectors for cells that do not
  - no-id notebooks stay no-id on mutation; existing missing ids are not backfilled; inserted cells get ids only when the notebook already uses ids or has `nbformat_minor >= 5`
  - write/edit preserve other cell fields like metadata/outputs and return concise confirmation text; write can optionally change cell type
  - changing cell type preserves source, id, metadata, and attachments where valid; code cells initialize empty outputs/null execution count and remove attachments, while conversion away from code removes code-only fields
  - insert one code/markdown/raw cell before or after an anchor cell id or 0-based index; `index=-1` appends
  - move one cell before or after another cell by id or 0-based index
  - merge one cell with the adjacent same-type cell `above` or `below`, preserving the anchor id and inserting one boundary newline when needed
  - clear outputs from one code cell while preserving source and execution count
  - read one output by 0-based index from a code cell; returns text for text-like mimes, image for binary image mimes (image/png, image/jpeg, etc.); image/svg+xml is returned as text; when `mime` is omitted on rich outputs, all displayable text and images are returned together unless `includeImages: false`
  - read one image attachment from a cell by key; returns image content
  - `notebook_read_cell` on markdown cells extracts `data:` URI images: replaces them with `[image: mime/type]` markers in text and returns decoded images as `ImageContent` items unless `includeImages: false`
  - image-returning tool paths: Pi adapter runs Pi's inline image resizer (unresizable → omission note); MCP adapter caps at 4MB base64
  - `packages/core/test/fixtures/subtly-corrupt-images.ipynb` covers valid-looking PNG base64 whose IDAT payload is not decodable; core passes such images through raw, the Pi adapter test asserts they become omission notes
  - `notebook_summary` lists attachment keys in cell headers via `atts="key1 key2"` attribute
  - save path rewrites notebook JSON in Jupyter-style formatting: source as `string[]`, 1-space JSON indentation, trailing newline
- Tests split by layer:
  - `packages/core/test/notebook-core.test.ts` covers parse/validation, pure cell ops, formatting helpers, load/save roundtrips, save formatting, and fixture-level core behavior
  - `packages/core/test/notebook-*.tool.test.ts` keeps one file per tool for runner/output/selector behavior
  - `packages/core/test/notebook-*.workflow.test.ts` keeps one file per multi-step workflow (write→read parity, no-id mutation flow, real-fixture edit/save)
  - `packages/pi/test/resolve-content-images.test.ts` covers the Pi-side resize/omission seam against the corrupt fixture
  - `packages/pi/test/source-diff.test.ts` covers write/edit cell-source diff details and rendering
  - `packages/mcp/test/file-queue.test.ts` covers serialization across real-path/symlink aliases
  - current suite passes under `bun test` at repo root (84 tests)
- Local tool smoke runner: `bun run tool -- <tool-name> '<json-args>'` prints raw tool text output without launching Pi.
- Biome config lives in `biome.json`.
  - schema migrated to match installed CLI `2.4.14`
  - Git VCS integration enabled so Biome honors repository and nested `.gitignore` files
  - formatter enabled with `lineWidth: 140`, LF endings, tabs, no trailing commas, semicolons `asNeeded`, arrow parens `asNeeded`
  - linter enabled with recommended rules
  - excludes `.ipynb`, `node_modules`, `.git`, and `bun.lock`
  - package scripts: `typecheck`, `check`, `lint`, `format`, `format:check`, `biome:check`
- Type-checking now uses the installed `bun-types` package via `tsconfig.json` `types: ["bun-types"]`.
- `tsconfig.json` is stricter now: `lib: ["ES2022"]`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `useUnknownInCatchVariables`, plus casing/interop/json-module checks.

## Decisions

- Package form: bun workspace monorepo; core, Pi adapter, and MCP server are separate packages shipped independently.
- Publish core once; keep Pi and MCP as thin packages with versioned core dependencies so their unrelated runtime dependencies stay isolated.
- Keep notebook operations in pure functions, adapter glue thin; core stays free of Pi and MCP imports.
- Start with small tool slices: read-only first, then mutation tools.
- No extra runtime deps for notebook parsing; use built-in JSON handling.

## Gaps

- Pi/manual verification is still light; verification includes tests, direct Pi notebook summary/edit/write/read tool calls on a copied real fixture, local `bun run tool` smoke runs, a stub-`ExtensionAPI` registration check, and a stdio JSON-RPC smoke session against the MCP server.
- MCP server is registered with Claude Code at local scope for dogfooding
  (`claude mcp add --scope local lovely-notebooks -- bun <repo>/packages/mcp/src/server.ts`, stored in `~/.claude/.claude.json`, not in the repo);
  `claude mcp list` reports it connected, but real host tool-call exercise is still pending.
- `check` now runs type-checking plus Biome (`bun run typecheck && bun run biome:check`).
- `bun-types` is now installed and type-checking uses it directly.
- Notebook parse/summary/mutation code now satisfies stricter TS + current Biome without non-null assertions.
- Validation errors from Pi surface raw schema-validator messages instead of friendly allowed-value hints.
- Save/mutation path still normalizes notebook JSON shape/format on write, even though it now aims to match common Jupyter formatting.
- Mutation tools on no-id notebooks rely on index selectors; ids are not backfilled.
- Real notebook fixtures live in `packages/core/test/fixtures/`.
- `PLAN.md` now holds the main actionable planning for adding VSCode/Jupyter-backed notebook execution through a same-repo companion bridge extension.
- Path normalization, mutation queueing, and mutation orchestration helper all implemented.
- `ensureCellIds`, `readCellsById`, and `readCellRange` removed from public interface.
