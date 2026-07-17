# Pi notebook package

Goal: Pi package exposing notebook-focused tools for safe `.ipynb` inspection and editing.

## Current state

- Repo root is now the Pi package.
- `package.json` declares a Pi package via `pi.extensions: ["./extensions"]`.
  - Pi core imports stay in `peerDependencies` with `"*"` ranges per Pi package docs, so installed packages use Pi's bundled core modules
  - local development resolves those same Pi packages through `devDependencies` using `file:../pi-mono/packages/*` instead of manual npm/bun links
  - `typebox` is treated like Pi core: `peerDependencies` for runtime, `devDependencies` for local typechecking
  - typechecking uses `@typescript/native-preview` (`tsgo`); no separate `typescript` package is needed
  - `bun-types` remains a dev dependency and is listed in `tsconfig.json` because tests import `bun:test` and helpers use Bun APIs
- Main extension entry: `extensions/notebook/index.ts`.
  - every notebook tool now has a short prompt snippet for discoverability
  - every notebook tool has compact TUI call rendering that shows selected args; summary has a collapsed text preview with expand hint
  - shared notebook-tool semantics live once on `notebook_summary` as namespaced guidelines, so deduped system-prompt guidance keeps notebook scope clear
  - path normalization at the adapter seam: strips leading `@`, resolves relative paths against `ctx.cwd`
  - all mutation tools are wrapped in `withFileMutationQueue(normalizedPath, ...)` for correctness under Pi's parallel tool execution
  - read-only tools are unqueued but still get path normalization
- Pure notebook logic lives in `extensions/notebook/notebook.ts`.
  - exported functions: parseNotebook, loadNotebook, saveNotebook, createNotebook, summarizeNotebook, formatNotebookSummary, readCellAtIndex, resolveCellIndex, sliceCellSource, writeCellSource, editCellSource, applyExactSourceEdits, insertCell, deleteCell, moveCell, mergeCell, clearCellOutputs, readCellOutput, readCellAttachment, extractDataUriImages, normalizeSource
  - `readCellsById` and `readCellRange` removed from public interface (unused by any tool)
  - tool-layer selectors resolve to 0-based cell indexes at the boundary; core mutation/read helpers operate on indexes only
  - display-data MIME splitting/normalization is centralized in one internal helper shared by output summaries and output reads
- Shared tool runners + schemas live in `extensions/notebook/tools.ts`.
  - string-valued enum parameters use Pi-recommended `StringEnum` schemas so providers see `type: "string"` plus `enum`, not `anyOf`/`const` unions
  - index parameters are schema-bounded as non-negative integers, except `notebook_insert.index` also accepts `-1` for append
  - each params schema/type is colocated with its matching runner; no schemas are shared across tools
  - each tool exports a `{ params, run }` descriptor so extension registration and tests use one public symbol per tool
  - internal runner functions return `AgentToolResult["content"]` only; extension glue wraps content with empty `details`
  - internal `mutateNotebook(path, mutate)` helper consolidates load → mutate → save for all mutation runners
  - selection helpers keep cellId/index validation, resolution, and confirmation text formatting in the tool layer
- Implemented tools:
  - `notebook_summary({ path })`
  - `notebook_create({ path, language? })`
  - `notebook_read_cell({ path, cellId?|index?, lineOffset?, lineLimit?, includeImages? })`
  - `notebook_write_cell({ path, cellId?|index?, source })`
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
  - summarize kernel/language/cells via one `meta` line plus one pseudo-XML cell header per cell
  - summary/read omit `id` when the notebook cell has no stored id
  - code cell summary headers include `n_exec` only when execution count is present
  - summary preview is raw source text after each cell header, hard-limited to 5 lines; when truncated, it ends with a final `[N more lines]` line
  - summary now includes per-output pseudo-XML headers after each cell preview; output headers include `cell_id` when present, else `cell_index`, use 0-based output indices, rich outputs are flattened to one header per MIME variant, and only text-like variants include up to 5 preview lines
  - read one cell by id or 0-based index, optionally slicing source by line offset/limit; truncated reads append `[N more lines. Use offset=M to continue.]`
  - read tool text output is raw cell source only; cell metadata is only visible through `notebook_summary`
  - source mutation tools are explicitly cell-scoped by name: `notebook_read_cell`, `notebook_write_cell`, `notebook_edit_cell`
  - mutation tools accept id selectors for cells that have ids, and 0-based index selectors for cells that do not
  - no-id notebooks stay no-id on mutation; existing missing ids are not backfilled; inserted cells get ids only when the notebook already uses ids or has `nbformat_minor >= 5`
  - write/edit preserve other cell fields like metadata/outputs and return concise confirmation text
  - insert one code/markdown/raw cell before or after an anchor cell id or 0-based index; `index=-1` appends
  - move one cell before or after another cell by id or 0-based index
  - merge one cell with the adjacent same-type cell `above` or `below`, preserving the anchor id and inserting one boundary newline when needed
  - clear outputs from one code cell while preserving source and execution count
  - read one output by 0-based index from a code cell; returns text for text-like mimes, image for binary image mimes (image/png, image/jpeg, etc.); image/svg+xml is returned as text; when `mime` is omitted on rich outputs, all displayable text and images are returned together unless `includeImages: false`
  - read one image attachment from a cell by key; returns image content
  - `notebook_read_cell` on markdown cells extracts `data:` URI images: replaces them with `[image: mime/type]` markers in text and returns decoded images as `ImageContent` items unless `includeImages: false`
  - image-returning tool paths run through Pi's inline image resizer; images that cannot be resized into provider limits become text omission notes instead of `ImageContent`
  - `test/fixtures/subtly-corrupt-images.ipynb` covers valid-looking PNG base64 whose IDAT payload is not decodable, across inline markdown, output, and attachment paths
  - `notebook_summary` lists attachment keys in cell headers via `atts="key1 key2"` attribute
  - save path rewrites notebook JSON in Jupyter-style formatting: source as `string[]`, 1-space JSON indentation, trailing newline
- Tests split by layer:
  - `test/notebook-core.test.ts` covers parse/validation, pure cell ops, formatting helpers, load/save roundtrips, save formatting, and fixture-level core behavior
  - `test/notebook-*.tool.test.ts` keeps one file per tool for runner/output/selector behavior
  - `test/notebook-*.workflow.test.ts` keeps one file per multi-step workflow (write→read parity, no-id mutation flow, real-fixture edit/save)
  - current suite passes under `bun test` (71 tests)
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

- Package form: root-level Pi package, not only project-local `.pi/extensions`.
- Keep notebook operations in pure functions, extension glue thin.
- Start with small tool slices: read-only first, then mutation tools.
- No extra runtime deps for notebook parsing; use built-in JSON handling.

## Gaps

- Pi/manual verification is still light; most verification so far is tests plus local `bun run tool` smoke runs on real fixtures.
- `check` now runs type-checking plus Biome (`bun run typecheck && bun run biome:check`).
- `bun-types` is now installed and type-checking uses it directly.
- Notebook parse/summary/mutation code now satisfies stricter TS + current Biome without non-null assertions.
- Validation errors from Pi surface raw schema-validator messages instead of friendly allowed-value hints.
- Save/mutation path still normalizes notebook JSON shape/format on write, even though it now aims to match common Jupyter formatting.
- Mutation tools on no-id notebooks rely on index selectors; ids are not backfilled.
- Real notebook fixtures live in `test/fixtures/`.
- `PLAN.md` now holds the main actionable planning for adding VSCode/Jupyter-backed notebook execution through a same-repo companion bridge extension.
- Path normalization, mutation queueing, and mutation orchestration helper all implemented.
- `ensureCellIds`, `readCellsById`, and `readCellRange` removed from public interface.
